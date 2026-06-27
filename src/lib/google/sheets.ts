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

// ── WA QUEUE ─────────────────────────────────────────────────────────────────

const WA_QUEUE_SHEET = 'WA_QUEUE';
// Columns: A id | B created_at | C label | D wa_text | E drive_file_id | F scheduled_at | G status | H (unused) | I cfg_wa_chatid
// Row with id=CONFIG stores the WhatsApp chat id in column I.
// scheduled_at format: "YYYY-MM-DD HH:MM" interpreted as Dubai wall-clock time.

async function getSheetIdByTitle(
  sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>,
  spreadsheetId: string,
  title: string,
): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === title);
  if (sheet?.properties?.sheetId == null) throw new Error(`Sheet "${title}" not found`);
  return sheet.properties.sheetId;
}

async function ensureWaQueueSheet(sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const exists = meta.data.sheets?.some(s => s.properties?.title === WA_QUEUE_SHEET);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: WA_QUEUE_SHEET } } }] },
    });
    const headers = ['id', 'created_at', 'label', 'wa_text', 'drive_file_id', 'scheduled_at', 'status', '', 'cfg_wa_chatid'];
    const configRow = ['CONFIG', '', '', '', '', '', '', '', '37257957905@c.us'];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${WA_QUEUE_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers, configRow] },
    });
  }
}

export interface WaQueueItem {
  rowIndex: number;
  id: string;
  created_at: string;
  label: string;
  wa_text: string;
  drive_file_id: string;
  scheduled_at: string;
  status: string;
}

export interface WaQueueConfig {
  wa_chatid: string;
  configRowIndex: number;
}

export async function getWaQueue(): Promise<{ config: WaQueueConfig; items: WaQueueItem[] }> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');

  const sheets = await getGoogleSheetsClient();
  await ensureWaQueueSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: WA_QUEUE_SHEET });
  const rows = res.data.values || [];

  let config: WaQueueConfig = { wa_chatid: '', configRowIndex: -1 };
  const items: WaQueueItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[0] ?? '').trim();

    if (id === 'CONFIG') {
      config = {
        wa_chatid: String(row[8] ?? '').trim(),
        configRowIndex: i + 1, // 1-indexed sheet row
      };
      continue;
    }

    if (!id) continue;

    const sched = String(row[5] ?? '').trim();
    // Old test rows stored 'true'/'false' here; ignore those as a schedule.
    const scheduled_at = /^\d{4}-\d{2}-\d{2}/.test(sched) ? sched : '';

    items.push({
      rowIndex: i + 1,
      id,
      created_at: String(row[1] ?? '').trim(),
      label: String(row[2] ?? '').trim(),
      wa_text: String(row[3] ?? '').trim(),
      drive_file_id: String(row[4] ?? '').trim(),
      scheduled_at,
      status: String(row[6] ?? '').trim() || 'WAITING',
    });
  }

  return { config, items };
}

export async function addWaQueueItem(label: string, waText: string, driveFileId: string): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');

  const sheets = await getGoogleSheetsClient();
  await ensureWaQueueSheet(sheets, spreadsheetId);

  const id = Date.now().toString();
  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${WA_QUEUE_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[id, createdAt, label, waText, driveFileId, '', 'WAITING', '', '']] },
  });

  return id;
}

export async function updateWaQueueItemStatus(rowIndex: number, status: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${WA_QUEUE_SHEET}!G${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  });
}

export async function updateWaQueueItemSchedule(rowIndex: number, scheduledAt: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${WA_QUEUE_SHEET}!F${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[scheduledAt]] },
  });
}

export async function deleteWaQueueRow(rowIndex: number) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getSheetIdByTitle(sheets, spreadsheetId, WA_QUEUE_SHEET);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex },
        },
      }],
    },
  });
}

export async function updateWaQueueConfig(configRowIndex: number, waChatId: string) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${WA_QUEUE_SHEET}!I${configRowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[waChatId]] },
  });
}

// ── CATALOG ──────────────────────────────────────────────────────────────────

const CATALOG_SHEET = 'CATALOG';

export const CATALOG_COLUMNS = [
  'home_listing_id', 'name', 'description', 'availability', 'price',
  'image[0].url', 'image[1].url', 'image[2].url', 'image[3].url', 'image[4].url', 'image[5].url',
  'url', 'address.addr1', 'address.city', 'address.region', 'address.country',
  'latitude', 'longitude', 'area_size', 'area_unit',
  'num_beds', 'property_type', 'construction_status',
];

// Default fill values for new columns added via migration
const CATALOG_COLUMN_DEFAULTS: Record<string, string> = {
  'address.region': 'Abu Dhabi',
  'url': 'https://primebridge.estate',
};

function fixCatalogValue(col: string, val: string): string {
  if (col === 'area_unit' && val === 'sqm') return 'sq_m';
  if (col === 'area_size' && val) return String(Math.round(Number(val) || 0));
  if (col === 'url' && !val) return 'https://primebridge.estate';
  return val;
}

