import { NextResponse } from 'next/server';
import { getWaQueue, deleteWaQueueRow } from '@/lib/google/sheets';
import { dispatchWaItem, isDue } from '@/lib/whatsapp/dispatch';

// Called by an external pinger (cron-job.org) every few minutes.
// Auth via Authorization header OR ?secret= query param.
// Sends every WAITING item whose scheduled time (Dubai) has arrived, then deletes it.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { config, items } = await getWaQueue();
  if (!config.wa_chatid) {
    return NextResponse.json({ ok: true, skipped: 'wa_chatid not configured' });
  }

  // Highest rowIndex first so deletions don't shift the rows we still need.
  const due = items
    .filter(i => i.status === 'WAITING' && i.scheduled_at && isDue(i.scheduled_at))
    .sort((a, b) => b.rowIndex - a.rowIndex);

  const results: { label: string; ok?: boolean; error?: string }[] = [];

  for (const item of due) {
    try {
      await dispatchWaItem(item, config.wa_chatid);
      await deleteWaQueueRow(item.rowIndex);
      results.push({ label: item.label, ok: true });
    } catch (e: any) {
      results.push({ label: item.label, error: e?.response?.data ? JSON.stringify(e.response.data) : e.message });
    }
  }

  return NextResponse.json({ ok: true, sent: results.filter(r => r.ok).length, results });
}
