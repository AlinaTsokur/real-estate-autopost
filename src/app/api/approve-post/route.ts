import { NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';
const SHEET_GID = 1747337860;

// #d9ead3 → RGB (0–1): 217/255, 234/255, 211/255
const APPROVED_COLOR = { red: 217 / 255, green: 234 / 255, blue: 211 / 255 };

function normalize(v: unknown): string {
  return String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const { unit, code } = await req.json() as { unit?: string; code?: string };
    if (!unit && !code) return NextResponse.json({ error: 'unit or code required' }, { status: 400 });
    if (!SPREADSHEET_ID) return NextResponse.json({ error: 'GOOGLE_SHEETS_OBJECTS_ID not set' }, { status: 500 });

    const sheets = await getGoogleSheetsClient();

    // Resolve sheet name from GID
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' });
    const sheetProps = meta.data.sheets?.find(s => s.properties?.sheetId === SHEET_GID)?.properties;
    if (!sheetProps) return NextResponse.json({ error: `Sheet with GID ${SHEET_GID} not found` }, { status: 404 });
    const sheetName = sheetProps.title ?? '';

    // Load sheet data to find the row
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetName });
    const rows = res.data.values ?? [];
    if (rows.length < 2) return NextResponse.json({ error: 'Sheet is empty' }, { status: 404 });

    const headers = (rows[0] ?? []).map((h: unknown) => String(h).trim().toLowerCase());
    const unitCol = headers.indexOf('unit');
    const codeCol = headers.findIndex(h => h === 'код' || h === 'code');

    const targetCode = normalize(code);
    const targetUnit = normalize(unit);

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const rowCode = normalize(r[codeCol]);
      const rowUnit = normalize(r[unitCol]);

      const matchCode = targetCode && rowCode && rowCode === targetCode;
      const matchUnit = targetUnit && rowUnit && rowUnit === targetUnit;
      if (matchCode || matchUnit) { rowIndex = i; break; }
    }

    if (rowIndex === -1) return NextResponse.json({ error: `Unit not found: code=${code} unit=${unit}` }, { status: 404 });

    // Color the entire row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: SHEET_GID,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
            },
            cell: {
              userEnteredFormat: { backgroundColor: APPROVED_COLOR },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        }],
      },
    });

    return NextResponse.json({ ok: true, row: rowIndex + 1, sheet: sheetName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
