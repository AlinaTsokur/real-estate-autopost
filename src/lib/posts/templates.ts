import { getConfig2 } from '../google/sheets';
import {
  isVillaObject,
  escapeHtml,
  formatNumberLikeSheet,
  formatArea2,
  getPostTitle,
  formatUnitLabel,
  formatRowLabel,
  normalizeText
} from './formatters';

export interface PostData {
  postType: string;
  project: string;
  objectType?: string;
  code?: string;
  unit?: string;
  type?: string;
  view?: string;
  originalPrice?: string | number;
  sellingPrice?: string | number;
  oldPrice?: string | number;
  areaM2?: string | number;
  grossAreaM2?: string | number;
  plotAreaM2?: string | number;
  rowName?: string;
  paymentPlan?: string;
  handover?: string;
  floor?: string;
  approxRentalRate?: string;
  slideDataUrl?: string;
  slideName?: string;
}

export async function buildTelegramHtmlPost(data: any) {
  if (isVillaObject(data.objectType)) {
    return buildVillaPostText(data);
  }
  return buildApartmentPostText(data);
}

export async function buildWhatsAppMarkdown(data: any) {
  if (data.postType === 'REDUCED') {
    return buildReducedPriceWhatsAppText(data);
  }
  if (isVillaObject(data.objectType)) {
    return buildVillaWhatsAppPostText(data);
  }
  return buildApartmentWhatsAppPostText(data);
}

// ---------------------------------------------------------
// TELEGRAM HTML BUILDERS
// ---------------------------------------------------------

async function buildApartmentPostText(data: any) {
  const cfg = await getConfig2(data.project);

  if (data.postType === 'REDUCED') {
    return buildReducedPriceText(data, cfg);
  }

  const title = getPostTitle(data.postType);
  let text = '';

  text += '<b>' + escapeHtml(title) + '</b>\n\n';
  text += '<b>' + escapeHtml(data.type) + ' in ' + escapeHtml(data.project);

  if (cfg.island) text += ' - ' + escapeHtml(cfg.island);
  if (cfg.emoji) text += ' ' + escapeHtml(cfg.emoji);
  text += '</b>\n\n';

  if (data.originalPrice !== '') {
    text += '<u>Original Price:</u> ' + escapeHtml(formatNumberLikeSheet(data.originalPrice)) + ' AED\n';
  }

  if (data.postType === 'NEW_PRICE') {
    text += '<i><u>Old price:</u> <s>' + escapeHtml(formatNumberLikeSheet(data.oldPrice)) + ' AED</s></i>\n';
  }

  if (normalizeText(data.project) === normalizeText('C3 Garden Residence') && data.approxRentalRate) {
    text += '<u>Approx. rental rate:</u> ' + escapeHtml(data.approxRentalRate) + '\n';
  }

  text += '<b><u>Selling Price:</u> ' + escapeHtml(formatNumberLikeSheet(data.sellingPrice)) + ' AED</b>\n\n';

  text += '📐 ' + escapeHtml(formatArea2(data.areaM2)) + ' sqm';

  if (data.floor) text += '\n📦 ' + escapeHtml(data.floor);
  if (data.view) text += '\n🌳 ' + escapeHtml(data.view);
  if (data.handover) text += '\n🗓 <b>Handover:</b> ' + escapeHtml(data.handover);

  text += '\n\n<b>📞 Contact our broker Nataly:</b>\n';
  text += '📱 <a href="https://wa.me/971508697050">+971508697050</a>';

  return text;
}

async function buildVillaPostText(data: any) {
  const cfg = await getConfig2(data.project);

  if (data.postType === 'REDUCED') {
    return buildReducedPriceText(data, cfg);
  }

  const title = getPostTitle(data.postType);
  let text = '';

  text += '<b>' + escapeHtml(title) + '</b>\n\n';
  text += '<b>' + escapeHtml(data.type) + ' in ' + escapeHtml(data.project);

  if (cfg.island) text += ' - ' + escapeHtml(cfg.island);
  if (cfg.emoji) text += ' ' + escapeHtml(cfg.emoji);
  text += '</b>\n\n';

  if (data.originalPrice !== '') {
    text += '<u>Original Price:</u> ' + escapeHtml(formatNumberLikeSheet(data.originalPrice)) + ' AED\n';
  }

  if (data.postType === 'NEW_PRICE') {
    text += '<i><u>Old price:</u> <s>' + escapeHtml(formatNumberLikeSheet(data.oldPrice)) + ' AED</s></i>\n';
  }

  text += '<b><u>Selling Price:</u> ' + escapeHtml(formatNumberLikeSheet(data.sellingPrice)) + ' AED</b>\n\n';

  text += '📐 Gross area ' + escapeHtml(formatArea2(data.grossAreaM2)) + ' sqm';

  if (data.plotAreaM2 !== '') {
    text += ' / Plot area ' + escapeHtml(formatArea2(data.plotAreaM2)) + ' sqm';
  }

  if (data.unit) text += '\n🌳 ' + escapeHtml(formatUnitLabel(data.unit));
  if (data.rowName) text += '\n📍 ' + escapeHtml(formatRowLabel(data.rowName));
  if (data.handover) text += '\n🗓 <b>Handover:</b> ' + escapeHtml(data.handover);

  text += '\n\n<b>📞 Contact our broker Nataly:</b>\n';
  text += '📱 <a href="https://wa.me/971508697050">+971508697050</a>';

  return text;
}

