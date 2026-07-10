import { NextResponse } from 'next/server';
import { approveUnitRow, getWaQueue, deleteWaQueueRow } from '@/lib/google/sheets';
import { getBot } from '@/lib/telegram/bot';
import { dispatchWaItem } from '@/lib/whatsapp/dispatch';
import { getInstanceState } from '@/lib/whatsapp/green-api';
import { forwardToChannel } from '@/lib/telegram/mtproto';

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

        // Acknowledge the tap IMMEDIATELY so mobile Telegram doesn't time out
        // (Google Sheets work below can take several seconds).
        await bot.telegram.answerCbQuery(cb.id, '⏳ Обрабатываю…').catch(() => {});

        try {
          const result = await approveUnitRow(code);
          await bot.telegram.editMessageText(chatId, messageId, undefined, `✅ Approved: строка ${result.row} закрашена зелёным (#${code})`);

          const heart = [{ type: 'emoji', emoji: '❤' }];
          await (bot.telegram as any).callApi('setMessageReaction', { chat_id: chatId, message_id: messageId, reaction: heart });

          // WA photo/text is the last ID in the ids: line (not main_ids:)
          const reviewText = cb.message.text || '';
          const idsMatch = reviewText.match(/\nids:([\d,]+)/);
          if (idsMatch) {
            const allIds = idsMatch[1].split(',').map(Number);
            const waPhotoId = allIds[allIds.length - 1];
            await bot.telegram.deleteMessage(chatId, waPhotoId).catch(() => {});
          }
        } catch (e: any) {
          console.error('approve error:', e);
          // Callback already answered; surface the error in the message instead.
          await bot.telegram.editMessageText(chatId, messageId, undefined, `❌ Ошибка approve (#${code}): ${e.message}`).catch(() => {});
        }

      } else if (data.startsWith('delete_')) {
        try {
          const reviewText = cb.message.text || '';
          const idsMatch = reviewText.match(/\nids:([\d,]+)/);
          const allIds: number[] = idsMatch
            ? idsMatch[1].split(',').map(Number)
            : [];
          allIds.push(messageId);
          await Promise.allSettled(allIds.map((id: number) => bot.telegram.deleteMessage(chatId, id)));
          await bot.telegram.answerCbQuery(cb.id, '🗑 Пост удалён');
        } catch (e: any) {
          await bot.telegram.answerCbQuery(cb.id, `Ошибка: ${e.message}`);
        }

      } else if (data.startsWith('wa_')) {
        const code = data.replace('wa_', '');
        // Acknowledge immediately so mobile Telegram doesn't time out during the send.
        await bot.telegram.answerCbQuery(cb.id, '⏳ Отправляю в WhatsApp…').catch(() => {});
        const reply = (text: string) =>
          bot.telegram.sendMessage(chatId, text, { reply_parameters: { message_id: messageId } }).catch(() => {});
        try {
          const state = await getInstanceState().catch(() => 'unknown');
          if (state !== 'authorized') {
            await reply(`❌ WhatsApp не подключён (${state})`);
            return NextResponse.json({ ok: true });
          }
          const { config, items } = await getWaQueue();
          if (!config.wa_chatid) {
            await reply('❌ WA Chat ID не настроен');
            return NextResponse.json({ ok: true });
          }
          const item = items.find(i => i.label.includes(code));
          if (!item) {
            await reply('❌ Пост не найден в очереди WA');
            return NextResponse.json({ ok: true });
          }
          await dispatchWaItem(item, config.wa_chatid);
          await deleteWaQueueRow(item.rowIndex);
          await reply('✅ Отправлено в WhatsApp');
        } catch (e: any) {
          await reply(`❌ WA ошибка: ${e.message}`);
        }

      } else if (data.startsWith('tg_')) {
        // Acknowledge immediately so mobile Telegram doesn't time out during the forward.
        await bot.telegram.answerCbQuery(cb.id, '⏳ Отправляю в TG канал…').catch(() => {});
        const reply = (text: string) =>
          bot.telegram.sendMessage(chatId, text, { reply_parameters: { message_id: messageId } }).catch(() => {});
        const channelId = process.env.TELEGRAM_CHANNEL_ID;
        if (!channelId) {
          await reply('❌ TELEGRAM_CHANNEL_ID не настроен');
          return NextResponse.json({ ok: true });
        }
        try {
          const reviewText = cb.message.text || '';
          const mainMatch = reviewText.match(/main_ids:([\d,]+)/);
          const idsMatch = reviewText.match(/\nids:([\d,]+)/);
          const sourceIds: number[] = mainMatch
            ? mainMatch[1].split(',').map(Number)
            : idsMatch ? idsMatch[1].split(',').map(Number).slice(0, -2) : [];

          if (!sourceIds.length) {
            await reply('❌ Нет ID сообщений');
            return NextResponse.json({ ok: true });
          }

          await forwardToChannel(String(chatId), sourceIds, channelId);

          await reply('✅ Отправлено в TG канал');
        } catch (e: any) {
          await reply(`❌ TG ошибка: ${e.message}`);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
