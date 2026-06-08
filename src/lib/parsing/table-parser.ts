import { normalizeText } from '../posts/formatters';

export function parseTsvWithQuotedMultiline(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === '\t' && !inQuotes) {
      row.push(cleanCell(cell));
      cell = '';
      continue;
    }

    if (ch === '\n' && !inQuotes) {
      row.push(cleanCell(cell));
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cleanCell(cell));
  rows.push(row);

  return rows;
}

function cleanCell(value: string): string {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isEmptyRow(parts: string[]): boolean {
  return !parts || parts.every(v => String(v || '').trim() === '');
}

export function isHeaderRow(parts: string[]): boolean {
  const joined = parts.map(v => String(v || '').toLowerCase()).join(' | ');

  return (
    joined.includes('selling price') ||
    joined.includes('original price') ||
    joined.includes('price, usd') ||
    joined.includes('usd / m2') ||
    joined.includes('area, m2') ||
    joined.includes('gross area') ||
    joined.includes('plot area')
  );
}

export function selectLowestByExactType(rows: any[]): any[] {
  const map: Record<string, any> = {};

  rows.forEach(row => {
    const typeKey = normalizeText(row.type);
    if (!typeKey) return;

    if (!map[typeKey]) {
      map[typeKey] = row;
      return;
    }

    if (row.sellingPriceNumber < map[typeKey].sellingPriceNumber) {
      map[typeKey] = row;
    }
  });

  return Object.values(map).sort((a, b) => {
    return typeSortWeight(a.type) - typeSortWeight(b.type);
  });
}

function typeSortWeight(type: string): number {
  const s = String(type || '').toLowerCase();
  if (s.includes('studio')) return 0;

  const m = s.match(/(\\d+)/);
  const base = m ? Number(m[1]) * 100 : 9999;

  let extra = 0;
  if (s.includes('maid')) extra += 10;
  if (s.includes('study')) extra += 20;

  return base + extra;
}
