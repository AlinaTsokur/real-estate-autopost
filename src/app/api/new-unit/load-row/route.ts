import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { normalizeText } from '@/lib/posts/formatters';

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';
const CONFIG_ID  = process.env.GOOGLE_SHEETS_CONFIG_ID  ?? '';

function stripAed(v: string): string {
  return v.replace(/\s*AED\s*/gi, '').replace(/\s+/g, ' ').trim();
}

async function getProjectByCodePrefix(codePrefix: string): Promise<string> {
  const data = await getSheetData(CONFIG_ID, 'CONFIG2');
  if (data.length < 2) return '';

  const headers  = data[0].map((h: unknown) => normalizeText(String(h).trim()));
  const projCol  = headers.findIndex((h: string) => h === normalizeText('Проект') || h === normalizeText('Project Name'));
  const prefCol  = headers.findIndex((h: string) => h === normalizeText('Код префикс') || h === normalizeText('Code Prefix'));

  if (projCol === -1 || prefCol === -1) return '';

  for (let i = 1; i < data.length; i++) {
    const rowPrefix = String(data[i][prefCol] ?? '').replace(/\D/g, '').slice(0, 4);
    if (rowPrefix === codePrefix) {
      return String(data[i][projCol] ?? '').trim();
    }
  }
  return '';
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code || !OBJECTS_ID) return NextResponse.json({ found: false });

  const normalCode  = code.replace(/\s/g, '').toLowerCase();
  const codePrefix  = code.replace(/\D/g, '').slice(0, 4);

  // Look up project from CONFIG2 in parallel with sheet search
  const [projectName, rows] = await Promise.all([
    codePrefix.length === 4 ? getProjectByCodePrefix(codePrefix).catch(() => '') : Promise.resolve(''),
    getSheetData(OBJECTS_ID, 'Abu Dhabi').catch(() => [] as unknown[][]),
  ]);

  if (!rows || rows.length < 2) return NextResponse.json({ found: false });

  const headers  = (rows[0] as string[]).map(h => String(h).trim());
  const codeCol  = headers.findIndex(h => h === 'Код');
  const unitCol  = headers.findIndex(h => h === 'Unit');
  const origCol  = headers.findIndex(h => h === 'Original Price');
  const sellCol  = headers.findIndex(h => h === 'Selling Price');
  const agentCol = headers.findIndex(h => h === 'Owner / Agent');

  if (codeCol === -1) return NextResponse.json({ found: false });

  for (let i = 1; i < rows.length; i++) {
    const rowCode = String((rows[i] as string[])[codeCol] ?? '').replace(/\s/g, '').toLowerCase();
    if (rowCode !== normalCode) continue;

    const r = rows[i] as string[];
    return NextResponse.json({
      found: true,
      projectName:   projectName,
      unit:          unitCol  !== -1 ? String(r[unitCol]  ?? '') : '',
      originalPrice: origCol  !== -1 ? stripAed(String(r[origCol]  ?? '')) : '',
      sellingPrice:  sellCol  !== -1 ? stripAed(String(r[sellCol]  ?? '')) : '',
      manager:       agentCol !== -1 ? String(r[agentCol] ?? '') : '',
    });
  }

  return NextResponse.json({ found: false });
}
