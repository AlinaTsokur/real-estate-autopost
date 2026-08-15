import { NextResponse } from 'next/server';
import { listAvailableUnits } from '@/lib/units-db/units';
import { mapRawUnitToPostData } from '@/lib/units-db/map';
import { getProjectMeta } from '@/lib/post-meta/emoji';
import { selectLowestByExactType } from '@/lib/parsing/table-parser';
import { getCatalogRows } from '@/lib/catalog/store';
import { getProjectPhotoFolderId, getDriveImageUrls } from '@/lib/google/drive';
import { buildCatalogRow, makeCatalogId } from '@/lib/catalog/build-row';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Каталог прямо из базы — как бюджетная рассылка. Берём доступные юниты
// проекта и по каждому типу оставляем самый дешёвый; раньше то же самое
// делалось из вставленного TSV.
export async function POST(request: Request) {
  try {
    const { projectName } = await request.json();
    if (!projectName) return NextResponse.json({ error: 'Не передан проект' }, { status: 400 });

    const raws = await listAvailableUnits(projectName);
    if (!raws.length) {
      return NextResponse.json(
        { error: `В базе нет доступных юнитов проекта «${projectName}»` },
        { status: 404 },
      );
    }

    const meta = await getProjectMeta(raws[0].project_id);
    const island = meta?.island || raws[0].island || '';
    const emoji = meta?.emoji || '';

    // Без типа или цены юнит в подборку не годится — сравнивать нечего.
    const rows = raws
      .map(raw => mapRawUnitToPostData(raw, emoji))
      .filter(p => p.type && Number(p.sellingPrice) > 0)
      .map(p => ({ ...p, sellingPriceNumber: Number(p.sellingPrice) }));

    if (!rows.length) {
      return NextResponse.json(
        { error: `У юнитов проекта «${projectName}» не заполнены тип или цена` },
        { status: 404 },
      );
    }

    const selected = selectLowestByExactType(rows);

    // Обложки, уже сохранённые для этих карточек, и общие фото проекта.
    const [existingCovers, photoUrls] = await Promise.all([
      getCatalogRows().then(
        (r: any[]) => new Map(r.map(x => [String(x.home_listing_id || ''), String(x['image[0].url'] || '')])),
      ).catch(() => new Map<string, string>()),
      getProjectPhotoFolderId(projectName)
        .then(id => getDriveImageUrls(id, 5))
        .catch(() => [] as string[]),
    ]);

    const previewRows = selected.map((item: any) =>
      buildCatalogRow(
        {
          code: item.code || '',
          type: item.type || '',
          objectType: item.objectType || 'Apartment',
          view: item.view || '',
          sellingPrice: String(item.sellingPrice || ''),
          areaM2: String(item.areaM2 || ''),
          grossAreaM2: String(item.grossAreaM2 || ''),
          plotAreaM2: String(item.plotAreaM2 || ''),
          unit: item.unit || '',
          handover: item.handover || '',
        },
        projectName,
        island,
        emoji,
        existingCovers.get(makeCatalogId(projectName, String(item.type || '').trim())) || '',
        photoUrls,
      ),
    );

    return NextResponse.json({ rows: previewRows });
  } catch (e: any) {
    console.error('catalog-from-db error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
