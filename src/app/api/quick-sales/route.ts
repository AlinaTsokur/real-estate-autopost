import { NextResponse } from 'next/server';
import { listQuickSaleUnits } from '@/lib/units-db/units';
import { mapRawUnitToPostData } from '@/lib/units-db/map';
import { listProjectMeta } from '@/lib/post-meta/emoji';
import { isVillaObject, formatUnitLabel } from '@/lib/posts/formatters';
import { buildQuickSalesText, BudgetItem, QuickSaleGroup } from '@/lib/posts/budget';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Все срочные продажи по Абу-Даби из базы (deal_type = Distress Deal),
// сгруппированные по проектам, плюс готовый текст рассылки.
export async function GET() {
  try {
    const raws = await listQuickSaleUnits();
    if (!raws.length) {
      return NextResponse.json({ groups: [], count: 0, text: '' });
    }

    const emojiByProject = new Map(
      (await listProjectMeta()).map(m => [m.projectId, m.emoji || '']),
    );

    const groups: QuickSaleGroup[] = [];

    for (const raw of raws) {
      const emoji = emojiByProject.get(raw.project_id) || '';
      const p = mapRawUnitToPostData(raw, emoji);
      if (!p.type || !(Number(p.sellingPrice) > 0)) continue;

      const item: BudgetItem = {
        type: p.type,
        isVilla: isVillaObject(p.objectType),
        price: Number(p.sellingPrice),
        view: p.view || '',
        unit: p.unit ? formatUnitLabel(p.unit) : '',
        rowName: p.rowName || '',
        areaM2: p.areaM2,
        grossAreaM2: p.grossAreaM2,
        plotAreaM2: p.plotAreaM2,
        paymentPlan: p.paymentPlan || '',
        originalPrice: p.originalPrice,
      };

      const last = groups[groups.length - 1];
      if (last && last.project === raw.project_name) {
        last.items.push(item);
      } else {
        groups.push({
          project: raw.project_name,
          island: raw.island || '',
          emoji,
          items: [item],
        });
      }
    }

    const count = groups.reduce((n, g) => n + g.items.length, 0);

    return NextResponse.json({
      groups,
      count,
      projects: groups.length,
      text: count ? buildQuickSalesText(groups) : '',
    });
  } catch (error: any) {
    console.error('Quick sales fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
