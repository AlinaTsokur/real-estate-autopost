import { NextResponse } from 'next/server';
import { getWaQueue, updateWaQueueItemStatus, updateWaQueueConfig } from '@/lib/google/sheets';
import { downloadFromDrive } from '@/lib/google/drive';
import { sendWhatsAppImage, sendWhatsAppText } from '@/lib/whatsapp/green-api';

// Dubai = UTC+4, no DST
function getDubaiNow(): Date {
  return new Date(Date.now() + 4 * 60 * 60 * 1000);
}

// Parse "2026-06-28 10:30" (Dubai time) → UTC Date
function parseScheduledAt(s: string): Date | null {
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
  if (!m) return null;
  return new Date(`${m[1]}T${m[2]}:00+04:00`);
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { config, items } = await getWaQueue();

  if (!config.scheduled_at || !config.wa_chatid) {
    return NextResponse.json({ ok: true, skipped: 'no schedule' });
  }

  const scheduledDt = parseScheduledAt(config.scheduled_at);
  if (!scheduledDt) {
    return NextResponse.json({ ok: true, skipped: 'invalid scheduled_at format' });
  }

  if (new Date() < scheduledDt) {
    const dubaiNow = getDubaiNow();
    return NextResponse.json({
      ok: true,
      skipped: 'not yet',
      dubaiNow: `${String(dubaiNow.getUTCHours()).padStart(2,'0')}:${String(dubaiNow.getUTCMinutes()).padStart(2,'0')}`,
      scheduledAt: config.scheduled_at,
    });
  }

  const toSend = items.filter(i => i.marked && i.status === 'WAITING');
  if (toSend.length === 0) {
    // Clear schedule to prevent re-checking
    await updateWaQueueConfig(config.configRowIndex, '', config.wa_chatid);
    return NextResponse.json({ ok: true, skipped: 'nothing marked' });
  }

  // Mark all as SENT immediately to prevent double-send on retry
  await Promise.all(toSend.map(i => updateWaQueueItemStatus(i.rowIndex, 'SENT')));

  // Clear scheduled_at so cron doesn't re-trigger next hour
  await updateWaQueueConfig(config.configRowIndex, '', config.wa_chatid);

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
      // Revert status so user can retry
      await updateWaQueueItemStatus(item.rowIndex, 'WAITING');
    }
  }

  return NextResponse.json({ ok: true, sent: results.filter(r => r.ok).length, results });
}