async function ensureCatalogSheet(sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const exists = meta.data.sheets?.some(s => s.properties?.title === CATALOG_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: CATALOG_SHEET } } }] },
    });
  }

  const check = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CATALOG_SHEET}!1:1` });
  const existingHeaders: string[] = (check.data.values?.[0] || []).map(h => String(h).trim());

  if (!existingHeaders[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${CATALOG_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [CATALOG_COLUMNS] },
    });
    return;
  }

  // Read all data to check for structural or value issues
  const dataRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: CATALOG_SHEET });
  const allRows = dataRes.data.values || [];
  if (allRows.length === 0) return;

  const missingCols = CATALOG_COLUMNS.filter(c => !existingHeaders.includes(c));

  // Check if any data row has values that need fixing
  const needsValueFix = allRows.slice(1).some(row =>
    existingHeaders.some((col, i) => fixCatalogValue(col, String(row[i] ?? '')) !== String(row[i] ?? ''))
  );

  if (missingCols.length === 0 && !needsValueFix) return;

  // Rewrite all rows: remap columns + fix values
  const newRows = allRows.map((row, rowIdx) => {
    return CATALOG_COLUMNS.map(col => {
      const oldIdx = existingHeaders.indexOf(col);
      if (rowIdx === 0) return col; // header row
      if (oldIdx !== -1) return fixCatalogValue(col, String(row[oldIdx] ?? ''));
      return CATALOG_COLUMN_DEFAULTS[col] ?? '';
    });
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${CATALOG_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: newRows },
  });
}

export interface CatalogRow {
  home_listing_id: string;
  name: string;
  description: string;
  price: string;
  image0: string;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  image5: string;
  address_addr1: string;
  area_size: string;
  num_beds: string;
  property_type: string;
  construction_status: string;
}

function buildCatalogRowValues(r: CatalogRow, existingCover = ''): unknown[] {
  return [
    r.home_listing_id, r.name, r.description,
    'for_sale', r.price,
    existingCover || r.image0, r.image1, r.image2, r.image3, r.image4, r.image5,
    'https://primebridge.estate',
    r.address_addr1, 'Abu Dhabi', 'Abu Dhabi', 'AE',
    '24.4539', '54.3773',
    r.area_size, 'sq_m',
    r.num_beds, r.property_type, r.construction_status,
  ];
}

export async function saveCatalogRows(rows: CatalogRow[]): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();
  await ensureCatalogSheet(sheets, spreadsheetId);

  // Read existing sheet to find rows to update vs append
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: CATALOG_SHEET });
  const data = existing.data.values || [];
  const coverColIndex = CATALOG_COLUMNS.indexOf('image[0].url');

  const nameColIndex = CATALOG_COLUMNS.indexOf('name');

  // Build maps: id → row info, name → row info (for dedup by name when ID changes)
  const idToSheetRow = new Map<string, { rowNum: number; cover: string }>();
  const nameToSheetRow = new Map<string, { rowNum: number; cover: string }>();
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const name = nameColIndex !== -1 ? String(data[i][nameColIndex] || '').trim() : '';
    const entry = {
      rowNum: i + 1,
      cover: coverColIndex !== -1 ? String(data[i][coverColIndex] ?? '') : '',
    };
    if (id) idToSheetRow.set(id, entry);
    if (name) nameToSheetRow.set(name, entry);
  }

  const toAppend: CatalogRow[] = [];
  const updateRequests: any[] = [];

  for (const r of rows) {
    const match = idToSheetRow.get(r.home_listing_id) ?? nameToSheetRow.get(r.name);
    if (match) {
      // Update row (preserving cover); also overwrites old-format IDs with new slug
      const values = buildCatalogRowValues(r, match.cover);
      updateRequests.push({
        range: `${CATALOG_SHEET}!A${match.rowNum}`,
        values: [values],
      });
    } else {
      toAppend.push(r);
    }
  }

  // Batch update existing rows
  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: updateRequests },
    });
  }

  // Append new rows
  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${CATALOG_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: toAppend.map(r => buildCatalogRowValues(r)) },
    });
  }
}

export async function getCatalogRows(): Promise<Record<string, string>[]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();
  await ensureCatalogSheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: CATALOG_SHEET });
  const data = res.data.values || [];
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim());
  return data.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = String(row[i] ?? ''); });
    return obj;
  });
}

export async function updateCatalogCover(listingId: string, imageUrl: string): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');
  const sheets = await getGoogleSheetsClient();

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CATALOG_SHEET}!A:A` });
  const ids = (res.data.values || []).map(r => String(r[0] || '').trim());
  const rowIndex = ids.indexOf(listingId);
  if (rowIndex < 1) return; // not saved yet (preview mode); cover will be included on save

  const coverCol = CATALOG_COLUMNS.indexOf('image[0].url') + 1;
  const colLetter = String.fromCharCode(64 + coverCol);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${CATALOG_SHEET}!${colLetter}${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[imageUrl]] },
  });
}
