import { NextResponse } from 'next/server';
import { getProjectParseConfig, getConfig2, saveCatalogRows, CatalogRow } from '@/lib/google/sheets';
import { parseTsvWithQuotedMultiline, isEmptyRow, isHeaderRow, selectLowestByExactType } from '@/lib/parsing/table-parser';
import { parseRowByFormat } from '@/lib/parsing/row-parser';
import { toNumber, extractLeadingNumberText } from '@/lib/posts/formatters';
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
  areaM2: string; grossAreaM2: string; handover: string;
}): string {
  const isVillaOrTown = ['villa', 'townhouse'].includes(item.objectType.toLowerCase());
  const price = formatMetaPrice(item.sellingPrice);
  const parts: string[] = [];

  if (price) parts.push(`Selling Price: from ${price.replace(' AED', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} AED`);

  if (isVillaOrTown) {
    if (item.grossAreaM2) parts.push(`Gross area: ${item.grossAreaM2} sqm`);
  } else {
    if (item.areaM2) parts.push(`Area: ${item.areaM2} sqm`);
    if (item.view) parts.push(item.view);
  }

  if (item.handover) parts.push(`Handover: ${item.handover}`);
  parts.push('Tap "Message business" to learn more!');

  return parts.join('\n').slice(0, 5000);
}

export async function POST(request: Request) {
  try {
    const { rawText, projectName } = await request.json();
    if (!rawText || !projectName) {
      return NextResponse.json({ error: 'Missing rawText or projectName' }, { status: 400 });
    }

    const [config, cfg2] = await Promise.all([
      getProjectParseConfig(projectName),
      getConfig2(projectName),
    ]);

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

    // Select cheapest per type (same logic as Budget Builder)
    const selected = selectLowestByExactType(parsedRows);

    const catalogRows: CatalogRow[] = selected.map(item => {
      const type = String(item.type || '').trim();
      const isVillaOrTown = ['villa', 'townhouse'].includes(item.objectType.toLowerCase());
      const area = isVillaOrTown
        ? String(item.grossAreaM2 || item.areaM2 || '').trim()
        : String(item.areaM2 || '').trim();

      return {
        home_listing_id: makeCatalogId(projectName, type),
        name: buildTitle(type, projectName, cfg2.island, cfg2.emoji),
        description: buildDescription({
          objectType: item.objectType,
          view: item.view || '',
          sellingPrice: String(item.sellingPrice || ''),
          areaM2: item.areaM2 || '',
          grossAreaM2: item.grossAreaM2 || '',
          handover: item.handover || '',
        }),
        price: formatMetaPrice(String(item.sellingPrice || '')),
        image0: '',
        image1: photoUrls[0] || '',
        image2: photoUrls[1] || '',
        image3: photoUrls[2] || '',
        image4: photoUrls[3] || '',
        image5: photoUrls[4] || '',
        address_addr1: projectName,
        area_size: String(toNumber(area)),
        num_beds: extractNumBeds(type),
        property_type: item.objectType.toLowerCase() === 'villa' ? 'house' : item.objectType.toLowerCase(),
      };
    });

    await saveCatalogRows(catalogRows);

    return NextResponse.json({ ok: true, saved: catalogRows.length, rows: catalogRows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
