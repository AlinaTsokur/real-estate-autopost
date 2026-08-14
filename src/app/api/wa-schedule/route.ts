import { NextResponse } from 'next/server';
import {
  getWaQueue,
  updateWaQueueItemSchedule,
  updateWaQueueConfig,
  deleteWaQueueItemById,
  deleteWaQueueItems,
} from '@/lib/wa-queue/store';
import { dispatchWaItem } from '@/lib/whatsapp/dispatch';
import { getInstanceState } from '@/lib/whatsapp/green-api';

// Отправка одного поста тянет фото из Drive и грузит его в Green API —
// дефолтных секунд на это не хватает.
export const maxDuration = 120;

export async function GET() {
  try {
    const data = await getWaQueue();
    const state = await getInstanceState().catch(() => 'unknown');
    return NextResponse.json({ ...data, state });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Set/clear a per-post scheduled time
    if (body.action === 'schedule') {
      const { id, scheduledAt } = body as { id: string; scheduledAt: string };
      await updateWaQueueItemSchedule(id, scheduledAt || '');
      return NextResponse.json({ ok: true });
    }

    // Manually send one post right now, then remove it from the queue
    if (body.action === 'send-one') {
      const { id } = body as { id: string };
      const { config, items } = await getWaQueue();
      if (!config.wa_chatid) return NextResponse.json({ error: 'Chat ID не настроен' }, { status: 400 });

      const item = items.find(i => i.id === id);
      if (!item) return NextResponse.json({ error: 'Пост не найден' }, { status: 404 });

      const state = await getInstanceState().catch(() => 'unknown');
      if (state !== 'authorized') {
        return NextResponse.json({ error: `WhatsApp не готов (статус: ${state}). Отправка заблокирована.` }, { status: 409 });
      }

      try {
        await dispatchWaItem(item, config.wa_chatid);
      } catch (e: any) {
        const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
        return NextResponse.json({ error: detail }, { status: 500 });
      }
      await deleteWaQueueItemById(id);
      return NextResponse.json({ ok: true });
    }

    // Delete a post from the queue without sending
    if (body.action === 'delete') {
      const { id } = body as { id: string };
      await deleteWaQueueItemById(id);
      return NextResponse.json({ ok: true });
    }

    // Clear the whole queue. Настройка чата лежит отдельной таблицей, так что
    // чистка очереди её не задевает.
    if (body.action === 'clear-all') {
      const { items } = await getWaQueue();
      const cleared = await deleteWaQueueItems(items.map(i => i.id));
      return NextResponse.json({ ok: true, cleared });
    }

    // Save the WhatsApp chat id
    if (body.action === 'config') {
      const { waChatId } = body as { waChatId: string };
      await updateWaQueueConfig(waChatId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
