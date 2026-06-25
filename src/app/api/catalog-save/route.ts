import { NextResponse } from 'next/server';
import { getProjectParseConfig, getConfig2, saveCatalogRows, CatalogRow } from '@/lib/google/sheets';
import { parseTsvWithQuotedMultiline, isEmptyRow, isHeaderRow } from '@/lib/parsing/table-parser';
import { parseRowByFormat } from '@/lib/parsing/row-parser';
import { toNumber, formatHandoverDate } from '@/lib/posts/formatters';
import { getProjectPhotoFolderId, getDriveImageUrls } from '@/lib/google/drive';

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

    const rows = parseTsvWithQuotedMultiline(rawText);
    const catalogRows: CatalogRow[] = [];
    const seen = new Set<string>();

    for (const parts of rows) {
      if (isEmptyRow(parts)) continue;
      if (isHeaderRow(parts)) continue;

      const parsed = parseRowByFormat(parts, config, projectName);

      const type = String(parsed.type || '').trim();
      const sellingPrice = String(parsed.sellingPrice || '').trim();
      if (!type || !sellingPrice) continue;
      if (!Number(toNumber(sellingPrice))) continue;

      // Detect townhouse from type string
      if (type.toLowerCase().includes('townhouse')) parsed.objectType = 'Townhouse';

      const id = String(parsed.code || parsed.unit || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const isVillaOrTown = ['villa', 'townhouse'].includes(parsed.objectType.toLowerCase());
      const area = isVillaOrTown
        ? String(parsed.grossAreaM2 || parsed.areaM2 || '').trim()
        : String(parsed.areaM2 || '').trim();

      const title = buildTitle(type, projectName, cfg2.island, cfg2.emoji);
      const description = buildDescription({
        objectType: parsed.objectType,
        view: parsed.view || '',
        sellingPrice,
        areaM2: parsed.areaM2 || '',
        grossAreaM2: parsed.grossAreaM2 || '',
        handover: parsed.handover || '',
      });

      catalogRows.push({
        home_listing_id: id,
        name: title,
        description,
        price: formatMetaPrice(sellingPrice),
        image0: '',
        image1: photoUrls[0] || '',
        image2: photoUrls[1] || '',
        image3: photoUrls[2] || '',
        image4: photoUrls[3] || '',
        image5: photoUrls[4] || '',
        address_addr1: projectName,
        area_size: String(toNumber(area)),
        num_beds: extractNumBeds(type),
        property_type: parsed.objectType.toLowerCase() === 'villa' ? 'house' : parsed.objectType.toLowerCase(),
      });
    }

    if (!catalogRows.length) {
      return NextResponse.json({ error: 'No valid rows found' }, { status: 400 });
    }

    await saveCatalogRows(catalogRows);

    return NextResponse.json({ ok: true, saved: catalogRows.length, rows: catalogRows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
