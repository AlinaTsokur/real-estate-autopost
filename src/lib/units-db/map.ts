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

// Map a raw units-DB row (+ our emoji) into the PostData shape the builders use.
// postType is intentionally left out — the user always picks it in the UI.
export function mapRawUnitToPostData(raw: RawUnit, emoji: string) {
  return {
    project: raw.project_name,
    objectType: raw.property_type || 'Apartment', // isVillaObject picks apartment vs villa layout
    code: raw.code || '',
    unit: raw.unit_number || '',
    type: raw.unit_type || '',
    view: raw.view || '',
    floor: raw.floor || '',
    areaM2: toNum(raw.area_sqm),
    grossAreaM2: toNum(raw.gross_area_sqm),
    plotAreaM2: toNum(raw.plot_area_sqm),
    originalPrice: toNum(raw.original_price_aed),
    oldPrice: toNum(raw.old_price_aed),
    sellingPrice: toNum(raw.selling_price_aed),
    approxRentalRate: raw.approx_rental_rate || '',
    paymentPlan: raw.payment_plan_label || '',
    rowName: raw.row_type || '',
    handover: formatHandover(raw),
    island: raw.island || '',
    emoji: emoji || '',
  };
}
