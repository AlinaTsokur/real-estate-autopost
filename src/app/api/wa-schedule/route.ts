import { NextResponse } from 'next/server';
import {
  getWaQueue,
  updateWaQueueItemSchedule,
  updateWaQueueConfig,
  deleteWaQueueRow,
} from '@/lib/google/sheets';
import { dispatchWaItem } from '@/lib/whatsapp/dispatch';

export async function GET() {
  try {
    const data = await getWaQueue();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Set/clear a per-post scheduled time
    if (body.action === 'schedule') {
      const { rowIndex, scheduledAt } = body as { rowIndex: number; scheduledAt: string };
      await updateWaQueueItemSchedule(rowIndex, scheduledAt || '');
      return NextResponse.json({ ok: true });
    }

    // Manually send one post right now, then remove it from the queue
    if (body.action === 'send-one') {
      const { rowIndex } = body as { rowIndex: number };
      const { config, items } = await getWaQueue();
      if (!config.wa_chatid) return NextResponse.json({ error: 'Chat ID не настроен' }, { status: 400 });

      const item = items.find(i => i.rowIndex === rowIndex);
      if (!item) return NextResponse.json({ error: 'Пост не найден' }, { status: 404 });

      try {
        await dispatchWaItem(item, config.wa_chatid);
      } catch (e: any) {
        const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
        return NextResponse.json({ error: detail }, { status: 500 });
      }
      await deleteWaQueueRow(rowIndex);
      return NextResponse.json({ ok: true });
    }

    // Delete a post from the queue without sending
    if (body.action === 'delete') {
      const { rowIndex } = body as { rowIndex: number };
      await deleteWaQueueRow(rowIndex);
      return NextResponse.json({ ok: true });
    }

    // Save the WhatsApp chat id
    if (body.action === 'config') {
      const { configRowIndex, waChatId } = body as { configRowIndex: number; waChatId: string };
      await updateWaQueueConfig(configRowIndex, waChatId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
