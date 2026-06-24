import { google } from 'googleapis';
import { normalizeText, toNumber } from '../posts/formatters';
import { getGoogleAuthClient } from './auth';

export async function getGoogleSheetsClient() {
  const auth = await getGoogleAuthClient();
  return google.sheets({ version: 'v4', auth });
}

export async function getSheetData(spreadsheetId: string, sheetName: string) {
  if (!spreadsheetId) throw new Error('Spreadsheet ID not configured');

  const sheets = await getGoogleSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  return response.data.values || [];
}

export async function getProjectParseConfig(projectName: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID || '';
  const data = await getSheetData(spreadsheetId, 'PROJECT_PARSE_CONFIG');
  if (data.length < 2) return { objectType: 'Apartment', parseFormat: 'APART_STANDARD' };

  const headers = data[0].map(h => String(h).trim());
  const projectCol = headers.indexOf('Project Name');
  const objectTypeCol = headers.indexOf('Object Type');
  const parseFormatCol = headers.indexOf('Parse Format');

  if (projectCol === -1) return { objectType: 'Apartment', parseFormat: 'APART_STANDARD' };

  const target = normalizeText(projectName);

  for (let i = 1; i < data.length; i++) {
    if (normalizeText(data[i][projectCol]) === target) {
      return {
        objectType: objectTypeCol !== -1 && data[i][objectTypeCol] ? String(data[i][objectTypeCol]).trim() : 'Apartment',
        parseFormat: parseFormatCol !== -1 && data[i][parseFormatCol] ? String(data[i][parseFormatCol]).trim() : 'APART_STANDARD',
      };
    }
  }

  return { objectType: 'Apartment', parseFormat: 'APART_STANDARD' };
}

export async function getConfig2(projectName: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID || '';
  const data = await getSheetData(spreadsheetId, 'CONFIG2');
  if (data.length < 2) return { island: '', emoji: '' };

  const headers = data[0].map(h => normalizeText(String(h).trim()));
  const projectCol = headers.findIndex(h => h === normalizeText('Project Name') || h === normalizeText('Проект'));
  const islandCol = headers.findIndex(h => h === normalizeText('Island') || h === normalizeText('Остров'));
  const emojiCol = headers.findIndex(h => h === normalizeText('Emoji') || h === normalizeText('Эмоджи'));

  if (projectCol === -1) return { island: '', emoji: '' };

  const target = normalizeText(projectName);

  for (let i = 1; i < data.length; i++) {
    if (normalizeText(data[i][projectCol]) === target) {
      return {
        island: islandCol !== -1 ? String(data[i][islandCol] || '').trim() : '',
        emoji: emojiCol !== -1 ? String(data[i][emojiCol] || '').trim() : '',
      };
    }
  }

  return { island: '', emoji: '' };
}

export async function getConfig2Handover(projectName: string, codePrefix: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID || '';
  const data = await getSheetData(spreadsheetId, 'CONFIG2');
  if (data.length < 2) return { value: '', warning: 'CONFIG2 is empty' };

  const headers = data[0].map(h => normalizeText(String(h).trim()));
  const projectCol = headers.findIndex(h => h === normalizeText('Project Name') || h === normalizeText('Проект'));
  const prefixCol = headers.findIndex(h => h === normalizeText('Code Prefix') || h === normalizeText('Код префикс'));
  const handoverCol = headers.findIndex(h => h === normalizeText('Handover Date') || h === normalizeText('Дата сдачи'));

  if (projectCol === -1 || prefixCol === -1 || handoverCol === -1) {
    return { value: '', warning: 'Required columns missing in CONFIG2' };
  }

  const targetProject = normalizeText(projectName);

  // 1. Exact match
  let foundEmptyMatch = false;
  for (let i = 1; i < data.length; i++) {
    const rowProject = normalizeText(data[i][projectCol]);
    const rowPrefix = String(data[i][prefixCol]).replace(/\D/g, '').slice(0, 4);

    if (rowProject === targetProject && rowPrefix === codePrefix) {
      const value = String(data[i][handoverCol] || '').trim();
      if (value) {
        return { value, warning: '' };
      }
      foundEmptyMatch = true;
    }
  }

  // 2. Prefix only match
  for (let i = 1; i < data.length; i++) {
    const rowPrefix = String(data[i][prefixCol]).replace(/\D/g, '').slice(0, 4);
    if (rowPrefix === codePrefix) {
      const value = String(data[i][handoverCol] || '').trim();
      if (value) {
        return { value, warning: '' };
      }
    }
  }

  if (foundEmptyMatch) {
    return { value: '', warning: 'Handover empty for prefix ' + codePrefix };
  }

  return { value: '', warning: 'Handover not found in CONFIG2 for prefix ' + codePrefix };
}

