import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SHEET_NAME = 'TRACKER';
const CELL = 'A1';

async function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!id) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  return id;
}

async function ensureSheet(sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const exists = meta.data.sheets?.some(s => s.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
  }
}

export async function GET() {
  try {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getGoogleSheetsClient();
    await ensureSheet(sheets, spreadsheetId);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!${CELL}`,
    });

    const raw = res.data.values?.[0]?.[0];
    const checked: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    return NextResponse.json({ checked });
  } catch (e: any) {
    return NextResponse.json({ checked: {}, error: e.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { checked } = await req.json();
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getGoogleSheetsClient();
    await ensureSheet(sheets, spreadsheetId);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!${CELL}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[JSON.stringify(checked)]] },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
