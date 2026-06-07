import {
  escapeHtml,
  getPostTitle,
  formatNumberLikeSheet,
  formatArea2,
  formatUnitLabel,
  formatRowLabel,
  isVillaObject,
  normalizeText,
} from './formatters';

export interface PostData {
  objectType: string;
  postType: string;
  project: string;
  code: string;
  unit: string;
  type: string;
  view?: string;
  rowName?: string;
  approxRentalRate?: string;
  originalPrice: number | '';
  sellingPrice: number | '';
  oldPrice: number | '';
  area: number | '';
  grossArea: number | '';
  plotArea: number | '';
  paymentPlan?: string;
  handover?: string;
  floor?: string;
  slideDataUrl?: string;
  slideName?: string;
}

export function buildTelegramHtmlPost(data: PostData, cfg: { island?: string; emoji?: string }): string {
  if (data.postType === 'REDUCED') {
    return buildReducedPriceHtml(data, cfg);
  }

  if (isVillaObject(data.objectType)) {
    return buildVillaHtml(data, cfg);
  }

  return buildApartmentHtml(data, cfg);
}

function buildApartmentHtml(data: PostData, cfg: { island?: string; emoji?: string }) {
  const title = getPostTitle(data.postType);
  let text = `<b>${escapeHtml(title)}</b>\\n\\n`;

  text += `<b>${escapeHtml(data.type)} in ${escapeHtml(data.project)}`;
  if (cfg.island) text += ` - ${escapeHtml(cfg.island)}`;
  if (cfg.emoji) text += ` ${escapeHtml(cfg.emoji)}`;
  text += `</b>\\n\\n`;

  if (data.originalPrice !== '') {
    text += `<u>Original Price:</u> ${escapeHtml(formatNumberLikeSheet(data.originalPrice))} AED\\n`;
  }

  if (data.postType === 'NEW_PRICE' && data.oldPrice !== '') {
    text += `<i><u>Old price:</u> <s>${escapeHtml(formatNumberLikeSheet(data.oldPrice))} AED</s></i>\\n`;
  }

  if (normalizeText(data.project) === normalizeText('C3 Garden Residence') && data.approxRentalRate) {
    text += `<u>Approx. rental rate:</u> ${escapeHtml(data.approxRentalRate)}\\n`;
  }

  text += `<b><u>Selling Price:</u> ${escapeHtml(formatNumberLikeSheet(data.sellingPrice))} AED</b>\\n\\n`;

  text += `📐 ${escapeHtml(formatArea2(data.area))} sqm`;

  if (data.floor) {
    text += `\\n📦 ${escapeHtml(data.floor)}`;
  }

  if (data.view) {
    text += `\\n🌳 ${escapeHtml(data.view)}`;
  }

  if (data.handover) {
    text += `\\n🗓 <b>Handover:</b> ${escapeHtml(data.handover)}`;
  }

  text += `\\n\\n<b>📞 Contact our broker Nataly:</b>\\n`;
  text += `📱 <a href="https://wa.me/971508697050">+971508697050</a>`;

  return text;
}

function buildVillaHtml(data: PostData, cfg: { island?: string; emoji?: string }) {
  const title = getPostTitle(data.postType);
  let text = `<b>${escapeHtml(title)}</b>\\n\\n`;

  text += `<b>${escapeHtml(data.type)} in ${escapeHtml(data.project)}`;
  if (cfg.island) text += ` - ${escapeHtml(cfg.island)}`;
  if (cfg.emoji) text += ` ${escapeHtml(cfg.emoji)}`;
  text += `</b>\\n\\n`;

  if (data.originalPrice !== '') {
    text += `<u>Original Price:</u> ${escapeHtml(formatNumberLikeSheet(data.originalPrice))} AED\\n`;
  }

  if (data.postType === 'NEW_PRICE' && data.oldPrice !== '') {
    text += `<i><u>Old price:</u> <s>${escapeHtml(formatNumberLikeSheet(data.oldPrice))} AED</s></i>\\n`;
  }

  text += `<b><u>Selling Price:</u> ${escapeHtml(formatNumberLikeSheet(data.sellingPrice))} AED</b>\\n\\n`;

  text += `📐 Gross area ${escapeHtml(formatArea2(data.grossArea))} sqm`;

  if (data.plotArea !== '') {
    text += ` / Plot area ${escapeHtml(formatArea2(data.plotArea))} sqm`;
  }

  if (data.unit) {
    text += `\\n🌳 ${escapeHtml(formatUnitLabel(data.unit))}`;
  }

  if (data.rowName) {
    text += `\\n📍 ${escapeHtml(formatRowLabel(data.rowName))}`;
  }

  if (data.handover) {
    text += `\\n🗓 <b>Handover:</b> ${escapeHtml(data.handover)}`;
  }

  text += `\\n\\n<b>📞 Contact our broker Nataly:</b>\\n`;
  text += `📱 <a href="https://wa.me/971508697050">+971508697050</a>`;

  return text;
}

