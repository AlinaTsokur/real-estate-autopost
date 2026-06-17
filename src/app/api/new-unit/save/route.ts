import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, getGoogleSheetsClient } from '@/lib/google/sheets';
import { toNumber, normalizeText } from '@/lib/posts/formatters';
import { createFolderAndPaymentPlan } from '@/lib/payment/create-plan';

function parseAed(value: unknown): number | '' {
  const s = String(value ?? '').trim().replace(/\s/g, '');
  if (!s) return '';

  const mMatch = s.match(/^([\d.,]+)[Mm]$/);
  if (mMatch) {
    const n = toNumber(mMatch[1]);
    return n === '' ? '' : Number(n) * 1_000_000;
  }

  const kMatch = s.match(/^([\d.,]+)[Kk]$/);
  if (kMatch) {
    const n = toNumber(kMatch[1]);
    return n === '' ? '' : Number(n) * 1_000;
  }

  const n = toNumber(s);
  return n === '' ? '' : Number(n);
}

function parseDate(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';

  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2}|\d{4})$/);
  if (m) {
    const day   = Number(m[1]);
    const month = Number(m[2]);
    let   year  = Number(m[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return s;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return s;
}

function dealTag(original: unknown, selling: unknown): string {
  const orig = parseAed(original);
  const sell = parseAed(selling);
  if (orig === '' || sell === '' || orig === 0) return '';
  if (sell <= orig) return 'Quick Sale';
  if ((sell - orig) / orig <= 0.10) return 'Hot Price';
  return '';
}

// Parse "OBJECTS!A2:Z2" → row number
function parseRowNumber(updatedRange: string): number | null {
  const m = updatedRange.match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.json();
    const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID ?? '';
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');

    const headerData = await getSheetData(spreadsheetId, 'OBJECTS!1:1');
    if (!headerData?.[0]?.length) throw new Error('OBJECTS sheet missing or has no headers');

    const headers = (headerData[0] ?? []).map(h => String(h).trim());
    const idx: Record<string, number> = {};
    headers.forEach((h, i) => { idx[normalizeText(h)] = i; });

    const row: (string | number)[] = new Array(headers.length).fill('');

    const set = (name: string, val: string | number) => {
      const k = normalizeText(name);
      if (idx[k] !== undefined) row[idx[k]] = val;
    };

    const numVal = (v: unknown) => { const n = parseAed(v); return n === '' ? '' : n; };
    const dt     = (v: unknown) => parseDate(v);

    set('Template Type',       form.projectName ?? '');
    set('Project Name',        form.projectName ?? '');
    set('Building',            form.building ?? '');
    set('Unit',                form.unit ?? '');
    set('Code',                form.code ?? '');
    set('Type',                form.type ?? '');
    set('Parking space',       numVal(form.parkingSpace || '1'));
    set('View',                form.view ?? '');
    set('Floor',               form.floor ?? '');
    set('Furnished',           form.furnished ?? '');

    set('Original Price, AED', numVal(form.originalPrice));
    set('Selling Price, AED',  numVal(form.sellingPrice));

    set('Area, m2',            numVal(form.areaM2));
    set('Gross Area, m2',      numVal(form.grossAreaM2));
    set('Plot Area, m2',       numVal(form.plotAreaM2));

    set('Specification',       form.specification ?? '');
    set('Finishes',            form.finishes ?? '');
    set('POD',                 form.pod ?? '');
    set('Row',                 form.rowType ?? '');
    set('Unit Position',       form.unitPosition ?? '');

    set('Payment Plan',        form.paymentPlan ?? '');
    set('Handover Date',       dt(form.handoverDate));
    set('Handover AED',        numVal(form.handoverAed));

    for (const n of [2, 3, 4, 5, 6]) {
      set(`Payment ${n} Date`, dt(form[`payment${n}Date`]));
      set(`Payment ${n} AED`,  numVal(form[`payment${n}Aed`]));
    }

    set('Distress | Hot Deal', dealTag(form.originalPrice, form.sellingPrice));
    set('Manager',             form.manager ?? '');
    set('Folder Link',         '');
    set('Payment Sheet Link',  '');
    set('Created At',          new Date().toISOString().slice(0, 10));

    const sheets = await getGoogleSheetsClient();
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'OBJECTS!A:A',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    const updatedRange = result.data.updates?.updatedRange ?? '';

    // Fix integer columns that the sheet template formats with decimals
    const rowNumEarly = parseRowNumber(updatedRange);
    if (rowNumEarly !== null) {
      const parkingColIdx = idx[normalizeText('Parking space')];
      if (parkingColIdx !== undefined) {
        const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
        const objectsSheet = meta.data.sheets?.find(s => s.properties?.title === 'OBJECTS');
        const objectsSheetId = objectsSheet?.properties?.sheetId;
        if (objectsSheetId !== undefined) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{
                updateCells: {
                  range: {
                    sheetId: objectsSheetId,
                    startRowIndex: rowNumEarly - 1,
                    endRowIndex: rowNumEarly,
                    startColumnIndex: parkingColIdx,
                    endColumnIndex: parkingColIdx + 1,
                  },
                  rows: [{ values: [{ userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } } }] }],
                  fields: 'userEnteredFormat.numberFormat',
                },
              }],
            },
          });
        }
      }
    }

    // Build a record for the payment plan function (uses display names)
    const record: Record<string, unknown> = {
      'Project Name':        form.projectName ?? '',
      'Building':            form.building ?? '',
      'Unit':                form.unit ?? '',
      'Code':                form.code ?? '',
      'Type':                form.type ?? '',
      'View':                form.view ?? '',
      'Floor':               form.floor ?? '',
      'Furnished':           form.furnished ?? '',
      'Specification':       form.specification ?? '',
      'Finishes':            form.finishes ?? '',
      'POD':                 form.pod ?? '',
      'Row':                 form.rowType ?? '',
      'Unit Position':       form.unitPosition ?? '',
      'Parking space':       numVal(form.parkingSpace),
      'Original Price, AED': numVal(form.originalPrice),
      'Selling Price, AED':  numVal(form.sellingPrice),
      'Area, m2':            numVal(form.areaM2),
      'Gross Area, m2':      numVal(form.grossAreaM2),
      'Plot Area, m2':       numVal(form.plotAreaM2),
      'Payment Plan':        form.paymentPlan ?? '',
      'Handover Date':       dt(form.handoverDate),
      'Handover AED':        numVal(form.handoverAed),
      'Manager':             form.manager ?? '',
      'Distress | Hot Deal': dealTag(form.originalPrice, form.sellingPrice),
    };

    for (const n of [2, 3, 4, 5, 6]) {
      record[`Payment ${n} Date`] = dt(form[`payment${n}Date`]);
      record[`Payment ${n} AED`]  = numVal(form[`payment${n}Aed`]);
    }

    // Create folder + payment plan (non-blocking error — row is already saved)
    let folderUrl       = '';
    let paymentSheetUrl = '';
    let paymentError    = '';

    try {
      const plan = await createFolderAndPaymentPlan(record, spreadsheetId);
      folderUrl       = plan.folderUrl;
      paymentSheetUrl = plan.paymentSheetUrl;

      // Write links back to OBJECTS row
      const rowNum = parseRowNumber(updatedRange);
      if (rowNum !== null) {
        const folderIdx  = idx[normalizeText('Folder Link')];
        const paymentIdx = idx[normalizeText('Payment Sheet Link')];
        const backfills: Array<{ range: string; values: unknown[][] }> = [];

        if (folderIdx !== undefined && folderUrl) {
          backfills.push({ range: `OBJECTS!${colLetter(folderIdx)}${rowNum}`, values: [[folderUrl]] });
        }
        if (paymentIdx !== undefined && paymentSheetUrl) {
          backfills.push({ range: `OBJECTS!${colLetter(paymentIdx)}${rowNum}`, values: [[paymentSheetUrl]] });
        }

        if (backfills.length) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'USER_ENTERED', data: backfills },
          });
        }
      }
    } catch (e: any) {
      paymentError = e.message;
    }

    return NextResponse.json({
      ok: true,
      message: 'Unit saved to OBJECTS',
      updatedRange,
      folderUrl,
      paymentSheetUrl,
      paymentError: paymentError || undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function colLetter(idx: number): string {
  let letter = '';
  let n = idx;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}
