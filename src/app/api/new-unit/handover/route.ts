import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { normalizeText } from '@/lib/posts/formatters';

export interface HandoverOption {
  building: string;
  date: string;       // raw from sheet e.g. "31/12/2026"
  isReadyToMove: boolean;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project') ?? '';
  const code    = searchParams.get('code') ?? '';

  if (!project || !code) return NextResponse.json({ options: [] });

  const codePrefix = code.replace(/\D/g, '').slice(0, 4);
  if (codePrefix.length < 4) return NextResponse.json({ options: [] });

  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID ?? '';
    const data = await getSheetData(spreadsheetId, 'CONFIG2');
    if (data.length < 2) return NextResponse.json({ options: [] });

    const headers = data[0].map((h: unknown) => normalizeText(String(h).trim()));
    const projectCol  = headers.findIndex((h: string) => h === normalizeText('Проект') || h === normalizeText('Project Name'));
    const prefixCol   = headers.findIndex((h: string) => h === normalizeText('Код префикс') || h === normalizeText('Code Prefix'));
    const buildingCol = headers.findIndex((h: string) => h === normalizeText('Здание') || h === normalizeText('Building'));
    const handoverCol = headers.findIndex((h: string) => h === normalizeText('Дата сдачи') || h === normalizeText('Handover Date'));

    if (projectCol === -1 || prefixCol === -1 || handoverCol === -1) {
      return NextResponse.json({ options: [] });
    }

    const targetProject = normalizeText(project);
    const options: HandoverOption[] = [];

    for (let i = 1; i < data.length; i++) {
      const rowProject = normalizeText(String(data[i][projectCol] ?? ''));
      const rowPrefix  = String(data[i][prefixCol] ?? '').replace(/\D/g, '').slice(0, 4);

      if (rowProject !== targetProject || rowPrefix !== codePrefix) continue;

      const rawDate = String(data[i][handoverCol] ?? '').trim();
      if (!rawDate || rawDate === '-') continue;

      const building = buildingCol !== -1 ? String(data[i][buildingCol] ?? '').trim() : '';
      const isReadyToMove = /ready\s*to\s*move/i.test(rawDate);

      options.push({ building, date: isReadyToMove ? '' : rawDate, isReadyToMove });
    }

    return NextResponse.json({ options });
  } catch {
    return NextResponse.json({ options: [] });
  }
}
