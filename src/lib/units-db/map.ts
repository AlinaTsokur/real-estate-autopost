import { RawUnit } from './units';

// Handover string for the post: "Ready to move" for ready units, otherwise the
// per-building handover date (falling back to the unit's own) as "Month YYYY".
function formatHandover(raw: RawUnit): string {
  if (raw.readiness === 'ready_vacant') return 'Ready to move';
  const d = raw.building_handover || raw.unit_handover;
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const toNum = (v: string | null): string | number => (v == null || v === '' ? '' : Number(v));

// Первое заполненное число из списка — площади в базе лежат в разных колонках.
const firstNum = (...vals: (string | null)[]): string | number => {
  for (const v of vals) {
    const n = toNum(v);
    if (n !== '' && Number(n) > 0) return n;
  }
  return '';
};

// Филсы в посте не нужны: база хранит 7284964.80, в объявлении это 7.284.965.
const toPrice = (v: string | null): string | number => {
  const n = toNum(v);
  return n === '' ? '' : Math.round(Number(n));
};

// Map a raw units-DB row (+ our emoji) into the PostData shape the builders use.
// postType is intentionally left out — the user always picks it in the UI.
export function mapRawUnitToPostData(raw: RawUnit, emoji: string) {
  return {
    project: raw.project_name,
    objectType: raw.property_type || 'Apartment', // isVillaObject picks apartment vs villa layout
    code: raw.code || '',
    // В посте про виллу строка «🌳 … unit» — это положение дома в ряду
    // (Middle / Corner), а не номер юнита. Номер живёт отдельно, для интерфейса.
    unit: raw.unit_position || '',
    unitNumber: raw.unit_number || '',
    type: raw.unit_type || '',
    view: raw.view || '',
    floor: raw.floor || '',
    areaM2: toNum(raw.area_sqm),
    // gross_area_sqm в этой базе не заполняют ни у одного юнита — площадь дома
    // лежит в area_sqm, иначе в посте выходило «Gross area 0,00 sqm».
    grossAreaM2: firstNum(raw.gross_area_sqm, raw.area_sqm),
    plotAreaM2: toNum(raw.plot_area_sqm),
    originalPrice: toPrice(raw.original_price_aed),
    oldPrice: toPrice(raw.old_price_aed),
    sellingPrice: toPrice(raw.selling_price_aed),
    approxRentalRate: raw.approx_rental_rate || '',
    paymentPlan: raw.payment_plan_label || '',
    rowName: raw.row_type || '',
    handover: formatHandover(raw),
    island: raw.island || '',
    emoji: emoji || '',
  };
}
