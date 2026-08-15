// Каталог для Meta Commerce Manager. Раньше лежал в листе CATALOG гугл-таблицы,
// которая автоматически публиковалась в интернет, — теперь в нашей базе, а
// наружу отдаётся по адресу /api/catalog-feed.
//
// Набор колонок задан Meta: имена вроде «image[0].url» и «address.addr1» —
// это её формат фида, поэтому храним их как есть, одной картой значений.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.META_DB_URL!);

export const CATALOG_COLUMNS = [
  'home_listing_id', 'name', 'description', 'availability', 'price',
  'image[0].url', 'image[1].url', 'image[2].url', 'image[3].url', 'image[4].url', 'image[5].url',
  'url', 'address.addr1', 'address.city', 'address.region', 'address.country',
  'latitude', 'longitude', 'area_size', 'area_unit',
  'num_beds', 'property_type', 'construction_status',
];

export interface CatalogRow {
  home_listing_id: string;
  name: string;
  description: string;
  price: string;
  image0: string;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  image5: string;
  address_addr1: string;
  area_size: string;
  num_beds: string;
  property_type: string;
  construction_status: string;
}

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS catalog_items (
        home_listing_id text PRIMARY KEY,
        fields          jsonb       NOT NULL DEFAULT '{}'::jsonb,
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `;
  })();
  return ready;
}

/** Значения, одинаковые для всех карточек — компания и город. */
function fixedFields(): Record<string, string> {
  return {
    availability: 'for_sale',
    url: 'https://primebridge.estate',
    'address.city': 'Abu Dhabi',
    'address.region': 'Abu Dhabi',
    'address.country': 'AE',
    latitude: '24.4539',
    longitude: '54.3773',
    area_unit: 'sq_m',
  };
}

function toFields(r: CatalogRow, existingCover = ''): Record<string, string> {
  return {
    ...fixedFields(),
    home_listing_id: r.home_listing_id,
    name: r.name,
    description: r.description,
    price: r.price,
    // Обложку, поставленную руками, повторная сборка не затирает.
    'image[0].url': existingCover || r.image0 || '',
    'image[1].url': r.image1 || '',
    'image[2].url': r.image2 || '',
    'image[3].url': r.image3 || '',
    'image[4].url': r.image4 || '',
    'image[5].url': r.image5 || '',
    'address.addr1': r.address_addr1,
    area_size: String(Math.round(Number(r.area_size) || 0)),
    num_beds: r.num_beds,
    property_type: r.property_type,
    construction_status: r.construction_status,
  };
}

export async function getCatalogRows(): Promise<Record<string, string>[]> {
  await ensureTable();
  const rows = (await sql`SELECT fields FROM catalog_items ORDER BY home_listing_id`) as any[];
  return rows.map(r => r.fields as Record<string, string>);
}

export async function saveCatalogRows(rows: CatalogRow[]): Promise<number> {
  await ensureTable();
  for (const r of rows) {
    const prev = (await sql`
      SELECT fields->>'image[0].url' AS cover FROM catalog_items WHERE home_listing_id = ${r.home_listing_id}
    `) as any[];
    const fields = toFields(r, prev[0]?.cover || '');
    await sql`
      INSERT INTO catalog_items (home_listing_id, fields)
      VALUES (${r.home_listing_id}, ${JSON.stringify(fields)}::jsonb)
      ON CONFLICT (home_listing_id)
      DO UPDATE SET fields = EXCLUDED.fields, updated_at = now()
    `;
  }
  return rows.length;
}

export async function updateCatalogCover(listingId: string, imageUrl: string): Promise<void> {
  await ensureTable();
  await sql`
    UPDATE catalog_items
    SET fields = jsonb_set(fields, '{image[0].url}', to_jsonb(${imageUrl}::text)), updated_at = now()
    WHERE home_listing_id = ${listingId}
  `;
}

/** Фид в формате Meta: первая строка — заголовки, дальше карточки. */
export async function buildCatalogCsv(): Promise<string> {
  const rows = await getCatalogRows();
  const esc = (v: string) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CATALOG_COLUMNS.join(',')];
  for (const r of rows) lines.push(CATALOG_COLUMNS.map(c => esc(r[c] ?? '')).join(','));
  return lines.join('\n');
}
