import { NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SHEET_ID = process.env.GOOGLE_SHEETS_CONFIG_ID!;
const SHEET_NAME = 'WA_MONITOR_CONFIG';

async function ensureSheet() {
  const sheets = await getGoogleSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const exists = meta.data.sheets?.some(s => s.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
    });
    // Seed defaults
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['SECTION', 'VALUE1', 'VALUE2'],
          ['TRIGGER', 'запрос', ''],
          ['TRIGGER', 'follow', ''],
          ['TRIGGER', 'follow up', ''],
          ['INSTANCE', process.env.GREENAPI_ID_INSTANCE || '', process.env.GREENAPI_API_TOKEN || '', 'Алина'],
        ]
      }
    });
  }
}

async function readConfig() {
  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:D` });
  const rows = (res.data.values || []) as string[][];
  const triggers: string[] = [];
  const instances: { id: string; token: string; name: string }[] = [];
  for (const row of rows.slice(1)) {
    if (row[0] === 'TRIGGER' && row[1]) triggers.push(row[1]);
    if (row[0] === 'INSTANCE' && row[1]) instances.push({ id: row[1], token: row[2] || '', name: row[3] || '' });
  }
  return { triggers, instances };
}

export async function GET() {
  try {
    await ensureSheet();
    const config = await readConfig();
    return NextResponse.json(config);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { triggers, instances } = await request.json();
    const sheets = await getGoogleSheetsClient();

    const rows: string[][] = [['SECTION', 'VALUE1', 'VALUE2', 'VALUE3']];
    for (const t of triggers) if (t.trim()) rows.push(['TRIGGER', t.trim(), '', '']);
    for (const i of instances) if (i.id.trim()) rows.push(['INSTANCE', i.id.trim(), i.token.trim(), i.name.trim()]);

    // Clear and rewrite
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:D` });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
