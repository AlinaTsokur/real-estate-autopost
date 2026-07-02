import { NextResponse } from 'next/server';
import { getBot } from '@/lib/telegram/bot';

export async function POST(request: Request) {
  try {
    const { messageIds, chatId } = await request.json() as { messageIds: number[]; chatId: string };
    if (!messageIds?.length || !chatId) {
      return NextResponse.json({ error: 'messageIds and chatId required' }, { status: 400 });
    }

    const bot = getBot();
    const results = await Promise.allSettled(
      messageIds.map(id => bot.telegram.deleteMessage(chatId, id))
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    return NextResponse.json({ ok: true, deleted: messageIds.length - failed, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
