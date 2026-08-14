// Сборка строк каталога Meta. Раньше жила внутри роута разбора вставленного
// TSV; теперь общая — каталог собирается из базы.
import { toNumber, formatArea2, formatNumberLikeSheet, formatUnitLabel } from '@/lib/posts/formatters';

export function makeCatalogId(project: string, type: string): string {
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

export interface CatalogSource {
  code: string;
  type: string;
  objectType: string;
  view: string;
  sellingPrice: string;
  areaM2: string;
  grossAreaM2: string;
  plotAreaM2: string;
  unit: string;
  handover: string;
}

/** Одна строка каталога Meta из юнита. */
export function buildCatalogRow(
  item: CatalogSource,
  projectName: string,
  island: string,
  emoji: string,
  cover: string,
  photoUrls: string[],
) {
  const type = String(item.type || '').trim();
  const isVillaOrTown = ['villa', 'townhouse'].includes(item.objectType.toLowerCase());
  const area = isVillaOrTown
    ? String(item.grossAreaM2 || item.areaM2 || '').trim()
    : String(item.areaM2 || '').trim();

  const listingId = makeCatalogId(projectName, type);
  return {
    home_listing_id: listingId,
    unit_code: String(item.code || '').trim(),
    name: buildTitle(type, projectName, island, emoji),
    description: buildDescription(item),
    price: formatMetaPrice(String(item.sellingPrice || '')),
    image0: cover || '',
    image1: photoUrls[0] || '',
    image2: photoUrls[1] || '',
    image3: photoUrls[2] || '',
    image4: photoUrls[3] || '',
    image5: photoUrls[4] || '',
    address_addr1: projectName,
    area_size: String(Math.round(Number(toNumber(area)) || 0)),
    num_beds: extractNumBeds(type),
    property_type: item.objectType.toLowerCase() === 'villa' ? 'house' : item.objectType.toLowerCase(),
    construction_status: /ready/i.test(String(item.handover || '')) ? 'ready_to_move' : 'off_plan',
  };
}
