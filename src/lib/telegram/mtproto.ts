import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

function createClient(sessionEnvVar: string) {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";
  const sessionStr = process.env[sessionEnvVar] || "";

  if (!apiId || !apiHash || !sessionStr) {
    throw new Error(`Missing MTProto credentials: ${sessionEnvVar}`);
  }

  return new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
    connectionRetries: 3,
  });
}

async function withClient<T>(fn: (client: TelegramClient) => Promise<T>, sessionEnvVar = "TELEGRAM_SESSION"): Promise<T> {
  const client = createClient(sessionEnvVar);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export interface SearchedPost {
  id: number;
  text: string;
  url: string;
  date?: string;
}

export async function searchOldPosts(priceStr: string): Promise<SearchedPost[]> {
  const chatId = process.env.TELEGRAM_SEARCH_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_SEARCH_CHAT_ID not configured");

  // Use bot session — avoids AUTH_KEY_DUPLICATED on Vercel (dynamic IPs conflict with personal session)
  return withClient(async (client) => {
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

          posts.push({ id: msg.id, text: msg.message, url, date: dateStr });
        }
      }
    }

    return posts;
  }, "TELEGRAM_SESSION");
}

async function resolvePeer(client: TelegramClient, chatId: string) {
  try {
    return await client.getInputEntity(chatId);
  } catch {
    const numId = Math.abs(Number(chatId));
    try { return await client.getInputEntity(`-100${numId}`); }
    catch { return chatId; }
  }
}

export async function sendMessage(chatId: string, text: string) {
  return withClient(async (client) => {
    const peer = await resolvePeer(client, chatId);
    await client.sendMessage(peer as any, { message: text });
  });
}

export async function forwardToChannel(fromChatId: string, messageIds: number[], toChatId: string): Promise<void> {
  return withClient(async (client) => {
    const from = await resolvePeer(client, fromChatId);
    const to = await resolvePeer(client, toChatId);
    await client.forwardMessages(to as any, {
      messages: messageIds,
      fromPeer: from as any,
      dropAuthor: true,
    });
  });
}

export async function sendDocument(chatId: string, fileBuffer: Buffer, filename: string, thumb?: Buffer | null) {
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pdfPath = join(tmpdir(), `tg-doc-${ts}.pdf`);
  const thumbPath = thumb ? join(tmpdir(), `tg-thumb-${ts}.jpg`) : undefined;

  await writeFile(pdfPath, fileBuffer);
  if (thumb && thumbPath) await writeFile(thumbPath, thumb);

  try {
    await withClient(async (client) => {
      await client.getDialogs({ limit: 100 });
      const peer = await resolvePeer(client, chatId);

      try {
        await client.sendFile(peer as any, {
          file: pdfPath,
          forceDocument: true,
          ...(thumbPath ? { thumb: thumbPath } : {}),
          attributes: [new Api.DocumentAttributeFilename({ fileName: filename })],
          caption: '',
          workers: 1,
        });
      } catch (e: any) {
        if (!thumbPath) throw e;
        await client.sendFile(peer as any, {
          file: pdfPath,
          forceDocument: true,
          attributes: [new Api.DocumentAttributeFilename({ fileName: filename })],
          caption: '',
          workers: 1,
        });
      }
    });
  } finally {
    await unlink(pdfPath).catch(() => {});
    if (thumbPath) await unlink(thumbPath).catch(() => {});
  }
}
