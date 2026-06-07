import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

let client: TelegramClient | null = null;

export async function getMTProtoClient() {
  if (client) return client;

  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const sessionString = process.env.TELEGRAM_SESSION || '';

  if (!apiId || !apiHash || !sessionString) {
    throw new Error('Telegram MTProto credentials (API_ID, API_HASH, SESSION) missing in .env');
  }

  const stringSession = new StringSession(sessionString);
  client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  return client;
}

export async function searchOldPost(originalPrice: string | number, projectName: string) {
  const c = await getMTProtoClient();
  const chatId = process.env.TELEGRAM_SEARCH_CHAT_ID;
  
  if (!chatId) throw new Error('TELEGRAM_SEARCH_CHAT_ID not configured');

  const priceStr = String(originalPrice).replace(/\\s+/g, '');
  // Format variants: 2743700, 2.743.700, 2,743,700, 2 743 700
  const priceFormatted = new Intl.NumberFormat('de-DE').format(Number(priceStr));
  
  const searchQueries = [
    `${priceFormatted} ${projectName}`,
    `${priceStr} ${projectName}`,
    priceFormatted,
    priceStr,
  ];

  let messages: any[] = [];
  
  for (const query of searchQueries) {
    const result = await c.getMessages(chatId, { search: query, limit: 5 });
    if (result.length > 0) {
      messages = result;
      break;
    }
  }

  // Find message link format for a group/channel
  // Telegram link is usually https://t.me/c/chat_id/msg_id
  const cleanChatId = chatId.replace('-100', '');

  return messages.map(m => ({
    id: m.id,
    text: m.message,
    date: new Date(m.date * 1000).toISOString(),
    link: `https://t.me/c/${cleanChatId}/${m.id}`
  }));
}
