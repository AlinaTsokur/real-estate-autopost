import { NextResponse } from 'next/server';
import { getWaQueue, updateWaQueueItemStatus } from '@/lib/google/sheets';
import { downloadFromDrive } from '@/lib/google/drive';
import { sendWhatsAppImage, sendWhatsAppText } from '@/lib/whatsapp/green-api';

async function sendMarkedItems(chatId: string) {
  const { items } = await getWaQueue();
  const toSend = items.filter(i => i.marked && i.status === 'WAITING');

  if (toSend.length === 0) return { sent: 0, results: [] };

  // Mark as SENT immediately to prevent double-send
  await Promise.all(toSend.map(i => updateWaQueueItemStatus(i.rowIndex, 'SENT')));

  const results: { label: string; ok?: boolean; error?: string }[] = [];

  for (const item of toSend) {
    try {
      if (item.drive_file_id) {
        const buf = await downloadFromDrive(item.drive_file_id);
        await sendWhatsAppImage(chatId, buf, item.wa_text);
      } else {
        await sendWhatsAppText(chatId, item.wa_text);
      }
      results.push({ label: item.label, ok: true });
    } catch (e: any) {
      results.push({ label: item.label, error: e.message });
      await updateWaQueueItemStatus(item.rowIndex, 'WAITING');
    }
  }

  return { sent: results.filter(r => r.ok).length, results };
}

// Vercel cron — fires daily at 06:00 UTC = 10:00 Dubai
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { config } = await getWaQueue();
  if (!config.wa_chatid) {
    return NextResponse.json({ ok: true, skipped: 'wa_chatid not configured' });
  }

  const result = await sendMarkedItems(config.wa_chatid);
  return NextResponse.json({ ok: true, ...result });
}
