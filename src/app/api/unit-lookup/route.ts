import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';
import { normalizeText } from '@/lib/posts/formatters';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const LINK_COL_NAMES = ['Ссылка', 'Link', 'URL', 'Ссылка на объект', 'Listing URL', 'Listing Link', 'Property Link', 'Bayut Link', 'PF Link', 'Ссылка на листинг'];

function isUnavailableColor(c: { red?: number | null; green?: number | null; blue?: number | null } | undefined | null): boolean {
  if (!c) return false;
  const r = c.red ?? 0; const g = c.green ?? 0; const b = c.blue ?? 0;
  return r > 0.9 && g > 0.74 && g < 0.86 && b > 0.74 && b < 0.86;
}

// Same normalization as approveUnitRow — strips NBSP, all whitespace, leading #
function norm(v: unknown): string {
  return String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')?.trim() ?? '';
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  const json  = (data: object, status = 200) => NextResponse.json(data, { status, headers: CORS });

  if (!code) return json({ found: false, error: 'code required' });

  const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
  if (!spreadsheetId) return json({ found: false, error: 'GOOGLE_SHEETS_OBJECTS_ID not configured' });

  try {
    const sheets = await getGoogleSheetsClient();

    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: ['Abu Dhabi!A:AZ'],
      includeGridData: true,
    });

    const gridData = res.data.sheets?.[0]?.data?.[0];
    const rowData  = gridData?.rowData;
    if (!rowData || rowData.length < 2) {
      return json({ found: false, error: 'sheet empty or not found' });
    }

    const getCellText = (cell: any): string =>
      String(cell?.formattedValue ?? cell?.userEnteredValue?.stringValue ?? cell?.userEnteredValue?.numberValue ?? '').trim();

    const headerCells = rowData[0].values ?? [];
    const headers     = headerCells.map(h => getCellText(h));
    const headersNorm = headers.map(h => normalizeText(h));

    const codeCol       = headersNorm.findIndex(h => h === normalizeText('Код') || h === normalizeText('Code'));
    const unitCol       = headersNorm.findIndex(h => h === normalizeText('Unit'));
    const commentCol    = headersNorm.findIndex(h => h === normalizeText('Комментарии') || h === normalizeText('Comments'));
    const linkCol       = headers.findIndex(h => LINK_COL_NAMES.some(n => normalizeText(h) === normalizeText(n)));
    const folderLinkCol = headersNorm.findIndex(h => h === normalizeText('Unit Folder Link'));

    if (debug) {
      return json({ headers, codeCol, unitCol, commentCol, linkCol });
    }

    if (codeCol === -1) {
      return json({ found: false, error: `Код column not found. Headers: ${headers.slice(0, 10).join(', ')}` });
    }

    const target = norm(code);

    for (let i = 1; i < rowData.length; i++) {
      const cells   = rowData[i].values ?? [];
      const rowCode = norm(getCellText(cells[codeCol]));
      if (!rowCode || rowCode !== target) continue;

      const checkCell = cells[unitCol !== -1 ? unitCol : codeCol];
      const bg        = checkCell?.effectiveFormat?.backgroundColor ?? checkCell?.userEnteredFormat?.backgroundColor;

      return json({
        found:      true,
        code:       getCellText(cells[codeCol]),
        unit:       unitCol       !== -1 ? getCellText(cells[unitCol])       : '',
        link:       linkCol       !== -1 ? getCellText(cells[linkCol])       : '',
        comments:   commentCol    !== -1 ? getCellText(cells[commentCol])    : '',
        folderLink: folderLinkCol !== -1 ? getCellText(cells[folderLinkCol]) : '',
        available:  !isUnavailableColor(bg),
      });
    }

    return json({ found: false });
  } catch (e: any) {
    return json({ found: false, error: e.message }, 500);
  }
}
