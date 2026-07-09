import { getGoogleSheetsClient } from '@/lib/google/sheets';

const SHEET_ID = process.env.GOOGLE_SHEETS_CONFIG_ID!;
const SHEET_NAME = 'WA_MONITOR';

// Columns: Timestamp | Instance | InstanceName | Phone | Name | Request | RemindAt | Reminded
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
      requestBody: { values: [['Timestamp', 'Instance', 'InstanceName', 'Phone', 'Name', 'Request', 'RemindAt', 'Reminded']] }
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
}) {
  await ensureWaMonitorSheet();
  const sheets = await getGoogleSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:H`,
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
        'false'
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
      range: `${SHEET_NAME}!A:H`
    });
    rows = (res.data.values || []) as string[][];
  } catch {
    return [];
  }

  const now = new Date();
  const pending: { rowIndex: number; instance: string; instanceName: string; phone: string; name: string; request: string; timestamp: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const [timestamp, instance, instanceName, phone, name, request, remindAt, reminded] = rows[i];
    if (reminded === 'true') continue;
    if (!remindAt) continue;
    if (new Date(remindAt) <= now) {
      pending.push({ rowIndex: i + 1, instance, instanceName, phone, name, request, timestamp });
    }
  }
  return pending;
}

export async function markReminded(rowIndex: number) {
  const sheets = await getGoogleSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!H${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['true']] }
  });
}
