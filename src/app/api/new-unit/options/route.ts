import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { normalizeText } from '@/lib/posts/formatters';

function uniqueCol(data: string[][], colIdx: number): string[] {
  const seen = new Set<string>();
  for (let i = 1; i < data.length; i++) {
    const v = String(data[i]?.[colIdx] ?? '').trim();
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// In-memory cache — 5 minutes
let cachedOptions: unknown = null;
let cacheExpiry = 0;

export async function GET() {
  if (cachedOptions && Date.now() < cacheExpiry) {
    return NextResponse.json(cachedOptions);
  }
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID ?? '';
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_CONFIG_ID not configured' }, { status: 500 });
  }

  try {
    const [configData, config2Data] = await Promise.all([
      getSheetData(spreadsheetId, 'CONFIG'),
      getSheetData(spreadsheetId, 'CONFIG2'),
    ]);

    const configHeaders = (configData[0] ?? []).map(h => String(h).trim());

    const col = (name: string) => configHeaders.indexOf(name);
    const idxProject  = col('Project Name');
    const idxKind     = col('Object Kind');

    const projects: string[] = [];
    const objectKindByProject: Record<string, string> = {};

    for (let i = 1; i < configData.length; i++) {
      const row = configData[i] ?? [];
      const project = idxProject >= 0 ? String(row[idxProject] ?? '').trim() : '';
      if (!project) continue;
      if (!projects.includes(project)) projects.push(project);
      const rawKind = idxKind >= 0 ? String(row[idxKind] ?? '').trim() : '';
      objectKindByProject[project] = /^villa$/i.test(rawKind) ? 'Villa' : 'Apartment';
    }

    // CONFIG2 → buildings by project
    const c2Headers = (config2Data[0] ?? []).map(h => String(h).trim());
    const c2Proj  = c2Headers.findIndex(h =>
      normalizeText(h) === normalizeText('Проект') || normalizeText(h) === normalizeText('Project Name')
    );
    const c2Build = c2Headers.findIndex(h =>
      normalizeText(h) === normalizeText('Здание') || normalizeText(h) === normalizeText('Building')
    );

    const buildingsByProject: Record<string, string[]> = {};
    if (c2Proj >= 0 && c2Build >= 0) {
      for (let i = 1; i < config2Data.length; i++) {
        const row = config2Data[i] ?? [];
        const p = String(row[c2Proj] ?? '').trim();
        const b = String(row[c2Build] ?? '').trim();
        if (!p || !b) continue;
        if (!buildingsByProject[p]) buildingsByProject[p] = [];
        if (!buildingsByProject[p].includes(b)) buildingsByProject[p].push(b);
      }
    }

    const pick = (name: string) => {
      const idx = col(name);
      return idx >= 0 ? uniqueCol(configData, idx) : [];
    };

    const payload = {
      projects,
      objectKindByProject,
      buildingsByProject,
      floors:               pick('Floor'),
      types:                pick('Type'),
      paymentPlans:         pick('Payment Plan'),
      furnishedOptions:     pick('Furnished'),
      specificationOptions: pick('Specification'),
      finishesOptions:      pick('Finishes'),
      rowOptions:           pick('Row'),
      unitPositionOptions:  pick('Unit Position'),
      statusOptions:        ['Ready to move', 'Off plan'],
      mortgageOptions:      ['available', 'not available'],
      podOptions:           ['Yes', 'No'],
    };

    cachedOptions = payload;
    cacheExpiry   = Date.now() + 5 * 60 * 1000; // 5 minutes

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
