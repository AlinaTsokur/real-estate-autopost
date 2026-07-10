import { NextResponse } from 'next/server';
import { saveWaRequest, getConfig } from '@/lib/wa-monitor/sheets';

// 5 min for testing → change to 2 * 24 * 60 * 60 * 1000 for production
const REMIND_DELAY_MS = 5 * 60 * 1000;

// Config as a { triggers[], instances: map } shape for the webhook.
async function loadConfig() {
  try {
    const { triggers, instances } = await getConfig();
    const map: Record<string, { name: string; token: string }> = {};
    for (const i of instances) map[i.id] = { name: i.name, token: i.token };
    return { triggers: triggers.map(t => t.toLowerCase()), instances: map };
  } catch {
    return { triggers: ['запрос', 'follow'], instances: {} as Record<string, { name: string; token: string }> };
  }
}

// Resolve a contact's name as saved in the WhatsApp phone contacts (falls back to pushname).
async function getContactName(instanceId: string, token: string, chatId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/getContactInfo/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.contactName || d.name || '';
  } catch {
    return '';
  }
}

// Field structure verified empirically against real Green API notifications.
// A quoted reply has typeMessage='quotedMessage', my text in extendedTextMessageData.text,
// and the broker's original in quotedMessage.textMessage / .extendedTextMessage.text.
function extractText(messageData: any): string {
  return (
    messageData?.extendedTextMessageData?.text ||
    messageData?.textMessageData?.textMessage ||
    messageData?.extendedTextMessageData?.description ||
    ''
  );
}

function extractQuoted(messageData: any): { text: string; participant: string } {
  const q = messageData?.quotedMessage;
  if (!q) return { text: '', participant: '' };
  const text =
    q.textMessage ||
    q.extendedTextMessage?.text ||
    q.extendedTextMessageData?.text ||
    q.textMessageData?.textMessage ||
    q.caption ||
    '';
  // participant = phone of whoever wrote the quoted message (the broker)
  const participant = (q.participant || '').replace('@c.us', '').replace('@s.whatsapp.net', '');
  return { text, participant };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // We listen to OUTGOING messages — that's when Alina/colleague replies with trigger word
    // Also support incoming in case someone else sends the trigger (edge case)
    const isOutgoing = body.typeWebhook === 'outgoingMessageReceived';
    const isIncoming = body.typeWebhook === 'incomingMessageReceived';
    console.log('WA webhook type:', body.typeWebhook, 'instance:', body.instanceData?.idInstance);
    if (!isOutgoing && !isIncoming) {
      return NextResponse.json({ ok: true, skipped: 'not a message', type: body.typeWebhook });
    }

    const { triggers, instances } = await loadConfig();
    const instanceId = String(body.instanceData?.idInstance || '');
    const instanceCfg = instances[instanceId];
    console.log('WA instance check:', instanceId, 'known:', Object.keys(instances));

    if (!instanceCfg) {
      return NextResponse.json({ ok: true, skipped: 'unknown instance', instanceId, known: Object.keys(instances) });
    }

    const messageData = body.messageData;
    const myText = extractText(messageData).trim().toLowerCase();
    const { text: quotedText, participant: quotedParticipant } = extractQuoted(messageData);
    console.log('WA text:', myText, '| quoted:', quotedText?.slice(0, 50), '| triggers:', triggers);

    const isTrigger = triggers.some(w => myText.includes(w));
    if (!isTrigger || !quotedText) {
      return NextResponse.json({ ok: true, skipped: 'no trigger or no quoted message', myText, hasQuoted: !!quotedText });
    }

    // Broker = whoever wrote the quoted message.
    // Direct chat: the chat itself is the broker. Group: broker = quoted participant, keep group name.
    const chatId: string = body.senderData?.chatId || '';
    const isGroup = chatId.endsWith('@g.us');

    let phone: string;
    let brokerChatId: string;
    let chat = ''; // group name (empty for direct chats)

    if (isGroup) {
      chat = body.senderData?.chatName || '';
      phone = quotedParticipant || '';
      brokerChatId = phone ? `${phone}@c.us` : '';
    } else {
      phone = chatId.replace('@c.us', '').replace('@s.whatsapp.net', '')
        || quotedParticipant
        || (body.senderData?.sender || '').replace('@c.us', '').replace('@s.whatsapp.net', '')
        || 'unknown';
      brokerChatId = chatId || (phone !== 'unknown' ? `${phone}@c.us` : '');
    }

    // Resolve the broker's name as saved in WhatsApp contacts.
    let name = phone;
    if (brokerChatId) {
      const resolved = await getContactName(instanceId, instanceCfg.token, brokerChatId);
      if (resolved) name = resolved;
      else if (!isGroup && body.senderData?.chatName) name = body.senderData.chatName;
    }

    const remindAt = new Date(Date.now() + REMIND_DELAY_MS);

    await saveWaRequest({
      instance: instanceId,
      instanceName: instanceCfg.name,
      phone,
      name,
      request: quotedText.slice(0, 1000),
      remindAt,
      chat
    });

    return NextResponse.json({ ok: true, saved: true });
  } catch (e: any) {
    console.error('WA Monitor webhook error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
