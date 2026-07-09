import { NextResponse } from 'next/server';
import { saveWaRequest } from '@/lib/wa-monitor/sheets';
import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SHEET_ID = process.env.GOOGLE_SHEETS_CONFIG_ID!;
const SHEET_NAME = 'WA_MONITOR_CONFIG';

// 5 min for testing → change to 2 * 24 * 60 * 60 * 1000 for production
const REMIND_DELAY_MS = 5 * 60 * 1000;

async function getConfig() {
  try {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:D` });
    const rows = (res.data.values || []) as string[][];
    const triggers: string[] = [];
    const instances: Record<string, { name: string; token: string }> = {};
    for (const row of rows.slice(1)) {
      if (row[0] === 'TRIGGER' && row[1]) triggers.push(row[1].toLowerCase());
      if (row[0] === 'INSTANCE' && row[1]) instances[row[1]] = { token: row[2] || '', name: row[3] || '' };
    }
    return { triggers, instances };
  } catch {
    return { triggers: ['запрос', 'follow'], instances: {} as Record<string, { name: string; token: string }> };
  }
}

function extractText(messageData: any): string {
  return (
    messageData?.textMessageData?.textMessage ||
    messageData?.extendedTextMessageData?.text ||
    messageData?.extendedTextMessageData?.description ||
    ''
  );
}

function extractQuoted(messageData: any): { text: string; participant: string } {
  const q = messageData?.quotedMessage;
  if (!q) return { text: '', participant: '' };
  const text =
    q.textMessageData?.textMessage ||
    q.extendedTextMessageData?.text ||
    q.extendedTextMessageData?.description ||
    '';
  // participant = phone of whoever wrote the quoted message
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

    const { triggers, instances } = await getConfig();
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

    // For outgoing (user replied): broker = whoever wrote the quoted message
    // For incoming (rare): broker = the sender
    let phone: string;
    let name: string;

    if (isOutgoing && quotedParticipant) {
      phone = quotedParticipant;
      name = body.senderData?.chatName || phone;
    } else {
      phone = (body.senderData?.sender || '').replace('@c.us', '').replace('@s.whatsapp.net', '') || 'unknown';
      name = body.senderData?.senderName || body.senderData?.chatName || phone;
    }

    const remindAt = new Date(Date.now() + REMIND_DELAY_MS);

    await saveWaRequest({
      instance: instanceId,
      instanceName: instanceCfg.name,
      phone,
      name,
      request: quotedText.slice(0, 1000),
      remindAt
    });

    return NextResponse.json({ ok: true, saved: true });
  } catch (e: any) {
    console.error('WA Monitor webhook error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
