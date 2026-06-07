import { NextResponse } from 'next/server';
import { updatePublicationDate } from '@/lib/google/sheets';
import { getBot } from '@/lib/telegram/bot';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bot = getBot();

    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data; // e.g., 'approve_123' or 'skip_123'
      
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;

      if (data.startsWith('approve_')) {
        const code = data.replace('approve_', '');
        
        try {
          await updatePublicationDate(code);
          await bot.telegram.editMessageText(chatId, messageId, undefined, `✅ Approved and date updated for unit: ${code}`);
          await bot.telegram.answerCbQuery(cb.id, `Success: Date updated for ${code}`);
        } catch (e: any) {
          console.error(e);
          await bot.telegram.answerCbQuery(cb.id, `Error: ${e.message}`);
        }

      } else if (data.startsWith('skip_')) {
        const code = data.replace('skip_', '');
        await bot.telegram.editMessageText(chatId, messageId, undefined, `⏭️ Skipped unit: ${code}`);
        await bot.telegram.answerCbQuery(cb.id, `Skipped ${code}`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
