import { NextResponse } from 'next/server';
import { getWaQueue, updateWaQueueItemStatus } from '@/lib/google/sheets';
import { downloadFromDrive } from '@/lib/google/drive';
import { sendWhatsAppImage, sendWhatsAppText } from '@/lib/whatsapp/green-api';

export async function POST() {
  try {
    const { config, items } = await getWaQueue();

    if (!config.wa_chatid) {
      return NextResponse.json({ error: 'wa_chatid не настроен' }, { status: 400 });
    }

    const toSend = items.filter(i => i.marked && i.status === 'WAITING');
    if (toSend.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: 'Нет отмеченных постов' });
    }

    await Promise.all(toSend.map(i => updateWaQueueItemStatus(i.rowIndex, 'SENT')));

    const results: { label: string; ok?: boolean; error?: string }[] = [];

    for (const item of toSend) {
      try {
        if (item.drive_file_id) {
          const buf = await downloadFromDrive(item.drive_file_id);
          await sendWhatsAppImage(config.wa_chatid, buf, item.wa_text);
        } else {
          await sendWhatsAppText(config.wa_chatid, item.wa_text);
        }
        results.push({ label: item.label, ok: true });
      } catch (e: any) {
        results.push({ label: item.label, error: e.message });
        await updateWaQueueItemStatus(item.rowIndex, 'WAITING');
      }
    }

    return NextResponse.json({ ok: true, sent: results.filter(r => r.ok).length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
