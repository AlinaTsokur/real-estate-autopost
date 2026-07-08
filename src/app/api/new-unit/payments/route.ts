import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';

function col(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function cell(row: unknown[], idx: number): string {
  return idx !== -1 ? String(row[idx] ?? '').trim() : '';
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code) return NextResponse.json({ found: false });

  const normalCode = code.replace(/^#/, '').replace(/\s/g, '').toLowerCase();

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID ?? '';
    const data = await getSheetData(spreadsheetId, 'CONFIG2');
    if (!data || data.length < 2) return NextResponse.json({ found: false });

    const headers = (data[0] as string[]).map(h => String(h).trim());

    const codeCol        = col(headers, 'Code');
    const handoverDateCol = col(headers, 'Handover Date');
    const handoverAedCol  = col(headers, 'Handover AED');
    const p2DateCol       = col(headers, 'Payment 2 Date');
    const p2AedCol        = col(headers, 'Payment 2 AED');
    const p3DateCol       = col(headers, 'Payment 3 Date');
    const p3AedCol        = col(headers, 'Payment 3 AED');
    const p4DateCol       = col(headers, 'Payment 4 Date');
    const p4AedCol        = col(headers, 'Payment 4 AED');
    const p5DateCol       = col(headers, 'Payment 5 Date');
    const p5AedCol        = col(headers, 'Payment 5 AED');
    const p6DateCol       = col(headers, 'Payment 6 Date');
    const p6AedCol        = col(headers, 'Payment 6 AED');

    if (codeCol === -1) return NextResponse.json({ found: false });

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[];
      const rowCode = String(row[codeCol] ?? '').replace(/^#/, '').replace(/\s/g, '').toLowerCase();
      if (rowCode !== normalCode) continue;

      return NextResponse.json({
        found: true,
        handoverDate:  cell(row, handoverDateCol),
        handoverAed:   cell(row, handoverAedCol),
        payment2Date:  cell(row, p2DateCol),
        payment2Aed:   cell(row, p2AedCol),
        payment3Date:  cell(row, p3DateCol),
        payment3Aed:   cell(row, p3AedCol),
        payment4Date:  cell(row, p4DateCol),
        payment4Aed:   cell(row, p4AedCol),
        payment5Date:  cell(row, p5DateCol),
        payment5Aed:   cell(row, p5AedCol),
        payment6Date:  cell(row, p6DateCol),
        payment6Aed:   cell(row, p6AedCol),
      });
    }

    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ found: false });
  }
}
