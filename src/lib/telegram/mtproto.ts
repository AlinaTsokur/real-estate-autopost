import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";

let clientInstance: TelegramClient | null = null;

export async function getMTProtoClient() {
  if (clientInstance) {
    return clientInstance;
  }

  const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";
  const sessionStr = process.env.TELEGRAM_SESSION || "";

  if (!apiId || !apiHash || !sessionStr) {
    throw new Error("Missing MTProto credentials (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION)");
  }

  const stringSession = new StringSession(sessionStr);
  
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();
  clientInstance = client;
  return client;
}

export interface SearchedPost {
  id: number;
  text: string;
  url: string;
  date?: string;
}

export async function searchOldPosts(priceStr: string): Promise<SearchedPost[]> {
  const client = await getMTProtoClient();
  const chatId = process.env.TELEGRAM_SEARCH_CHAT_ID;
  
  if (!chatId) {
    throw new Error("TELEGRAM_SEARCH_CHAT_ID not configured");
  }

  // Parse chat ID if it's numeric, otherwise pass as string (username)
  const peer = isNaN(Number(chatId)) ? chatId : parseInt(chatId);

  const result: any = await client.invoke(
    new Api.messages.Search({
      peer: peer as any,
      q: priceStr,
      filter: new Api.InputMessagesFilterEmpty(),
      minDate: 0,
      maxDate: 0,
      offsetId: 0,
      addOffset: 0,
      limit: 5,
      maxId: 0,
      minId: 0,
      hash: 0 as any,
    })
  );

  const posts: SearchedPost[] = [];
  
  if (result.messages && Array.isArray(result.messages)) {
    for (const msg of result.messages) {
      if (msg.message) {
        // Construct a generic URL if possible, or just the ID. 
        // For private channels (-100xxxx), the link format is https://t.me/c/xxxx/msgId
        let url = '';
        if (typeof chatId === 'string' && chatId.startsWith('-100')) {
          const cId = chatId.substring(4);
          url = `https://t.me/c/${cId}/${msg.id}`;
        } else {
          url = `https://t.me/${String(chatId).replace('@', '')}/${msg.id}`;
        }
        
        let dateStr = '';
        if (msg.date) {
          const d = new Date(msg.date * 1000);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yy = String(d.getFullYear()).slice(-2);
          dateStr = `${dd}/${mm}/${yy}`;
        }
        
        posts.push({
          id: msg.id,
          text: msg.message,
          url: url,
          date: dateStr
        });
      }
    }
  }

  return posts;
}
