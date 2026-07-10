import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SHEET_ID = process.env.GOOGLE_SHEETS_CONFIG_ID!;
const SHEET_NAME = 'WA_MONITOR';

// Columns: Timestamp | Instance | InstanceName | Phone | Name | Request | RemindAt | Reminded | Chat
export async function ensureWaMonitorSheet() {
  const sheets = await getGoogleSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const exists = meta.data.sheets?.some(s => s.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Timestamp', 'Instance', 'InstanceName', 'Phone', 'Name', 'Request', 'RemindAt', 'Reminded', 'Chat']] }
    });
  }
}

export async function saveWaRequest(opts: {
  instance: string;
  instanceName: string;
  phone: string;
  name: string;
  request: string;
  remindAt: Date;
  chat?: string;
}) {
  await ensureWaMonitorSheet();
  const sheets = await getGoogleSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:I`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        new Date().toISOString(),
        opts.instance,
        opts.instanceName,
        opts.phone,
        opts.name,
        opts.request,
        opts.remindAt.toISOString(),
        'false',
        opts.chat || ''
      ]]
    }
  });
}

export async function getPendingReminders() {
  const sheets = await getGoogleSheetsClient();
  let rows: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:I`
    });
    rows = (res.data.values || []) as string[][];
  } catch {
    return [];
  }

  const now = new Date();
  const pending: { rowIndex: number; instance: string; instanceName: string; phone: string; name: string; request: string; timestamp: string; chat: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const [timestamp, instance, instanceName, phone, name, request, remindAt, reminded, chat] = rows[i];
    if (reminded === 'true') continue;
    if (!remindAt) continue;
    if (new Date(remindAt) <= now) {
      pending.push({ rowIndex: i + 1, instance, instanceName, phone, name, request, timestamp, chat: chat || '' });
    }
  }
  return pending;
}

// 1-based row indices of already-reminded rows (legacy rows marked 'true').
export async function getRemindedRowIndices(): Promise<number[]> {
  const sheets = await getGoogleSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A:I` });
    const rows = (res.data.values || []) as string[][];
    const out: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][7] === 'true') out.push(i + 1);
    }
    return out;
  } catch {
    return [];
  }
}

// Delete the given 1-based sheet rows from WA_MONITOR. Deletes highest-index
// first so earlier deletions don't shift the rows still to be removed.
export async function deleteWaMonitorRows(rowIndices: number[]) {
  if (!rowIndices.length) return;
  const sheets = await getGoogleSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === SHEET_NAME)?.properties?.sheetId;
  if (sheetId == null) return;

  const sorted = [...new Set(rowIndices)].sort((a, b) => b - a);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: sorted.map(rowIndex => ({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex },
        },
      })),
    },
  });
}
