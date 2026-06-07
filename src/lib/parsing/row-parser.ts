import { getProjectParseConfig, getConfig2Handover, findApproxRentalRateForObject } from '../google/sheets';
import { normalizeText, extractLeadingNumberText, formatHandoverDate } from '../posts/formatters';

export function splitPastedRow(raw: string): string[] {
  let parts = String(raw || '')
    .trim()
    .split('\t')
    .map(v => String(v || '').trim());

  if (parts.length < 5) {
    parts = String(raw || '')
      .trim()
      .split(/\s{2,}/)
      .map(v => String(v || '').trim());
  }

  return parts;
}

export function looksLikeFloor(value: string): boolean {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  return (
    /floor/.test(s) ||
    /^g$/.test(s) ||
    /^gf$/.test(s) ||
    /^ground/.test(s) ||
    /^\d+$/.test(s) ||
    /^\d+(st|nd|rd|th)$/i.test(s)
  );
}

export function getC3FloorByUnit(unit: string): string {
  const s = String(unit || '').trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('G')) return 'Ground Floor';
  if (s.startsWith('2')) return '2nd Floor';
  return '';
}

function parseC3ApartAuto(parts: string[], selectedProject: string, empty: any) {
  const unit = String(parts[0] || '').trim();
  const secondValue = String(parts[1] || '').trim();
  const hasFloor = looksLikeFloor(secondValue);

  if (hasFloor) {
    return {
      ...empty,
      objectType: 'Apartment',
      code: unit,
      unit: unit,
      floor: getC3FloorByUnit(unit) || parts[1] || '',
      type: parts[2] || '',
      view: parts[3] || '',
      originalPrice: '',
      sellingPrice: extractLeadingNumberText(parts[4] || ''),
      areaM2: extractLeadingNumberText(parts[6] || ''),
      project: selectedProject || '',
      handover: 'Ready to move'
    };
  }

  return {
    ...empty,
    objectType: 'Apartment',
    code: unit,
    unit: unit,
    floor: getC3FloorByUnit(unit) || '',
    type: parts[1] || '',
    view: parts[2] || '',
    originalPrice: '',
    sellingPrice: extractLeadingNumberText(parts[3] || ''),
    areaM2: extractLeadingNumberText(parts[5] || ''),
    project: selectedProject || '',
    handover: 'Ready to move'
  };
}

