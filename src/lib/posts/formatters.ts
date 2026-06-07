export function toNumber(value: any): number | '' {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return value;

  let s = String(value)
    .trim()
    .replace(/[\\u00A0]/g, ' ')
    .replace(/\\s+/g, '')
    .replace(/AED/gi, '')
    .replace(/[^\\d,.\\-]/g, '');

  if (!s) return '';

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    if (lastComma > lastDot) {
      s = s.replace(/\\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    if (commaCount > 1 || /^\\d{1,3}(,\\d{3})+$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (dotCount > 0) {
    if (dotCount > 1 || /^\\d{1,3}(\\.\\d{3})+$/.test(s)) {
      s = s.replace(/\\./g, '');
    }
  }

  const n = Number(s);
  return Number.isNaN(n) ? '' : n;
}

export function formatNumberLikeSheet(num: number | ''): string {
  if (num === '') return '';
  const rounded = Math.round(num * 100) / 100;
  const hasDecimals = Math.round((rounded % 1) * 100) !== 0;

  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(rounded);
}

export function formatArea2(num: number | ''): string {
  if (num === '') return '';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(num);
}

export function formatSqft(sqm: number | ''): string {
  const n = toNumber(sqm);
  if (n === '') return '';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true
  }).format(Math.round(n * 10.7639));
}

export function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getPostTitle(postType: string): string {
  const map: Record<string, string> = {
    NEW: '🔥NEW🔥',
    HOT_PRICE: '🔥HOT PRICE🔥',
    DISTRESS: '⚡QUICK SALE⚡',
    NEW_PRICE: '🔥NEW PRICE🔥',
    READY_TO_MOVE: '❗️READY TO MOVE❗️',
    REDUCED: '❗The price has been reduced❗'
  };
  return map[postType] || postType;
}

export function formatUnitLabel(value: string): string {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/\\bunit$/i.test(s)) return s;
  return s + ' unit';
}

export function formatRowLabel(value: string): string {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/\\brow$/i.test(s)) return s;
  return s + ' row';
}

export function isVillaObject(objectType: string): boolean {
  const s = String(objectType || '').trim().toLowerCase();
  return ['villa', 'townhouse', 'condo'].includes(s);
}
