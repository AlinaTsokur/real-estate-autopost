import { Telegraf } from 'telegraf';

import axios from 'axios';
import FormData from 'form-data';

export function getBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return new Telegraf(token);
}

export async function sendMediaGroupWithCaption(
  chatId: string,
  mediaUrlsOrIds: { type: 'photo'; media: string | { source: Buffer, filename?: string } }[],
  captionHtml: string,
  unitCode: string
) {
  const bot = getBot();

  const formData = new FormData();
  formData.append('chat_id', chatId);
  
  const mediaArray: any[] = [];
  mediaUrlsOrIds.forEach((m, index) => {
    let mediaStr = '';
    if (typeof m.media === 'string') {
      mediaStr = m.media;
    } else {
      const attachName = `photo${index}`;
      formData.append(attachName, m.media.source, { 
        filename: m.media.filename || `image${index}.jpg`,
        contentType: 'image/jpeg'
      });
      mediaStr = `attach://${attachName}`;
    }
    
    const mediaItem: any = { type: 'photo', media: mediaStr };
    if (index === 0) {
      mediaItem.caption = captionHtml;
      mediaItem.parse_mode = 'HTML';
    }
    mediaArray.push(mediaItem);
  });
  
  formData.append('media', JSON.stringify(mediaArray));
  
  const res = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMediaGroup`, formData, {
    headers: formData.getHeaders()
  });
  const message = res.data.result;

  const firstMsgId = message[0].message_id;
  const ids: number[] = message.map((m: any) => m.message_id);

  const reviewMsg = await bot.telegram.sendMessage(chatId, `Review post for ${unitCode}:`, {
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
  ids.push(reviewMsg.message_id);

  return { message, ids };
}

export async function sendTextMessage(chatId: string, textHtml: string, unitCode?: string) {
  const bot = getBot();
  const msg = await bot.telegram.sendMessage(chatId, textHtml, { parse_mode: 'HTML' });
  const ids: number[] = [msg.message_id];

  if (unitCode) {
    const reviewMsg = await bot.telegram.sendMessage(chatId, `Review post for ${unitCode}:`, {
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
    ids.push(reviewMsg.message_id);
  }
  return { msg, ids };
}

export async function sendPlainTextMessage(chatId: string, text: string) {
  const bot = getBot();
  const msg = await bot.telegram.sendMessage(chatId, text);
  return { msg, ids: [msg.message_id] };
}

export async function sendPhoto(chatId: string, source: Buffer, caption: string) {
  const bot = getBot();
  const msg = await bot.telegram.sendPhoto(chatId, { source }, { caption });
  return { msg, ids: [msg.message_id] };
}
