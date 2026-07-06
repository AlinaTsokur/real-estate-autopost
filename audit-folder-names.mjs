// Audit: check Drive folder names for ACTIVE (non-sold) units only.
// Skips rows filled with #f4cccc (sold color).
// Expected folder name: "{Code} {Unit} ({Owner/Agent})"

import { google } from 'googleapis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env.local') });

const OBJECTS_ID = process.env.GOOGLE_SHEETS_OBJECTS_ID;

async function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

// #f4cccc = rgb(244,204,204) = (0.9568, 0.800, 0.800)
function isSoldColor(bg) {
  if (!bg) return false;
  const r = bg.red   ?? 1;
  const g = bg.green ?? 1;
  const b = bg.blue  ?? 1;
  return Math.abs(r - 0.9568) < 0.04 && Math.abs(g - 0.800) < 0.04 && Math.abs(b - 0.800) < 0.04;
}

function buildExpectedName(code, unit, agent) {
  let name = [code, unit].filter(Boolean).join(' ');
  if (agent) name += ` (${agent})`;
  return name;
}

async function getRowColors(sheets, sheetName, colIndex) {
  const colLetter = String.fromCharCode(65 + colIndex);
  const res = await sheets.spreadsheets.get({
    spreadsheetId: OBJECTS_ID,
    ranges: [`'${sheetName}'!${colLetter}:${colLetter}`],
    fields: 'sheets.data.rowData.values.userEnteredFormat.backgroundColor',
    includeGridData: true,
  });
  const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const colorMap = new Map();
  rowData.forEach((rd, i) => {
    const bg = rd?.values?.[0]?.userEnteredFormat?.backgroundColor;
    colorMap.set(i, isSoldColor(bg));
  });
  return colorMap;
}

async function readSheet(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: OBJECTS_ID,
    range: `'${sheetName}'!A:Z`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return res.data.values ?? [];
}

async function getFolderName(drive, folderId) {
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'name,trashed',
      supportsAllDrives: true,
    });
    if (res.data.trashed) return null;
    return res.data.name ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive  = google.drive({ version: 'v3', auth });

  // Only process "Abu Dhabi" — the sheet with Unit Folder ID column
  const SHEET = 'Abu Dhabi';
  console.log(`\nReading sheet: "${SHEET}"...`);

  const rows = await readSheet(sheets, SHEET);
  if (!rows.length) { console.log('Empty sheet'); return; }

  const headers = rows[0].map(h => String(h).trim());
  const unitCol      = headers.findIndex(h => h === 'Unit');
  const codeCol      = headers.findIndex(h => h === 'Код');
  const agentCol     = headers.findIndex(h => /Owner.*Agent/i.test(h) || h === 'Owner / Agent');
  const folderIdCol  = headers.findIndex(h => h === 'Unit Folder ID');
  const folderLinkCol = headers.findIndex(h => h === 'Unit Folder Link');

  console.log(`Columns: Unit=${unitCol}, Код=${codeCol}, Agent=${agentCol}, FolderID=${folderIdCol}`);

  // Fetch row colors for the Unit column (0-based row index)
  console.log('Fetching row colors...');
  const colorMap = await getRowColors(sheets, SHEET, unitCol);

  const results = [];
  let skippedSold = 0;
  let skippedNoFolder = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const unit  = String(row[unitCol]  ?? '').trim();
    const code  = String(row[codeCol]  ?? '').trim();
    if (!unit && !code) continue;

    // Skip sold rows (pink fill #f4cccc)
    if (colorMap.get(i)) { skippedSold++; continue; }

    const agent    = agentCol >= 0 ? String(row[agentCol] ?? '').trim() : '';
    let folderId   = folderIdCol >= 0 ? String(row[folderIdCol] ?? '').trim() : '';
    if (!folderId && folderLinkCol >= 0) {
      const link = String(row[folderLinkCol] ?? '').trim();
      const m = link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (m) folderId = m[1];
    }

    if (!folderId) { skippedNoFolder++; continue; }

    const expected = buildExpectedName(code, unit, agent);
    const actual   = await getFolderName(drive, folderId);

    if (actual === null) {
      results.push({ rowNum: i + 1, unit, code, agent, folderId, expected, actual: '⚠️ НЕ НАЙДЕНО', status: 'missing' });
    } else {
      const match = actual.trim() === expected.trim();
      results.push({ rowNum: i + 1, unit, code, agent, folderId, expected, actual, status: match ? 'ok' : 'wrong' });
    }
  }

  const wrong   = results.filter(r => r.status === 'wrong');
  const missing = results.filter(r => r.status === 'missing');
  const ok      = results.filter(r => r.status === 'ok');

  console.log('\n\n========================================');
  console.log(`АУДИТ АКТИВНЫХ ЮНИТОВ (без #f4cccc)`);
  console.log(`  Проверено:               ${results.length}`);
  console.log(`  ✅ OK:                    ${ok.length}`);
  console.log(`  ❌ Неверное имя:          ${wrong.length}`);
  console.log(`  ⚠️  Не найдено:            ${missing.length}`);
  console.log(`  ⏭  Пропущено (продано):   ${skippedSold}`);
  console.log(`  ⏭  Пропущено (нет папки): ${skippedNoFolder}`);
  console.log('========================================\n');

  if (missing.length) {
    console.log('=== ⚠️  НЕ НАЙДЕНО / НЕТ ДОСТУПА ===');
    for (const r of missing) {
      console.log(`\nСтрока ${r.rowNum}: ${r.unit} (${r.code})`);
      console.log(`  FolderID: ${r.folderId}`);
      console.log(`  Drive:    https://drive.google.com/drive/folders/${r.folderId}`);
    }
  }

  if (wrong.length) {
    console.log('\n=== ❌ НЕВЕРНЫЕ ИМЕНА ПАПОК ===\n');
    for (const r of wrong) {
      console.log(`Строка ${r.rowNum}: ${r.unit}`);
      console.log(`  Агент:     ${r.agent}`);
      console.log(`  Ожидается: "${r.expected}"`);
      console.log(`  Факт:      "${r.actual}"`);
      console.log(`  Drive:     https://drive.google.com/drive/folders/${r.folderId}`);
      console.log('');
    }
  }

  // TSV output for easy copy-paste into spreadsheet
  console.log('\n=== TSV ДЛЯ КОПИРОВАНИЯ В ТАБЛИЦУ ===');
  console.log('Строка\tЮнит\tКод\tАгент\tОжидаемое имя\tФактическое имя\tDrive ссылка');
  for (const r of [...wrong, ...missing]) {
    console.log([
      r.rowNum, r.unit, r.code, r.agent,
      r.expected, r.actual,
      `https://drive.google.com/drive/folders/${r.folderId}`
    ].map(v => String(v).replace(/\t/g, ' ')).join('\t'));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
