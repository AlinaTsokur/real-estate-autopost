import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';
import { normalizeText } from '@/lib/posts/formatters';

export const dynamic = 'force-dynamic';

const LINK_COL_NAMES = ['Ссылка', 'Link', 'URL', 'Ссылка на объект', 'Listing URL', 'Listing Link', 'Property Link', 'Bayut Link', 'PF Link', 'Ссылка на листинг'];

// #f4cccc in 0–1 floats
function isUnavailableColor(c: { red?: number; green?: number; blue?: number } | undefined | null): boolean {
  if (!c) return false;
  const r = c.red ?? 0;
  const g = c.green ?? 0;
  const b = c.blue ?? 0;
  // #f4cccc = 0.957, 0.800, 0.800 — allow ±0.06 tolerance
  return r > 0.9 && g > 0.74 && g < 0.86 && b > 0.74 && b < 0.86;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code) return NextResponse.json({ found: false, error: 'code required' });

  const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
  if (!spreadsheetId) return NextResponse.json({ found: false, error: 'not configured' });

  const sheets = await getGoogleSheetsClient();

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: ['Abu Dhabi!A:AZ'],
    includeGridData: true,
  });

  const gridData = res.data.sheets?.[0]?.data?.[0];
  const rowData = gridData?.rowData;
  if (!rowData || rowData.length < 2) return NextResponse.json({ found: false, error: 'sheet empty' });

  const getCellText = (cell: any): string =>
    String(cell?.formattedValue ?? cell?.userEnteredValue?.stringValue ?? cell?.userEnteredValue?.numberValue ?? '').trim();

  const headerCells = rowData[0].values ?? [];
  const headers = headerCells.map(h => getCellText(h));
  const headersNorm = headers.map(h => normalizeText(h));

  const codeCol = headersNorm.findIndex(h => h === normalizeText('Код') || h === normalizeText('Code'));
  const unitCol = headersNorm.findIndex(h => h === normalizeText('Unit'));
  const commentCol = headersNorm.findIndex(h => h === normalizeText('Комментарии') || h === normalizeText('Comments'));
  const linkCol = headers.findIndex(h => LINK_COL_NAMES.some(n => normalizeText(h) === normalizeText(n)));

  if (codeCol === -1) return NextResponse.json({ found: false, error: 'Код column not found' });

  const target = code.replace(/\s/g, '').toLowerCase().replace(/^#/, '');

  for (let i = 1; i < rowData.length; i++) {
    const cells = rowData[i].values ?? [];
    const rowCode = getCellText(cells[codeCol]).replace(/\s/g, '').toLowerCase().replace(/^#/, '');
    if (!rowCode || rowCode !== target) continue;

    // Check background color on the first cell of the row (or unit cell)
    const checkCell = cells[unitCol !== -1 ? unitCol : codeCol];
    const bg = checkCell?.effectiveFormat?.backgroundColor ?? checkCell?.userEnteredFormat?.backgroundColor;
    const available = !isUnavailableColor(bg);

    return NextResponse.json({
      found: true,
      code: getCellText(cells[codeCol]),
      unit: unitCol !== -1 ? getCellText(cells[unitCol]) : '',
      link: linkCol !== -1 ? getCellText(cells[linkCol]) : '',
      comments: commentCol !== -1 ? getCellText(cells[commentCol]) : '',
      available,
    });
  }

  return NextResponse.json({ found: false });
}