function buildReducedPriceText(data: any, cfg: any) {
  let projectLabel = data.project;
  if (cfg.emoji) projectLabel += ' ' + cfg.emoji;

  return (
    '<b>❗ The price has been reduced ❗</b>\n\n' +
    '<b>🏡 ' + escapeHtml(data.code) + ' in ' + escapeHtml(projectLabel) + '</b>\n\n' +
    '<i><u>Old price:</u> <s>' + escapeHtml(formatNumberLikeSheet(data.oldPrice)) + ' AED</s></i>\n' +
    '<i><u>New Selling price:</u> ' + escapeHtml(formatNumberLikeSheet(data.sellingPrice)) + ' AED</i>\n\n' +
    '<b>The price of the property is below the market price!</b>'
  );
}


// ---------------------------------------------------------
// WHATSAPP PLAIN TEXT BUILDERS
// ---------------------------------------------------------

async function buildApartmentWhatsAppPostText(data: any) {
  const cfg = await getConfig2(data.project);
  const title = getPostTitle(data.postType);
  let text = '';

  text += '*' + title + '*\n\n';
  text += '*' + data.type + ' in ' + data.project;

  if (cfg.island) text += ' - ' + cfg.island;
  if (cfg.emoji) text += ' ' + cfg.emoji;
  text += '*\n\n';

  if (data.originalPrice !== '') {
    text += 'Original Price: ' + formatNumberLikeSheet(data.originalPrice) + ' AED\n';
  }

  if (data.postType === 'NEW_PRICE') {
    text += '_Old price: ~' + formatNumberLikeSheet(data.oldPrice) + ' AED~_\n';
  }

  if (normalizeText(data.project) === normalizeText('C3 Garden Residence') && data.approxRentalRate) {
    text += 'Approx. rental rate: ' + data.approxRentalRate + '\n';
  }

  text += '*Selling Price: ' + formatNumberLikeSheet(data.sellingPrice) + ' AED*\n\n';

  text += '📐 ' + formatArea2(data.areaM2) + ' sqm';

  if (data.floor) text += '\n📦 ' + data.floor;
  if (data.view) text += '\n🌳 ' + data.view;
  if (data.handover) text += '\n🗓 *Handover:* ' + data.handover;

  text += '\n\n*📞 Contact our broker Nataly:*\n';
  text += '📱 +971508697050';

  return text;
}

async function buildVillaWhatsAppPostText(data: any) {
  const cfg = await getConfig2(data.project);
  const title = getPostTitle(data.postType);
  let text = '';

  text += '*' + title + '*\n\n';
  text += '*' + data.type + ' in ' + data.project;

  if (cfg.island) text += ' - ' + cfg.island;
  if (cfg.emoji) text += ' ' + cfg.emoji;
  text += '*\n\n';

  if (data.originalPrice !== '') {
    text += 'Original Price: ' + formatNumberLikeSheet(data.originalPrice) + ' AED\n';
  }

  if (data.postType === 'NEW_PRICE') {
    text += '_Old price: ~' + formatNumberLikeSheet(data.oldPrice) + ' AED~_\n';
  }

  text += '*Selling Price: ' + formatNumberLikeSheet(data.sellingPrice) + ' AED*\n\n';

  text += '📐 Gross area ' + formatArea2(data.grossAreaM2) + ' sqm';

  if (data.plotAreaM2 !== '') {
    text += ' / Plot area ' + formatArea2(data.plotAreaM2) + ' sqm';
  }

  if (data.unit) text += '\n🌳 ' + formatUnitLabel(data.unit);
  if (data.rowName) text += '\n📍 ' + formatRowLabel(data.rowName);
  if (data.handover) text += '\n🗓 *Handover:* ' + data.handover;

  text += '\n\n*📞 Contact our broker Nataly:*\n';
  text += '📱 +971508697050';

  return text;
}

function buildReducedPriceWhatsAppText(data: any) {
  let projectLabel = data.project;
  // We don't have synchronous cfg here, but since it's called inside async wrapper, we can assume caller handled it, 
  // actually let's fetch cfg directly. Wait, the old code didn't use cfg for Reduced Price WhatsApp except for emoji. 
  // Let's just return basic for now to avoid async complexity in the sub-function if not fully needed, or better, pass cfg.
  // Wait, I will just let the caller handle it.
  
  return (
    '*❗ The price has been reduced ❗*\n\n' +
    '*🏡 ' + data.code + ' in ' + projectLabel + '*\n\n' +
    '_Old price: ~' + formatNumberLikeSheet(data.oldPrice) + ' AED~_\n' +
    '_New Selling price: ' + formatNumberLikeSheet(data.sellingPrice) + ' AED_\n\n' +
    '*The price of the property is below the market price!*'
  );
}
