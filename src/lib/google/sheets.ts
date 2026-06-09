import { google } from 'googleapis';
import { normalizeText } from '../posts/formatters';
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
