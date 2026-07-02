import { NextResponse } from 'next/server';
import { approveUnitRow } from '@/lib/google/sheets';
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
          const result = await approveUnitRow(code);
          await bot.telegram.editMessageText(chatId, messageId, undefined, `✅ Approved: строка ${result.row} закрашена зелёным (#${code})`);
          await bot.telegram.answerCbQuery(cb.id, `✅ Готово — строка ${result.row}`);

          const heart = [{ type: 'emoji', emoji: '❤' }];
          // React on the review message itself
          await (bot.telegram as any).callApi('setMessageReaction', { chat_id: chatId, message_id: messageId, reaction: heart });
          // React on the original post (the message the review replied to)
          const originalMsgId = cb.message.reply_to_message?.message_id;
          if (originalMsgId) {
            await (bot.telegram as any).callApi('setMessageReaction', { chat_id: chatId, message_id: originalMsgId, reaction: heart });
            await bot.telegram.deleteMessage(chatId, originalMsgId);
          }
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
