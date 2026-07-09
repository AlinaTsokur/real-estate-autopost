import { NextResponse } from 'next/server';
import { saveWaRequest, getProcessedIds, markProcessed } from '@/lib/wa-monitor/sheets';
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
    const instances: { id: string; token: string; name: string }[] = [];
    for (const row of rows.slice(1)) {
      if (row[0] === 'TRIGGER' && row[1]) triggers.push(row[1].toLowerCase());
      if (row[0] === 'INSTANCE' && row[1]) instances.push({ id: row[1], token: row[2] || '', name: row[3] || '' });
    }
    return { triggers, instances };
  } catch {
    return { triggers: ['запрос', 'follow', 'фидбэк', 'feedback'], instances: [] };
  }
}

function extractText(msg: any): string {
  return (
    msg?.textMessage ||
    msg?.extendedTextMessage?.text ||
    msg?.caption ||
    ''
  );
}

function extractQuoted(msg: any): { text: string; participant: string } {
  const q = msg?.quotedMessage;
  if (!q) return { text: '', participant: '' };
  const text =
    q.textMessage ||
    q.extendedTextMessage?.text ||
    q.caption ||
    '';
  const participant = (q.participant || q.stanzaId?.split('@')?.[0] || '').replace('@c.us', '').replace('@s.whatsapp.net', '');
  return { text, participant };
}

async function fetchOutgoingMessages(instanceId: string, token: string) {
  try {
    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/lastOutgoingMessages/${token}`);
    if (!res.ok) return [];
    return await res.json() as any[];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const { triggers, instances } = await getConfig();
    if (!instances.length || !triggers.length) {
      return NextResponse.json({ ok: true, skipped: 'no instances or triggers configured' });
    }

    const processedIds = await getProcessedIds();
    let saved = 0;

    for (const inst of instances) {
      const messages = await fetchOutgoingMessages(inst.id, inst.token);

      for (const msg of messages) {
        const msgId = msg.idMessage;
        if (!msgId || processedIds.has(msgId)) continue;

        const text = extractText(msg).toLowerCase();
        const { text: quotedText, participant } = extractQuoted(msg);

        const isTrigger = triggers.some(w => text.includes(w));
        if (!isTrigger || !quotedText) {
          // Mark as processed so we don't re-check it every minute
          await markProcessed(msgId);
          continue;
        }

        const chatId = msg.chatId || '';
        const phone = participant || chatId.replace('@c.us', '').replace('@g.us', '').replace('@s.whatsapp.net', '');
        const name = phone;
        const remindAt = new Date(Date.now() + REMIND_DELAY_MS);

        await saveWaRequest({
          instance: inst.id,
          instanceName: inst.name,
          phone,
          name,
          request: quotedText.slice(0, 1000),
          remindAt
        });
        await markProcessed(msgId);
        saved++;
      }
    }

    return NextResponse.json({ ok: true, saved });
  } catch (e: any) {
    console.error('WA Monitor poll error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
