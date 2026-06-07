export function normalizeText(value: any): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function escapeHtml(text: any): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatArea2(num: number | string): string {
  const parsed = Number(num);
  if (Number.isNaN(parsed)) return String(num || '');

  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(parsed);
}

export function formatNumberLikeSheet(num: number | string): string {
  const parsed = Number(num);
  if (Number.isNaN(parsed)) return String(num || '');

  const rounded = Math.round(parsed * 100) / 100;
  const hasDecimals = Math.round((rounded % 1) * 100) !== 0;

  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(rounded);
}

export function toNumber(value: any): string | number {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return value;

  let s = String(value)
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/AED/gi, '')
    .replace(/[^\d,.\-]/g, '');

  if (!s) return '';

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    if (commaCount > 1 || /^\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (dotCount > 0) {
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return Number.isNaN(n) ? '' : n;
}

export function extractLeadingNumberText(value: any): string {
  const s = String(value || '').trim();
  if (!s) return '';

  const match = s.match(/[0-9][0-9.,\s]*/);
  return match ? match[0].trim() : '';
}

export function isVillaObject(objectType: string): boolean {
  const s = String(objectType || '').trim().toLowerCase();
  return ['villa', 'townhouse', 'condo'].includes(s);
}

export function formatUnitLabel(value: string): string {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/\bunit$/i.test(s)) return s;
  return s + ' unit';
}

export function formatRowLabel(value: string): string {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/\brow$/i.test(s)) return s;
  return s + ' row';
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

export function normalizeObjectId(value: any): string {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase();
}

export function formatHandoverDate(val: string): string {
  let s = String(val || '').trim();
  if (!s) return '';
  
  // Remove "from " prefix if it exists
  s = s.replace(/^from\s+/i, '');

  // Handle DD/MM/YYYY or MM/DD/YYYY from Sheets
  const parts = s.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    
    // Check if valid year
    if (parts[2].length === 4 && month >= 1 && month <= 12) {
      // Create date (assuming DD/MM/YYYY which is standard for UAE sheets)
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
  }

  // Handle YYYY-MM-DD
  const partsDash = s.split('-');
  if (partsDash.length === 3) {
    const year = parseInt(partsDash[0]);
    const month = parseInt(partsDash[1]);
    const day = parseInt(partsDash[2]);
    
    if (partsDash[0].length === 4 && month >= 1 && month <= 12) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
  }

  return s;
}
