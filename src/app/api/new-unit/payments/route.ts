import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { normalizeText } from '@/lib/posts/formatters';

function col(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(h => h === name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function cell(row: unknown[], idx: number): string {
  return idx !== -1 ? String(row[idx] ?? '').trim() : '';
}

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project')?.trim() ?? '';
  const code    = req.nextUrl.searchParams.get('code')?.trim() ?? '';

  if (!project || !code) return NextResponse.json({ found: false });

  const codePrefix = code.replace(/\D/g, '').slice(0, 4);
  if (codePrefix.length < 4) return NextResponse.json({ found: false });

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID ?? '';
    const data = await getSheetData(spreadsheetId, 'CONFIG2');
    if (!data || data.length < 2) return NextResponse.json({ found: false });

    const headers = (data[0] as string[]).map(h => String(h).trim());

    const projectCol = col(headers, 'Проект', 'Project Name');
    const prefixCol  = col(headers, 'Код префикс', 'Code Prefix');
    const p2Col      = col(headers, 'Payment 2');
    const p3Col      = col(headers, 'Payment 3');
    const p4Col      = col(headers, 'Payment 4');
    const p5Col      = col(headers, 'Payment 5');
    const p6Col      = col(headers, 'Payment 6');

    if (projectCol === -1 || prefixCol === -1) return NextResponse.json({ found: false });

    const targetProject = normalizeText(project);

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[];
      const rowProject = normalizeText(String(row[projectCol] ?? ''));
      const rowPrefix  = String(row[prefixCol] ?? '').replace(/\D/g, '').slice(0, 4);

      if (rowProject !== targetProject || rowPrefix !== codePrefix) continue;

      const p2 = cell(row, p2Col);
      const p3 = cell(row, p3Col);
      const p4 = cell(row, p4Col);
      const p5 = cell(row, p5Col);
      const p6 = cell(row, p6Col);

      if (!p2 && !p3 && !p4 && !p5 && !p6) return NextResponse.json({ found: false });

      return NextResponse.json({
        found: true,
        payment2Date: p2,
        payment3Date: p3,
        payment4Date: p4,
        payment5Date: p5,
        payment6Date: p6,
      });
    }

    return NextResponse.json({ found: false });
  } catch {
    return NextResponse.json({ found: false });
  }
}