export function parseRowByFormat(parts: string[], config: any, selectedProject: string) {
  const format = String(config.parseFormat || 'APART_STANDARD').trim();
  const objectType = String(config.objectType || 'Apartment').trim();

  const empty = {
    objectType: objectType,
    parseFormat: format,
    code: '',
    unit: '',
    type: '',
    view: '',
    originalPrice: '',
    sellingPrice: '',
    areaM2: '',
    grossAreaM2: '',
    plotAreaM2: '',
    rowName: '',
    paymentPlan: '',
    project: selectedProject || '',
    handover: '',
    floor: '',
    approxRentalRate: ''
  };

  switch (format) {
    case 'APART_STANDARD':
      return {
        ...empty,
        objectType: 'Apartment',
        code: parts[0] || '',
        type: parts[1] || '',
        view: parts[2] || '',
        originalPrice: extractLeadingNumberText(parts[3] || ''),
        sellingPrice: extractLeadingNumberText(parts[4] || ''),
        areaM2: extractLeadingNumberText(parts[6] || ''),
        paymentPlan: parts[8] || '',
        project: selectedProject || parts[9] || ''
      };

    case 'APART_NO_VIEW':
      return {
        ...empty,
        objectType: 'Apartment',
        code: parts[0] || '',
        type: parts[1] || '',
        view: '',
        originalPrice: extractLeadingNumberText(parts[2] || ''),
        sellingPrice: extractLeadingNumberText(parts[3] || ''),
        areaM2: extractLeadingNumberText(parts[5] || ''),
        paymentPlan: parts[7] || '',
        project: selectedProject || parts[8] || ''
      };

    case 'C3_APART_AUTO':
      return parseC3ApartAuto(parts, selectedProject, empty);

    case 'VILLA_LAGOONS':
      return {
        ...empty,
        objectType: 'Villa',
        code: parts[0] || '',
        type: parts[1] || '',
        originalPrice: extractLeadingNumberText(parts[2] || ''),
        sellingPrice: extractLeadingNumberText(parts[3] || ''),
        grossAreaM2: extractLeadingNumberText(parts[5] || ''),
        plotAreaM2: extractLeadingNumberText(parts[6] || ''),
        rowName: parts[11] || '',
        unit: parts[12] || '',
        paymentPlan: parts[14] || '',
        project: selectedProject || ''
      };

    case 'SUSTAINABLE_NO_VIEW':
      return {
        ...empty,
        objectType: 'Villa',
        code: parts[0] || '',
        type: parts[1] || '',
        originalPrice: extractLeadingNumberText(parts[2] || ''),
        sellingPrice: extractLeadingNumberText(parts[3] || ''),
        grossAreaM2: extractLeadingNumberText(parts[5] || ''),
        plotAreaM2: '',
        paymentPlan: parts[7] || '',
        project: selectedProject || ''
      };

    case 'ALJURF_VILLA':
      return {
        ...empty,
        objectType: 'Villa',
        code: parts[0] || '',
        type: parts[2] || '',
        originalPrice: extractLeadingNumberText(parts[3] || ''),
        sellingPrice: extractLeadingNumberText(parts[4] || ''),
        grossAreaM2: extractLeadingNumberText(parts[6] || ''),
        plotAreaM2: extractLeadingNumberText(parts[7] || ''),
        rowName: parts[9] || '',
        unit: parts[10] || '',
        paymentPlan: parts[11] || '',
        project: selectedProject || ''
      };

    case 'VILLA_STANDARD':
      return {
        ...empty,
        objectType: 'Villa',
        code: parts[0] || '',
        type: parts[1] || '',
        originalPrice: extractLeadingNumberText(parts[2] || ''),
        sellingPrice: extractLeadingNumberText(parts[3] || ''),
        grossAreaM2: extractLeadingNumberText(parts[5] || ''),
        plotAreaM2: extractLeadingNumberText(parts[6] || ''),
        rowName: parts[7] || '',
        unit: parts[8] || '',
        paymentPlan: parts[10] || '',
        project: selectedProject || ''
      };

    case 'TOWNHOUSE_STANDARD':
      return {
        ...empty,
        objectType: 'Townhouse',
        code: parts[0] || '',
        type: parts[1] || '',
        originalPrice: extractLeadingNumberText(parts[2] || ''),
        sellingPrice: extractLeadingNumberText(parts[3] || ''),
        grossAreaM2: extractLeadingNumberText(parts[5] || ''),
        plotAreaM2: extractLeadingNumberText(parts[6] || ''),
        rowName: parts[8] || '',
        unit: parts[9] || '',
        paymentPlan: parts[10] || '',
        project: selectedProject || ''
      };

    default:
      return {
        ...empty,
        objectType: 'Apartment',
        code: parts[0] || '',
        type: parts[1] || '',
        view: parts[2] || '',
        originalPrice: extractLeadingNumberText(parts[3] || ''),
        sellingPrice: extractLeadingNumberText(parts[4] || ''),
        areaM2: extractLeadingNumberText(parts[6] || ''),
        paymentPlan: parts[8] || '',
        project: selectedProject || parts[9] || ''
      };
  }
}

export async function getAutoHandoverForPostBuilder(projectName: string, code: string, rawRowText: string) {
  const raw = String(rawRowText || '').toLowerCase();

  // If readiness is inside the row text itself
  if (raw.includes('ready to move') || raw.includes('ready-to-move') || raw.includes('сдан')) {
    return 'Ready to move';
  }

  // Use CONFIG2 handover prefix logic (already have getConfig2Handover from Catalog Builder logic)
  const codePrefix = String(code).replace(/\D/g, '').slice(0, 4);
  const result = await getConfig2Handover(projectName, codePrefix);

  if (!result || !result.value) {
    return '';
  }

  // Try to format to string Month YYYY and remove "from " for post builder
  return formatHandoverDate(result.value);
}

export async function parsePastedRow(pastedText: string, projectName: string) {
  const raw = String(pastedText || '').trim();
  if (!raw) throw new Error('Вставь строку с данными');

  const project = String(projectName || '').trim();
  
  // 1. Get config
  const config = await getProjectParseConfig(project);
  
  // 2. Split parts
  const parts = splitPastedRow(raw);

  // 3. Parse by format
  const parsed = parseRowByFormat(parts, config, project);

  // 4. Special overrides (e.g. C3 Garden Residence)
  if (normalizeText(parsed.project || project) === normalizeText('C3 Garden Residence')) {
    parsed.approxRentalRate = await findApproxRentalRateForObject(
      parsed.project || project,
      parsed.code,
      parsed.unit
    );
    parsed.handover = 'Ready to move';
    parsed.floor = getC3FloorByUnit(parsed.unit || parsed.code) || parsed.floor || '';
  } else {
    // Standard automatic handover
    parsed.handover = await getAutoHandoverForPostBuilder(
      parsed.project || project,
      parsed.code || parsed.unit,
      raw
    );
  }

  // Final format check to ensure dates like 31/01/2027 become January 2027
  if (parsed.handover) {
    parsed.handover = formatHandoverDate(parsed.handover);
  }

  return parsed;
}