function buildReducedPriceHtml(data: PostData, cfg: { island?: string; emoji?: string }) {
  let projectLabel = data.project;
  if (cfg.emoji) projectLabel += ` ${cfg.emoji}`;

  return (
    `<b>❗ The price has been reduced ❗</b>\\n\\n` +
    `<b>🏡 ${escapeHtml(data.code)} in ${escapeHtml(projectLabel)}</b>\\n\\n` +
    `<i><u>Old price:</u> <s>${escapeHtml(formatNumberLikeSheet(data.oldPrice))} AED</s></i>\\n` +
    `<i><u>New Selling price:</u> ${escapeHtml(formatNumberLikeSheet(data.sellingPrice))} AED</i>\\n\\n` +
    `<b>The price of the property is below the market price!</b>`
  );
}

export function buildWhatsAppMarkdown(data: PostData, cfg: { island?: string; emoji?: string }): string {
  if (data.postType === 'REDUCED') {
    return buildReducedPriceWhatsApp(data, cfg);
  }

  if (isVillaObject(data.objectType)) {
    return buildVillaWhatsApp(data, cfg);
  }

  return buildApartmentWhatsApp(data, cfg);
}

function buildApartmentWhatsApp(data: PostData, cfg: { island?: string; emoji?: string }) {
  const title = getPostTitle(data.postType);
  let text = `*${title}*\\n\\n`;

  text += `*${data.type} in ${data.project}`;
  if (cfg.island) text += ` - ${cfg.island}`;
  if (cfg.emoji) text += ` ${cfg.emoji}`;
  text += `*\\n\\n`;

  if (data.originalPrice !== '') {
    text += `Original Price: ${formatNumberLikeSheet(data.originalPrice)} AED\\n`;
  }

  if (data.postType === 'NEW_PRICE' && data.oldPrice !== '') {
    text += `_Old price: ~${formatNumberLikeSheet(data.oldPrice)} AED~_\\n`;
  }

  if (normalizeText(data.project) === normalizeText('C3 Garden Residence') && data.approxRentalRate) {
    text += `Approx. rental rate: ${data.approxRentalRate}\\n`;
  }

  text += `*Selling Price: ${formatNumberLikeSheet(data.sellingPrice)} AED*\\n\\n`;

  text += `📐 ${formatArea2(data.area)} sqm`;

  if (data.floor) {
    text += `\\n📦 ${data.floor}`;
  }

  if (data.view) {
    text += `\\n🌳 ${data.view}`;
  }

  if (data.handover) {
    text += `\\n🗓 *Handover:* ${data.handover}`;
  }

  text += `\\n\\n*📞 Contact our broker Nataly:*\\n`;
  text += `📱 +971508697050`;

  return text;
}

function buildVillaWhatsApp(data: PostData, cfg: { island?: string; emoji?: string }) {
  const title = getPostTitle(data.postType);
  let text = `*${title}*\\n\\n`;

  text += `*${data.type} in ${data.project}`;
  if (cfg.island) text += ` - ${cfg.island}`;
  if (cfg.emoji) text += ` ${cfg.emoji}`;
  text += `*\\n\\n`;

  if (data.originalPrice !== '') {
    text += `Original Price: ${formatNumberLikeSheet(data.originalPrice)} AED\\n`;
  }

  if (data.postType === 'NEW_PRICE' && data.oldPrice !== '') {
    text += `_Old price: ~${formatNumberLikeSheet(data.oldPrice)} AED~_\\n`;
  }

  text += `*Selling Price: ${formatNumberLikeSheet(data.sellingPrice)} AED*\\n\\n`;

  text += `📐 Gross area ${formatArea2(data.grossArea)} sqm`;

  if (data.plotArea !== '') {
    text += ` / Plot area ${formatArea2(data.plotArea)} sqm`;
  }

  if (data.unit) {
    text += `\\n🌳 ${formatUnitLabel(data.unit)}`;
  }

  if (data.rowName) {
    text += `\\n📍 ${formatRowLabel(data.rowName)}`;
  }

  if (data.handover) {
    text += `\\n🗓 *Handover:* ${data.handover}`;
  }

  text += `\\n\\n*📞 Contact our broker Nataly:*\\n`;
  text += `📱 +971508697050`;

  return text;
}

function buildReducedPriceWhatsApp(data: PostData, cfg: { island?: string; emoji?: string }) {
  let projectLabel = data.project;
  if (cfg.emoji) projectLabel += ` ${cfg.emoji}`;

  return (
    `*❗ The price has been reduced ❗*\\n\\n` +
    `*🏡 ${data.code} in ${projectLabel}*\\n\\n` +
    `_Old price: ~${formatNumberLikeSheet(data.oldPrice)} AED~_\\n` +
    `_New Selling price: ${formatNumberLikeSheet(data.sellingPrice)} AED_\\n\\n` +
    `*The price of the property is below the market price!*`
  );
}
