import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';
import { getChecked, setChecked, seedFromSheetIfEmpty } from '@/lib/post-meta/tracker';

export const dynamic = 'force-dynamic';

const SHEET_NAME = 'TRACKER';
const CELL = 'A1';

// Старое хранилище. Нужно ровно один раз — чтобы перенести текущие отметки
// в базу и больше к таблице не возвращаться.
async function readLegacySheet(): Promise<Record<string, boolean>> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) return {};
  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!${CELL}`,
  });
  const raw = res.data.values?.[0]?.[0];
  return raw ? JSON.parse(raw) : {};
}

export async function GET() {
  try {
    const checked = await seedFromSheetIfEmpty(readLegacySheet);
    return NextResponse.json({ checked });
  } catch (e: any) {
    return NextResponse.json({ checked: {}, error: e.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { checked } = await req.json();
    await setChecked(checked ?? {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// Оставлено для отладки: посмотреть, что сейчас в базе, без переноса из таблицы.
export async function HEAD() {
  const checked = await getChecked();
  return new NextResponse(null, { headers: { 'x-checked-count': String(Object.keys(checked).length) } });
}
