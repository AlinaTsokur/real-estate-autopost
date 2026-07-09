import { NextResponse } from 'next/server';
import { saveWaRequest } from '@/lib/wa-monitor/sheets';
import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SHEET_ID = process.env.GOOGLE_SHEETS_CONFIG_ID!;
const SHEET_NAME = 'WA_MONITOR_CONFIG';

// Reminder delay: 5 min for testing, change to 2 * 24 * 60 * 60 * 1000 for production
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

    if (body.typeWebhook !== 'incomingMessageReceived') {
      return NextResponse.json({ ok: true, skipped: 'not incoming' });
    }

    const { triggers, instances } = await getConfig();
    const instanceId = String(body.instanceData?.idInstance || '');
    const instanceCfg = instances[instanceId];

    if (!instanceCfg) {
      return NextResponse.json({ ok: true, skipped: 'unknown instance' });
    }

    const messageData = body.messageData;
    const myText = extractText(messageData).trim().toLowerCase();
    const quotedText = extractQuoted(messageData).trim();

    const isTrigger = triggers.some(w => myText.includes(w));
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

    return NextResponse.json({ ok: true, saved: true });
  } catch (e: any) {
    console.error('WA Monitor webhook error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
