import { NextResponse } from 'next/server';
import { getWaQueue, deleteWaQueueItemById } from '@/lib/wa-queue/store';
import { dispatchWaItem, isDue } from '@/lib/whatsapp/dispatch';
import { getInstanceState } from '@/lib/whatsapp/green-api';

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

  // Don't auto-send while WhatsApp is restricted (yellow card) — it only worsens the ban.
  const state = await getInstanceState().catch(() => 'unknown');
  if (state !== 'authorized') {
    return NextResponse.json({ ok: true, skipped: `state=${state}` });
  }

  // Порядок больше не важен: у записи постоянный id, удаление соседа её не сдвигает.
  const due = items.filter(i => i.status === 'WAITING' && i.scheduled_at && isDue(i.scheduled_at));

  const results: { label: string; ok?: boolean; error?: string }[] = [];

  for (const item of due) {
    try {
      const chatId = item.item_chatid || config.wa_chatid;
      await dispatchWaItem(item, chatId);
      await deleteWaQueueItemById(item.id);
      results.push({ label: item.label, ok: true });
    } catch (e: any) {
      results.push({ label: item.label, error: e?.response?.data ? JSON.stringify(e.response.data) : e.message });
    }
  }

  return NextResponse.json({ ok: true, sent: results.filter(r => r.ok).length, results });
}
