import { Telegraf } from 'telegraf';

export function getBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return new Telegraf(token);
}

export async function sendMediaGroupWithCaption(
  chatId: string,
  mediaUrlsOrIds: { type: 'photo'; media: string | { source: Buffer } }[],
  captionHtml: string,
  unitCode: string
) {
  const bot = getBot();

  // Telegram allows caption only on the first media item
  const mediaGroup = mediaUrlsOrIds.map((m, index) => {
    if (index === 0) {
      return { ...m, caption: captionHtml, parse_mode: 'HTML' };
    }
    return m;
  });

  const message = await bot.telegram.sendMediaGroup(chatId, mediaGroup as any);
  
  // After sending media group, we can send a reply with inline buttons to approve/skip
  // We attach it to the first message of the group
  const firstMsgId = message[0].message_id;

  await bot.telegram.sendMessage(chatId, `Review post for ${unitCode}:`, {
    reply_parameters: { message_id: firstMsgId },
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approved', callback_data: `approve_${unitCode}` },
          { text: '⏭️ Skip', callback_data: `skip_${unitCode}` },
        ]
      ]
    }
  });

  return message;
}

export async function sendTextMessage(chatId: string, textHtml: string, unitCode?: string) {
  const bot = getBot();
  const msg = await bot.telegram.sendMessage(chatId, textHtml, { parse_mode: 'HTML' });
  
  if (unitCode) {
    await bot.telegram.sendMessage(chatId, `Review post for ${unitCode}:`, {
      reply_parameters: { message_id: msg.message_id },
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approved', callback_data: `approve_${unitCode}` },
            { text: '⏭️ Skip', callback_data: `skip_${unitCode}` },
          ]
        ]
      }
    });
  }
  return msg;
}
