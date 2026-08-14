import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';

const PERMIT_SHEET_ID = '1VZGmGNmUTYBk23b_CnPkNLLo9hlk2DOleLhqf_YoZ9g';
const PERMIT_SHEET_NAME = 'Prime Bridge';
const SKIP_STATUSES = ['архив', 'снято с продажи'];

function todayUAE(): string {
  // UAE = UTC+4
  const now = new Date();
  const uae = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const d = uae.getUTCDate().toString().padStart(2, '0');
  const m = (uae.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = uae.getUTCFullYear();
  return `${d}.${m}.${y}`;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayUAE();

  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: PERMIT_SHEET_ID,
    range: `${PERMIT_SHEET_NAME}!A:J`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return NextResponse.json({ ok: true, sent: 0 });

  const headers = (rows[0] ?? []).map((h: string) => String(h).trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name.toLowerCase());

  const unitCol   = col('юнит');
  const codeCol   = col('код');
  const statusCol = col('статус');
  const dateCol   = col('дата окончания');

  const expiring = rows.slice(1).filter(row => {
    const status = String(row[statusCol] ?? '').trim().toLowerCase();
    if (SKIP_STATUSES.includes(status)) return false;
    const expDate = String(row[dateCol] ?? '').trim();
    return expDate === today;
  });

  if (expiring.length === 0) return NextResponse.json({ ok: true, sent: 0, today });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REVIEW_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram not configured');

  for (const row of expiring) {
    const unit = String(row[unitCol] ?? '').trim();
    const code = String(row[codeCol] ?? '').trim();

    const text =
      `⚠️ <b>Истекает пермит сегодня</b>\n\n` +
      `Юнит: <b>${unit}</b>\n` +
      `Код: <b>${code}</b>\n\n` +
      `@dariaksn`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  }

  return NextResponse.json({ ok: true, sent: expiring.length, today });
}