export async function updatePublicationDate(unitCode: string) {
  // Finds the unit in OBJECTS sheet and writes today's date to "Publication Date" or similar column
  const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_OBJECTS_ID not configured');

  const sheets = await getGoogleSheetsClient();
  const sheetName = 'OBJECTS';
  const data = await getSheetData(spreadsheetId, sheetName);

  if (data.length < 2) throw new Error('OBJECTS sheet is empty');

  const headers = data[0].map(h => normalizeText(String(h).trim()));
  const codeCol = headers.findIndex(h => h === normalizeText('Code'));
  const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
  
  // Find date column, or create one? Try to find existing "Publication Date" or "Date"
  let dateCol = headers.findIndex(h => h === normalizeText('Publication Date') || h === normalizeText('Дата публикации') || h === normalizeText('Output Date'));
  
  if (codeCol === -1 && unitCol === -1) {
    throw new Error('No Code or Unit column in OBJECTS');
  }

  const targetCode = normalizeText(unitCode.replace(/\\s+/g, '').toLowerCase());

  let targetRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    const rowCode = codeCol !== -1 ? normalizeText(String(data[i][codeCol]).replace(/\\s+/g, '').toLowerCase()) : '';
    const rowUnit = unitCol !== -1 ? normalizeText(String(data[i][unitCol]).replace(/\\s+/g, '').toLowerCase()) : '';

    if (rowCode === targetCode || rowUnit === targetCode) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error(`Unit ${unitCode} not found in OBJECTS`);
  }

  // If date column is not found, we should probably append a new header
  if (dateCol === -1) {
    dateCol = headers.length; // Append to the end
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${getColLetter(dateCol)}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Publication Date']]
      }
    });
  }

  const today = new Date().toLocaleDateString('ru-RU'); // Or desired format
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${getColLetter(dateCol)}${targetRowIndex + 1}`, // +1 because rows are 1-indexed
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[today]]
    }
  });

  return true;
}

function getColLetter(index: number) {
  let temp = index;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export async function findApproxRentalRateForObject(projectName: string, code: string, unit: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
  if (!spreadsheetId) return '';

  const data = await getSheetData(spreadsheetId, 'Abu Dhabi');
  if (data.length < 2) return '';

  const headers = data[0].map(h => normalizeText(String(h || '').trim()));
  
  const projectCol = headers.findIndex(h => h === normalizeText('Project Name') || h === normalizeText('Проект'));
  const codeCol = headers.findIndex(h => h === normalizeText('Code') || h === normalizeText('Код'));
  const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
  const rentalCol = headers.findIndex(h => h === normalizeText('Approx. rental rate'));

  if (projectCol === -1 || rentalCol === -1) return '';

  const targetProject = normalizeText(projectName);
  const targetCode = String(code || '').replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();
  const targetUnit = String(unit || '').replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();

  if (!targetProject || (!targetCode && !targetUnit)) return '';

  for (let i = 1; i < data.length; i++) {
    const rowProject = normalizeText(data[i][projectCol]);
    if (rowProject !== targetProject) continue;

    const rowCode = codeCol !== -1 ? String(data[i][codeCol]).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase() : '';
    const rowUnit = unitCol !== -1 ? String(data[i][unitCol]).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase() : '';

    const matchByCode = targetCode && rowCode && rowCode === targetCode;
    const matchByUnit = targetUnit && rowUnit && rowUnit === targetUnit;
    const matchCodeToUnit = targetCode && rowUnit && rowCode === targetUnit;
    const matchUnitToCode = targetUnit && rowCode && rowUnit === targetCode;

    if (matchByCode || matchByUnit || matchCodeToUnit || matchUnitToCode) {
      return String(data[i][rentalCol] || '').trim();
    }
  }

  return '';
}

export async function getOriginalPriceForObject(unitCode: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
  if (!spreadsheetId) return '';

  const data = await getSheetData(spreadsheetId, 'Abu Dhabi');
  if (data.length < 2) return '';

  const headers = data[0].map(h => normalizeText(String(h || '').trim()));
  
  const codeCol = headers.findIndex(h => h === normalizeText('Code') || h === normalizeText('Код'));
  const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
  const priceCol = headers.findIndex(h => h === normalizeText('Original Price') || h === normalizeText('Цена'));

  if ((codeCol === -1 && unitCol === -1) || priceCol === -1) return '';

  const targetCode = String(unitCode || '').replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();

  if (!targetCode) return '';

  for (let i = 1; i < data.length; i++) {
    const rowCode = codeCol !== -1 ? String(data[i][codeCol]).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase() : '';
    const rowUnit = unitCol !== -1 ? String(data[i][unitCol]).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase() : '';

    if (rowCode === targetCode || rowUnit === targetCode) {
      return String(data[i][priceCol] || '').trim();
    }
  }

  return '';
}

// #d9ead3 — approved green
const APPROVED_COLOR = { red: 217 / 255, green: 234 / 255, blue: 211 / 255 };
const APPROVED_SHEET_GID = 1747337860;

export async function approveUnitRow(code: string, unit?: string): Promise<{ row: number; sheet: string }> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_OBJECTS_ID not configured');

  const sheets = await getGoogleSheetsClient();

  // Resolve sheet name from GID
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetTitle = meta.data.sheets?.find(s => s.properties?.sheetId === APPROVED_SHEET_GID)?.properties?.title;
  if (!sheetTitle) throw new Error(`Sheet GID ${APPROVED_SHEET_GID} not found`);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetTitle });
  const rows = res.data.values ?? [];
  if (rows.length < 2) throw new Error('Sheet is empty');

  const headers = (rows[0] as unknown[]).map(h => String(h).trim().toLowerCase());
  const unitCol = headers.indexOf('unit');
  const codeCol = headers.findIndex(h => h === 'код' || h === 'code');

  const norm = (v: unknown) =>
    String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();

  const targetCode = norm(code);
  const targetUnit = norm(unit ?? '');

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const rowCode = norm(r[codeCol]);
    const rowUnit = norm(r[unitCol]);
    if ((targetCode && rowCode === targetCode) || (targetUnit && rowUnit === targetUnit)) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) throw new Error(`Unit not found: code=${code} unit=${unit}`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: APPROVED_SHEET_GID, startRowIndex: rowIndex, endRowIndex: rowIndex + 1 },
          cell: { userEnteredFormat: { backgroundColor: APPROVED_COLOR } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      }],
    },
  });

  // Write approval date to the correct column
  const now = new Date();
  const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  const dateAnnouncedCol = headers.findIndex(h => h === 'дата объявления');
  const datePriceChangeCol = headers.findIndex(h => h === 'объявление изменения цены');

  const row = rows[rowIndex] as unknown[];
  const dateAnnouncedVal = dateAnnouncedCol !== -1 ? String(row[dateAnnouncedCol] ?? '').trim() : '';

  let targetCol = -1;
  if (dateAnnouncedCol !== -1 && !dateAnnouncedVal) {
    targetCol = dateAnnouncedCol;
  } else if (datePriceChangeCol !== -1) {
    targetCol = datePriceChangeCol;
  }

  if (targetCol !== -1) {
    const colLetter = getColLetter(targetCol);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!${colLetter}${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[today]] },
    });
  }

  return { row: rowIndex + 1, sheet: sheetTitle };
}

export async function getC3Units(): Promise<string[]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) return [];

  const data = await getSheetData(spreadsheetId, 'OBJECTS');
  if (data.length < 2) return [];

  const headers = data[0].map(h => normalizeText(String(h || '').trim()));
  const projectCol = headers.findIndex(h => h === normalizeText('Project Name'));
  const unitCol = headers.findIndex(h => h === normalizeText('Unit'));

  if (projectCol === -1 || unitCol === -1) return [];

  const targetProject = normalizeText('C3 Garden Residence');
  const units: string[] = [];

  for (let i = 1; i < data.length; i++) {
    const rowProject = normalizeText(data[i][projectCol]);
    if (rowProject === targetProject) {
      const unit = String(data[i][unitCol] || '').trim();
      if (unit) units.push(unit);
    }
  }

  return units;
}

export async function getC3UnitData(unitStr: string): Promise<any> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');

  const data = await getSheetData(spreadsheetId, 'OBJECTS');
  if (data.length < 2) throw new Error('OBJECTS tab is empty');

  const headers = data[0].map(h => normalizeText(String(h || '').trim()));
  const projectCol = headers.findIndex(h => h === normalizeText('Project Name'));
  const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
  
  const codeCol = headers.findIndex(h => h === normalizeText('Code'));
  const typeCol = headers.findIndex(h => h === normalizeText('Type'));
  const viewCol = headers.findIndex(h => h === normalizeText('View'));
  const floorCol = headers.findIndex(h => h === normalizeText('Floor'));
  const priceCol = headers.findIndex(h => h === normalizeText('Selling Price, AED'));
  const areaCol = headers.findIndex(h => h === normalizeText('Area, m2'));
  const rentalCol = headers.findIndex(h => h === normalizeText('Approx. rental rate'));

  if (projectCol === -1 || unitCol === -1) throw new Error('Missing columns in OBJECTS');

  const targetProject = normalizeText('C3 Garden Residence');
  const targetUnit = String(unitStr).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowProject = normalizeText(data[i][projectCol]);
    const rowUnit = String(data[i][unitCol] || '').replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/^#/, '').trim().toLowerCase();

    if (rowProject === targetProject && rowUnit === targetUnit) {
      const unitVal = String(data[i][unitCol] || '').trim();
      let floorVal = floorCol !== -1 ? String(data[i][floorCol] || '').trim() : '';
      if (!floorVal) {
        if (unitVal.toUpperCase().startsWith('G')) floorVal = 'Ground Floor';
        else if (unitVal.startsWith('2')) floorVal = '2nd Floor';
      }

      return {
        objectType: 'Apartment',
        project: 'C3 Garden Residence',
        code: codeCol !== -1 ? String(data[i][codeCol] || '').trim() : '',
        unit: unitVal,
        type: typeCol !== -1 ? String(data[i][typeCol] || '').trim() : '',
        view: viewCol !== -1 ? String(data[i][viewCol] || '').trim() : '',
        floor: floorVal,
        sellingPrice: priceCol !== -1 ? toNumber(String(data[i][priceCol] || '')) : '',
        areaM2: areaCol !== -1 ? toNumber(String(data[i][areaCol] || '')) : '',
        approxRentalRate: rentalCol !== -1 ? String(data[i][rentalCol] || '').trim() : '',
        handover: 'Ready to move',
        postType: 'READY_TO_MOVE'
      };
    }
  }

  return null;
}
