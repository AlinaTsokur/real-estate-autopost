import { buildCatalogCsv } from '@/lib/catalog/store';

export const dynamic = 'force-dynamic';

// Постоянный адрес фида для Meta Commerce Manager: там указывается ссылка на
// этот роут, и Meta забирает каталог по расписанию сама.
export async function GET() {
  const csv = await buildCatalogCsv();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline; filename="catalog.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
