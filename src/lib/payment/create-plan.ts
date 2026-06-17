import { getGoogleDriveClient } from '@/lib/google/drive';
import { getGoogleSheetsClient, getSheetData } from '@/lib/google/sheets';
import { toNumber, normalizeText } from '@/lib/posts/formatters';

// ─── Column letter helper ────────────────────────────────────────────────────

function colLetter(idx: number): string {
  let letter = '';
  let n = idx;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

// ─── Formatting helpers (mirror App Script functions) ────────────────────────

function safe(v: unknown): string {
  return String(v ?? '').trim();
}

function num(v: unknown): number | '' {
  const n = toNumber(v);
  return n === '' ? '' : Number(n);
}

function sqmToSqft(v: unknown): number | '' {
  const n = num(v);
  return n === '' ? '' : n * 10.7639;
}

function fmtAed(v: unknown): string {
  const n = num(v);
  if (n === '') return '';
  const rounded = Math.round(n * 100) / 100;
  const hasDec = Math.round((rounded % 1) * 100) !== 0;
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: hasDec ? 2 : 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(rounded) + ' AED';
}

function fmtAedNumberOnly(v: unknown): string {
  const n = num(v);
  if (n === '') return '';
  const rounded = Math.round(n * 100) / 100;
  const hasDec = Math.round((rounded % 1) * 100) !== 0;
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: hasDec ? 2 : 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(rounded);
}

function fmtNum2(v: unknown): string {
  const n = num(v);
  if (n === '') return '';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtSqft(v: unknown): string {
  const sq = sqmToSqft(v);
  if (sq === '') return '';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(sq));
}

// Parses ISO YYYY-MM-DD or DD/MM/YYYY or DD.MM.YYYY etc.
function parseDate(v: unknown): Date | null {
  const s = safe(v);
  if (!s) return null;

  // ISO: 2026-06-30
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YY
  const dmy = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2}|\d{4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  return null;
}

function fmtPaymentLabel(v: unknown): string {
  const d = parseDate(v);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtHandoverLabel(v: unknown): string {
  const base = fmtPaymentLabel(v);
  return base ? `${base} (on Handover)` : '';
}

function fmtMonthYear(v: unknown): string {
  const d = parseDate(v);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtParking(v: unknown): string {
  const n = num(v);
  if (n === '' || n === 0) return 'Parking not included';
  const count = Math.round(n);
  return count === 1 ? 'Parking space included' : `${count} parking spaces included`;
}

function fmtDistress(v: unknown): string {
  const s = safe(v);
  if (!s || s === '-') return '';
  return s === 'Distress Deal' ? 'Quick Sale' : s;
}

function buildSellingCell(record: Record<string, unknown>): string {
  const price = fmtAedNumberOnly(record['Selling Price, AED']);
  const tag = fmtDistress(record['Distress | Hot Deal']);
  return tag ? `${price}\n${tag}` : price;
}

// ─── Build placeholder map ───────────────────────────────────────────────────

function buildPlaceholders(record: Record<string, unknown>): Record<string, string> {
  const typeText = safe(record['Type']);
  const floorText = safe(record['Floor']);
  const planText = safe(record['Payment Plan']);
  const planRed = planText.toLowerCase() === '100% payment' ? '100% Payment' : '';

  return {
    '{{project_name}}':          safe(record['Project Name']),
    '{{building}}':              safe(record['Building']),
    '{{unit_name}}':             safe(record['Unit']),
    '{{type}}':                  typeText,
    '{{bedrooms_label}}':        typeText,
    '{{bedrooms_label_upper}}':  typeText.toUpperCase(),
    '{{project_name_upper}}':    safe(record['Project Name']).toUpperCase(),
    '{{code}}':                  safe(record['Code']),
    '{{view}}':                  safe(record['View']),
    '{{floor}}':                 floorText,
    '{{floor_marketing}}':       floorText.replace(/Floor/g, 'floor'),
    '{{furnished}}':             safe(record['Furnished']),
    '{{payment_plan}}':          planText,
    '{{payment_plan_red}}':      planRed,
    '{{distress_hot_deal}}':     fmtDistress(record['Distress | Hot Deal']),
    '{{original_price_aed_fmt}}': fmtAed(record['Original Price, AED']),
    '{{selling_price_aed_fmt}}': fmtAed(record['Selling Price, AED']),
    '{{area_m2}}':               fmtNum2(record['Area, m2']),
    '{{area_sqft}}':             fmtSqft(record['Area, m2']),
    '{{gross_area_m2}}':         fmtNum2(record['Gross Area, m2']),
    '{{gross_area_sqft}}':       fmtSqft(record['Gross Area, m2']),
    '{{plot_area_m2}}':          fmtNum2(record['Plot Area, m2']),
    '{{plot_area_sqft}}':        fmtSqft(record['Plot Area, m2']),
    '{{specification}}':         safe(record['Specification']),
    '{{finishes}}':              safe(record['Finishes']),
    '{{pod}}':                   safe(record['POD']),
    '{{row}}':                   safe(record['Row']),
    '{{unit_position}}':         safe(record['Unit Position']),
    '{{payment_2_label}}':       fmtPaymentLabel(record['Payment 2 Date']),
    '{{payment_3_label}}':       fmtPaymentLabel(record['Payment 3 Date']),
    '{{payment_4_label}}':       fmtPaymentLabel(record['Payment 4 Date']),
    '{{payment_5_label}}':       fmtPaymentLabel(record['Payment 5 Date']),
    '{{payment_6_label}}':       fmtPaymentLabel(record['Payment 6 Date']),
    '{{handover_label}}':        fmtHandoverLabel(record['Handover Date']),
    '{{parking_text}}':          fmtParking(record['Parking space']),
    '{{parking_spaces}}':        safe(record['Parking space']),
    '{{handover_month_year}}':   fmtMonthYear(record['Handover Date']),
  };
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function getOrCreateFolder(
  drive: Awaited<ReturnType<typeof getGoogleDriveClient>>,
  parentId: string,
  name: string
): Promise<{ id: string; webViewLink: string }> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files?.length) {
    const f = res.data.files[0];
    return { id: f.id!, webViewLink: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}` };
  }

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  });
  return {
    id: created.data.id!,
    webViewLink: created.data.webViewLink ?? `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

async function archiveOldPaymentPlans(
  drive: Awaited<ReturnType<typeof getGoogleDriveClient>>,
  folderId: string
): Promise<void> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const toArchive = (res.data.files ?? []).filter(f => /^Payment plan\b/i.test(String(f.name ?? '')));
  if (!toArchive.length) return;

  const archive = await getOrCreateFolder(drive, folderId, 'Archive');
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  for (const file of toArchive) {
    await drive.files.update({
      fileId: file.id!,
      addParents: archive.id,
      removeParents: folderId,
      requestBody: { name: `${file.name} - archived ${stamp}` },
      fields: 'id',
      supportsAllDrives: true,
    });
  }
}

// ─── Sheets template filler ──────────────────────────────────────────────────

async function fillTemplate(
  sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>,
  spreadsheetId: string,
  record: Record<string, unknown>
): Promise<void> {
  // Get first sheet name
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const sheetName = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';

  const [valRes, fmlRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName, valueRenderOption: 'FORMATTED_VALUE' }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName, valueRenderOption: 'FORMULA' }),
  ]);

  const rows   = valRes.data.values ?? [];
  const fmlRows = fmlRes.data.values ?? [];
  const placeholders = buildPlaceholders(record);

  const updates:    Array<{ range: string; values: unknown[][] }> = [];
  // stringCells: cells where we must force text (no re-parsing by Sheets)
  // stored as { rowIndex, colIndex, value } — written via batchUpdate stringValue
  const stringCells: Array<{ row: number; col: number; value: string }> = [];

  // 1. Replace {{placeholders}} in all non-formula cells
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const formula = String(fmlRows[r]?.[c] ?? '');
      if (formula.startsWith('=')) continue;

      const cellVal = String(rows[r][c] ?? '');
      let newVal = cellVal;
      for (const [key, val] of Object.entries(placeholders)) {
        newVal = newVal.split(key).join(val);
      }
      if (newVal !== cellVal) {
        updates.push({ range: `${sheetName}!${colLetter(c)}${r + 1}`, values: [[newVal]] });
      }
    }
  }

  // 2. Service numeric cells — header in row 1, value written to row 2
  const grossM2 = num(record['Gross Area, m2']);
  const plotM2  = num(record['Plot Area, m2']);
  const serviceMap: Record<string, number | ''> = {
    'exchange_rate':    3.65,
    'selling_price_aed': num(record['Selling Price, AED']),
    'area_m2':          num(record['Area, m2']),
    'area_sqft':        sqmToSqft(record['Area, m2']),
    'gross_area_m2':    grossM2,
    'gross_area_sqft':  grossM2 === '' ? '' : grossM2 * 10.7639,
    'plot_area_m2':     plotM2,
    'plot_area_sqft':   plotM2  === '' ? '' : plotM2  * 10.7639,
    'payment_2_aed':    num(record['Payment 2 AED']),
    'payment_3_aed':    num(record['Payment 3 AED']),
    'payment_4_aed':    num(record['Payment 4 AED']),
    'payment_5_aed':    num(record['Payment 5 AED']),
    'payment_6_aed':    num(record['Payment 6 AED']),
    'handover_aed':     num(record['Handover AED']),
  };

  const headers = rows[0] ?? [];
  for (let c = 0; c < headers.length; c++) {
    const key = String(headers[c] ?? '').trim();
    if (key in serviceMap && serviceMap[key] !== '') {
      updates.push({ range: `${sheetName}!${colLetter(c)}2`, values: [[serviceMap[key]]] });
    }
  }

  // 3. setValueUnderHeader: find label cell, write to cell below
  const underHeaderWrites = [
    { label: 'Original Price, AED', value: fmtAedNumberOnly(record['Original Price, AED']) },
    { label: 'Selling Price, AED',  value: buildSellingCell(record) },
  ];

  for (const { label, value } of underHeaderWrites) {
    if (!value) continue;
    let done = false;
    for (let r = 0; r < rows.length && !done; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (String(rows[r][c] ?? '').trim() === label) {
          stringCells.push({ row: r + 1, col: c, value });
          done = true;
          break;
        }
      }
    }
  }

  if (!updates.length && !stringCells.length) return;

  // Get sheetId for stringValue writes
  const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;

  await Promise.all([
    updates.length ? sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    }) : Promise.resolve(),
    // Force text for price display cells — prevents Sheets re-parsing "1.250.000" as a number
    stringCells.length ? sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: stringCells.map(({ row, col, value }) => ({
          updateCells: {
            range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: col, endColumnIndex: col + 1 },
            rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
            fields: 'userEnteredValue',
          },
        })),
      },
    }) : Promise.resolve(),
  ]);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface PaymentPlanResult {
  folderUrl: string;
  paymentSheetUrl: string;
}

