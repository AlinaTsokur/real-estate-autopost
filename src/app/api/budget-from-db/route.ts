import { NextResponse } from 'next/server';
import { listAvailableUnits } from '@/lib/units-db/units';
import { mapRawUnitToPostData } from '@/lib/units-db/map';
import { getProjectMeta } from '@/lib/post-meta/emoji';
import { selectLowestByExactType } from '@/lib/parsing/table-parser';
import { isVillaObject, formatUnitLabel } from '@/lib/posts/formatters';
import { buildBudgetText, BudgetItem } from '@/lib/posts/budget';

export const dynamic = 'force-dynamic';

// Бюджетная рассылка прямо из базы: берём доступные юниты проекта и по каждому
// типу оставляем самый дешёвый. Раньше то же самое делалось из вставленного TSV.
export async function POST(request: Request) {
  try {
    const { projectName } = await request.json();
    if (!projectName) {
      return NextResponse.json({ error: 'Не передан проект' }, { status: 400 });
    }

    const raws = await listAvailableUnits(projectName);
    if (!raws.length) {
      return NextResponse.json(
        { error: `В базе нет доступных юнитов проекта «${projectName}»` },
        { status: 404 },
      );
    }

    const meta = await getProjectMeta(raws[0].project_id);

    // Юниты без типа или без цены в подборку не берём — сравнивать нечего.
    const rows = raws
      .map(raw => mapRawUnitToPostData(raw, meta?.emoji || ''))
      .filter(p => p.type && Number(p.sellingPrice) > 0)
      .map(p => ({ ...p, sellingPriceNumber: Number(p.sellingPrice) }));

    if (!rows.length) {
      return NextResponse.json(
        { error: `У юнитов проекта «${projectName}» не заполнены тип или цена` },
        { status: 404 },
      );
    }

    const selected = selectLowestByExactType(rows);

    const items: BudgetItem[] = selected.map(r => {
      const isVilla = isVillaObject(r.objectType);
      return {
        type: r.type,
        isVilla,
        price: Number(r.sellingPrice),
        view: r.view || '',
        unit: r.unit ? formatUnitLabel(r.unit) : '',
        rowName: r.rowName || '',
        areaM2: r.areaM2,
        grossAreaM2: r.grossAreaM2,
        plotAreaM2: r.plotAreaM2,
        paymentPlan: r.paymentPlan || '',
      };
    });

    const text = buildBudgetText(
      {
        project: raws[0].project_name,
        island: raws[0].island || '',
        emoji: meta?.emoji || '',
        count: items.length,
      },
      items,
    );

    return NextResponse.json({
      source: 'db',
      project: raws[0].project_name,
      totalRows: rows.length,
      selectedRows: items.length,
      emojiMissing: !meta?.emoji,
      text,
      selected: items,
    });
  } catch (e: any) {
    console.error('budget-from-db error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
