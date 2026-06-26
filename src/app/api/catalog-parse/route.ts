import { NextResponse } from 'next/server';
import { getProjectParseConfig, getConfig2, getConfig2Handover, getCatalogRows } from '@/lib/google/sheets';
import { parseTsvWithQuotedMultiline, isEmptyRow, isHeaderRow, selectLowestByExactType } from '@/lib/parsing/table-parser';
import { parseRowByFormat } from '@/lib/parsing/row-parser';
import { toNumber, extractLeadingNumberText, formatArea2, formatNumberLikeSheet, formatUnitLabel, formatHandoverDate } from '@/lib/posts/formatters';
import { getProjectPhotoFolderId, getDriveImageUrls } from '@/lib/google/drive';

function makeCatalogId(project: string, type: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
  return `${slug(project)}_${slug(type)}`.slice(0, 80);
}

function extractNumBeds(type: string): string {
  const s = String(type || '').trim().toLowerCase();
  if (s.startsWith('studio')) return '0';
  const m = s.match(/^(\d+)/);
  return m ? m[1] : '1';
}

function formatMetaPrice(raw: string): string {
  const n = Number(toNumber(String(raw || '')));
  if (!n) return '';
  return `${Math.round(n)} AED`;
}

function buildTitle(type: string, project: string, island: string, emoji: string): string {
  let title = `${type} in ${project}`;
  if (island) title += ` - ${island}`;
  if (emoji) title += ` ${emoji}`;
  return title.slice(0, 200);
}

function buildDescription(item: {
  objectType: string; view: string; sellingPrice: string;
  areaM2: string; grossAreaM2: string; plotAreaM2: string;
  unit: string; handover: string;
}): string {
  const isVilla = item.objectType.toLowerCase() === 'villa';
  const isTown = item.objectType.toLowerCase() === 'townhouse';
  const priceNum = Number(toNumber(String(item.sellingPrice || '')));
  const lines: string[] = [];

  if (priceNum) lines.push(`Selling Price: from ${formatNumberLikeSheet(priceNum)} AED`);

  lines.push('');

  if (isVilla || isTown) {
    const grossNum = Number(toNumber(item.grossAreaM2));
    const plotNum = Number(toNumber(item.plotAreaM2));
    if (grossNum) {
      let areaLine = `📐 Gross area from ${formatArea2(grossNum)} sqm`;
      if (isVilla && plotNum) areaLine += ` / Plot area from ${formatArea2(plotNum)} sqm`;
      lines.push(areaLine);
    }
    if (isVilla && item.unit) lines.push(`🌳 ${formatUnitLabel(item.unit)}`);
  } else {
    const areaNum = Number(toNumber(item.areaM2));
    if (areaNum) lines.push(`📐 From ${formatArea2(areaNum)} sqm`);
    if (item.view) lines.push(`🌳 ${item.view}`);
  }

  if (item.handover) {
    const isDate = /\b(january|february|march|april|may|june|july|august|september|october|november|december|Q[1-4])\b/i.test(item.handover);
    lines.push(isDate ? `🗓️ Handover: from ${item.handover}` : `🗓️ ${item.handover}`);
  }

  lines.push('');
  lines.push('📩 Tap "Message business" to learn more!');

  return lines.join('\n').slice(0, 5000);
}

export async function POST(request: Request) {
  try {
    const { rawText, projectName } = await request.json();
    if (!rawText || !projectName) {
      return NextResponse.json({ error: 'Missing rawText or projectName' }, { status: 400 });
    }

    const [config, cfg2, existingCatalog] = await Promise.all([
      getProjectParseConfig(projectName),
      getConfig2(projectName),
      getCatalogRows().catch(() => [] as Record<string, string>[]),
    ]);

    // Build map: home_listing_id → existing cover URL
    const existingCovers = new Map<string, string>();
    for (const row of existingCatalog) {
      const id = String(row['home_listing_id'] || '').trim();
      const cover = String(row['image[0].url'] || '').trim();
      if (id && cover) existingCovers.set(id, cover);
    }

    // Get project photos (up to 5)
    let photoUrls: string[] = [];
    try {
      const folderId = await getProjectPhotoFolderId(projectName);
      photoUrls = await getDriveImageUrls(folderId, 5);
    } catch {}

    // Parse all rows
    const rows = parseTsvWithQuotedMultiline(rawText);
    const parsedRows: any[] = [];

    for (const parts of rows) {
      if (isEmptyRow(parts)) continue;
      if (isHeaderRow(parts)) continue;

      const parsed = parseRowByFormat(parts, config, projectName);
      const type = String(parsed.type || '').trim();
      const sellingPrice = String(parsed.sellingPrice || '').trim();
      if (!type || !sellingPrice) continue;

      const priceNum = Number(toNumber(sellingPrice));
      if (!priceNum) continue;

      if (type.toLowerCase().includes('townhouse')) parsed.objectType = 'Townhouse';

      parsed.sellingPriceNumber = priceNum;
      parsed.areaNumber = Number(toNumber(extractLeadingNumberText(parsed.areaM2 || ''))) || 0;
      parsed.grossAreaNumber = Number(toNumber(extractLeadingNumberText(parsed.grossAreaM2 || ''))) || 0;
      parsedRows.push(parsed);
    }

    if (!parsedRows.length) {
      return NextResponse.json({ error: 'No valid rows found' }, { status: 400 });
    }

    const selected = selectLowestByExactType(parsedRows);

    // Fetch handover from CONFIG2 for each selected row
    const withHandover = await Promise.all(selected.map(async (item) => {
      let handover = String(item.handover || '').trim();
      if (!handover) {
        const codePrefix = String(item.code || '').replace(/\D/g, '').slice(0, 4);
        if (codePrefix) {
          const h = await getConfig2Handover(projectName, codePrefix);
          handover = h.value ? formatHandoverDate(h.value) : '';
        }
      }
      return { ...item, handover };
    }));

    const previewRows = withHandover.map(item => {
      const type = String(item.type || '').trim();
      const isVillaOrTown = ['villa', 'townhouse'].includes(item.objectType.toLowerCase());
      const area = isVillaOrTown
        ? String(item.grossAreaM2 || item.areaM2 || '').trim()
        : String(item.areaM2 || '').trim();

      const listingId = makeCatalogId(projectName, type);
      return {
        home_listing_id: listingId,
        unit_code: String(item.code || '').trim(),
        name: buildTitle(type, projectName, cfg2.island, cfg2.emoji),
        description: buildDescription({
          objectType: item.objectType,
          view: item.view || '',
          sellingPrice: String(item.sellingPrice || ''),
          areaM2: item.areaM2 || '',
          grossAreaM2: item.grossAreaM2 || '',
          plotAreaM2: item.plotAreaM2 || '',
          unit: item.unit || '',
          handover: item.handover || '',
        }),
        price: formatMetaPrice(String(item.sellingPrice || '')),
        image0: existingCovers.get(listingId) || '',
        image1: photoUrls[0] || '',
        image2: photoUrls[1] || '',
        image3: photoUrls[2] || '',
        image4: photoUrls[3] || '',
        image5: photoUrls[4] || '',
        address_addr1: projectName,
        area_size: String(toNumber(area)),
        num_beds: extractNumBeds(type),
        property_type: item.objectType.toLowerCase() === 'villa' ? 'house' : item.objectType.toLowerCase(),
        construction_status: /ready/i.test(String(item.handover || '')) ? 'ready_to_move' : 'off_plan',
      };
    });

    return NextResponse.json({ rows: previewRows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