export async function createFolderAndPaymentPlan(
  record: Record<string, unknown>,
  spreadsheetId: string
): Promise<PaymentPlanResult> {
  const result: PaymentPlanResult = { folderUrl: '', paymentSheetUrl: '' };

  // Read project config
  const configData = await getSheetData(spreadsheetId, 'CONFIG');
  if (configData.length < 2) throw new Error('CONFIG sheet empty');

  const cfgHeaders = (configData[0] ?? []).map(h => String(h).trim());
  const projectCol  = cfgHeaders.indexOf('Project Name');
  const templateCol = cfgHeaders.indexOf('Payment Template File ID');
  const folderCol   = cfgHeaders.indexOf('Parent Folder ID');

  if (projectCol === -1 || templateCol === -1 || folderCol === -1) {
    throw new Error('CONFIG missing required columns (Project Name / Payment Template File ID / Parent Folder ID)');
  }

  const targetProject = normalizeText(safe(record['Project Name']));
  let templateFileId = '';
  let parentFolderId = '';

  for (let i = 1; i < configData.length; i++) {
    if (normalizeText(String(configData[i][projectCol] ?? '')) === targetProject) {
      templateFileId = String(configData[i][templateCol] ?? '').trim();
      parentFolderId = String(configData[i][folderCol]   ?? '').trim();
      break;
    }
  }

  if (!parentFolderId) throw new Error(`Parent Folder ID not found for project: ${safe(record['Project Name'])}`);

  // Check CONFIG_DRIVE for a per-prefix Search folder override (e.g. Saadiyat Lagoons clusters)
  const objectsId = process.env.GOOGLE_SHEETS_OBJECTS_ID ?? '';
  if (objectsId) {
    try {
      const cfgDriveData = await getSheetData(objectsId, 'CONFIG_DRIVE');
      if (cfgDriveData.length > 1) {
        const cdHeaders  = (cfgDriveData[0] ?? []).map(h => String(h).trim().toLowerCase());
        const cdPrefix   = cdHeaders.findIndex(h => h === 'code prefix');
        const cdSearch   = cdHeaders.findIndex(h => h === 'search folder link');
        if (cdPrefix >= 0 && cdSearch >= 0) {
          const rawCode    = safe(record['Code']).replace(/^#/, '');
          const codePrefix = rawCode.replace(/\D/g, '').slice(0, 4);
          for (let i = 1; i < cfgDriveData.length; i++) {
            const rowPrefix = String(cfgDriveData[i][cdPrefix] ?? '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
            if (rowPrefix !== codePrefix) continue;
            const raw = String(cfgDriveData[i][cdSearch] ?? '').trim();
            if (!raw) break;
            const urlMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
            const fid = urlMatch ? urlMatch[1] : raw;
            if (fid && fid !== parentFolderId) parentFolderId = fid;
            break;
          }
        }
      }
    } catch {
      // lookup failure is non-fatal — fall back to project-level folder
    }
  }

  const drive = await getGoogleDriveClient();

  // Build folder name: "CODE UNIT (Manager)"
  const code    = safe(record['Code']);
  const unit    = safe(record['Unit']);
  const manager = safe(record['Manager']);
  let folderName = [code, unit].filter(Boolean).join(' ');
  if (manager) folderName += ` (${manager})`;
  if (!folderName) folderName = unit || code || 'Unknown unit';

  const objectFolder = await getOrCreateFolder(drive, parentFolderId, folderName);
  result.folderUrl = objectFolder.webViewLink;

  if (!templateFileId) return result; // no template — folder only

  // Archive old payment plans
  await archiveOldPaymentPlans(drive, objectFolder.id);

  // Copy template
  const copyName = `Payment plan ${unit || code}`.trim();
  const copied = await drive.files.copy({
    fileId: templateFileId,
    requestBody: { name: copyName, parents: [objectFolder.id] },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  });

  const copiedId = copied.data.id!;
  result.paymentSheetUrl = `https://docs.google.com/spreadsheets/d/${copiedId}/edit`;

  const sheets = await getGoogleSheetsClient();

  // Set locale & timezone (matches App Script)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: copiedId,
    requestBody: {
      requests: [{
        updateSpreadsheetProperties: {
          properties: { locale: 'es_ES', timeZone: 'Europe/Madrid' },
          fields: 'locale,timeZone',
        },
      }],
    },
  });

  // Fill all placeholders and service cells
  await fillTemplate(sheets, copiedId, record);

  return result;
}
