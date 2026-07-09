import { NextResponse } from 'next/server';
import { saveWaRequest } from '@/lib/wa-monitor/sheets';

// Instance config: add your colleague's instance here when ready
const INSTANCES: Record<string, { name: string; token: string }> = {
  [process.env.GREENAPI_ID_INSTANCE || '']: {
    name: 'Алина',
    token: process.env.GREENAPI_API_TOKEN || ''
  }
};

// Trigger words: if your REPLY contains any of these → save as request
const TRIGGER_WORDS = ['запрос', 'follow', 'фолоу', 'follow up'];

// Reminder delay: 5 min for testing, change to 2 * 24 * 60 * 60 * 1000 for production
const REMIND_DELAY_MS = 5 * 60 * 1000;

function extractText(messageData: any): string {
  return (
    messageData?.textMessageData?.textMessage ||
    messageData?.extendedTextMessageData?.text ||
    messageData?.extendedTextMessageData?.description ||
    ''
  );
}

function extractQuoted(messageData: any): string {
  const q = messageData?.quotedMessage;
  if (!q) return '';
  return (
    q.textMessageData?.textMessage ||
    q.extendedTextMessageData?.text ||
    q.extendedTextMessageData?.description ||
    ''
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Only handle incoming messages
    if (body.typeWebhook !== 'incomingMessageReceived') {
      return NextResponse.json({ ok: true, skipped: 'not incoming' });
    }

    const instanceId = String(body.instanceData?.idInstance || '');
    const instanceCfg = INSTANCES[instanceId];

    // Unknown instance → ignore (but don't error)
    if (!instanceCfg) {
      return NextResponse.json({ ok: true, skipped: 'unknown instance' });
    }

    const messageData = body.messageData;
    const myText = extractText(messageData).trim().toLowerCase();
    const quotedText = extractQuoted(messageData).trim();

    // Must be a reply with a trigger word and have quoted content
    const isTrigger = TRIGGER_WORDS.some(w => myText.includes(w));
    if (!isTrigger || !quotedText) {
      return NextResponse.json({ ok: true, skipped: 'no trigger or no quoted message' });
    }

    const phone = body.senderData?.sender?.replace('@c.us', '') || 'unknown';
    const name = body.senderData?.senderName || body.senderData?.chatName || phone;
    const remindAt = new Date(Date.now() + REMIND_DELAY_MS);

    await saveWaRequest({
      instance: instanceId,
      instanceName: instanceCfg.name,
      phone,
      name,
      request: quotedText.slice(0, 1000),
      remindAt
    });

    console.log(`WA Monitor: saved request from ${name} (${phone}), remind at ${remindAt.toISOString()}`);
    return NextResponse.json({ ok: true, saved: true });
  } catch (e: any) {
    console.error('WA Monitor webhook error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
