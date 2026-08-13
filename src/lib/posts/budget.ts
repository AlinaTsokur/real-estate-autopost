import { formatArea2, formatNumberLikeSheet } from './formatters';

/* Текст бюджетной рассылки. Собирается и из базы, и из вставленной таблицы —
   формат один, поэтому строится в одном месте. */

export interface BudgetItem {
  type: string;
  isVilla: boolean;
  price: number;
  view?: string;
  unit?: string;        // положение дома в ряду: «Middle unit»
  rowName?: string;     // «Single» / «Double»
  areaM2?: number | string;      // квартиры
  grossAreaM2?: number | string; // виллы и таунхаусы
  plotAreaM2?: number | string;
  originalPrice?: number | string; // печатается только когда выше текущей
}

export interface BudgetHeader {
  project: string;
  island?: string;
  emoji?: string;
  count: number;
}

const hasNum = (v: unknown) => v !== '' && v !== null && v !== undefined && Number(v) > 0;

/** «123,45 sqm / 1.329 sqft» — площадь в обеих единицах, как в старом скрипте. */
function areaBoth(value: number | string): string {
  const sqft = new Intl.NumberFormat('de-DE', { useGrouping: true }).format(
    Math.round(Number(value) * 10.7639),
  );
  return formatArea2(value) + ' sqm / ' + sqft + ' sqft';
}

export function buildBudgetTitle(h: BudgetHeader): string {
  let title = '💰 Best Budget ' + (h.count === 1 ? 'Unit' : 'Units') + ' | ' + h.project;
  if (h.island) title += ' - ' + h.island;
  if (h.emoji) title += ' ' + h.emoji;
  return title;
}

interface BlockOptions {
  originalPrice?: boolean; // Quick Sales идут без старой цены
}

/** Блок одного юнита — общий для бюджетной рассылки и для Quick Sales. */
function buildItemBlock(item: BudgetItem, opts: BlockOptions = {}): string {
  const { originalPrice = true } = opts;
  let text = '*' + item.type + '*\n';

  if (item.isVilla) {
    if (item.unit) text += item.unit + '\n';
    if (item.rowName) text += 'Row: ' + item.rowName + '\n';
    if (hasNum(item.grossAreaM2)) text += 'Gross area ' + areaBoth(item.grossAreaM2!) + '\n';
    if (hasNum(item.plotAreaM2)) text += 'Plot area ' + areaBoth(item.plotAreaM2!) + '\n';
  } else {
    if (item.view) text += item.view + '\n';
    if (hasNum(item.areaM2)) text += areaBoth(item.areaM2!) + '\n';
  }

  // Старую цену показываем, только если она и правда выше — иначе это не скидка.
  if (originalPrice && hasNum(item.originalPrice) && Number(item.originalPrice) > item.price) {
    text += 'Original Price: ' + formatNumberLikeSheet(item.originalPrice!) + ' AED\n';
  }

  return text + '💰 Price: ' + formatNumberLikeSheet(item.price) + ' AED';
}

export function buildBudgetText(header: BudgetHeader, items: BudgetItem[]): string {
  return '*' + buildBudgetTitle(header) + '*\n\n' + items.map(i => buildItemBlock(i)).join('\n\n');
}

export interface QuickSaleGroup {
  project: string;
  island?: string;
  emoji?: string;
  items: BudgetItem[];
}

/** Quick Sales идут по всему Абу-Даби, поэтому юниты сгруппированы по проектам. */
export function buildQuickSalesText(groups: QuickSaleGroup[]): string {
  const blocks = groups.map(g => {
    let head = '*' + g.project;
    if (g.island) head += ' - ' + g.island;
    if (g.emoji) head += ' ' + g.emoji;
    head += '*';
    const items = g.items
      .map(i => buildItemBlock(i, { originalPrice: false }))
      .join('\n\n');
    return head + '\n\n' + items;
  });

  return '*⚡ Quick Sales | Abu Dhabi ⚡*\n\n' + blocks.join('\n\n');
}
