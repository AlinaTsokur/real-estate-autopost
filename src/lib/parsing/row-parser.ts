export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractLeadingNumberText(value: string | null | undefined): string {
  const s = String(value || '').trim();
  if (!s) return '';
  const match = s.match(/[0-9][0-9.,\\s]*/);
  return match ? match[0].trim() : '';
}

export function looksLikeFloor(value: string | null | undefined): boolean {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  return (
    /floor/.test(s) ||
    /^g$/.test(s) ||
    /^gf$/.test(s) ||
    /^ground/.test(s) ||
    /^\\d+$/.test(s) ||
    /^\\d+(st|nd|rd|th)$/i.test(s)
  );
}

export function getC3FloorByUnit(unit: string | null | undefined): string {
  const s = String(unit || '').trim().toUpperCase();
  if (!s) return '';
  if (s.startsWith('G')) return 'Ground Floor';
  if (s.startsWith('2')) return '2nd Floor';
  return '';
}

export function parseRowByFormat(parts: string[], config: { parseFormat: string; objectType: string }, selectedProject: string) {
  const format = config.parseFormat || 'APART_STANDARD';
  const objectType = config.objectType || 'Apartment';

  const empty = {
    objectType,
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
    floor: ''
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
