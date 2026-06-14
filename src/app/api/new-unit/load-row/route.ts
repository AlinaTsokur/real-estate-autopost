import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';

const SHEETS_TO_SEARCH = ['Abu Dhabi'];

function stripAed(v: string): string {
  return v.replace(/\s*AED\s*/gi, '').replace(/\s+/g, ' ').trim();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code || !OBJECTS_ID) return NextResponse.json({ found: false });

  const normalCode = code.replace(/\s/g, '').toLowerCase();

  for (const sheetName of SHEETS_TO_SEARCH) {
    let rows: string[][];
    try {
      rows = (await getSheetData(OBJECTS_ID, sheetName)) as string[][];
    } catch {
      continue;
    }
    if (rows.length < 2) continue;

    const headers = rows[0].map(h => String(h).trim());
    const codeCol    = headers.findIndex(h => h === 'Код');
    const unitCol    = headers.findIndex(h => h === 'Unit');
    const origCol    = headers.findIndex(h => h === 'Original Price');
    const sellCol    = headers.findIndex(h => h === 'Selling Price');
    const agentCol   = headers.findIndex(h => h === 'Owner / Agent');

    if (codeCol === -1) continue;

    for (let i = 1; i < rows.length; i++) {
      const rowCode = String(rows[i][codeCol] ?? '').replace(/\s/g, '').toLowerCase();
      if (rowCode !== normalCode) continue;

      return NextResponse.json({
        found: true,
        unit:          unitCol  !== -1 ? String(rows[i][unitCol]  ?? '') : '',
        originalPrice: origCol  !== -1 ? stripAed(String(rows[i][origCol]  ?? '')) : '',
        sellingPrice:  sellCol  !== -1 ? stripAed(String(rows[i][sellCol]  ?? '')) : '',
        manager:       agentCol !== -1 ? String(rows[i][agentCol] ?? '') : '',
        sheet: sheetName,
      });
    }
  }

  return NextResponse.json({ found: false });
}
