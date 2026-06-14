import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, getGoogleSheetsClient } from '@/lib/google/sheets';
import { toNumber, normalizeText } from '@/lib/posts/formatters';

// Extends the standard toNumber with M/K suffix support
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

// DD.MM.YYYY / DD/MM/YYYY / DD-MM-YY → ISO YYYY-MM-DD; text stays as-is
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

  return s; // "Ready to move", "Q4 2025", etc.
}

function dealTag(original: unknown, selling: unknown): string {
  const orig = parseAed(original);
  const sell = parseAed(selling);
  if (orig === '' || sell === '' || orig === 0) return '';
  if (sell <= orig) return 'Quick Sale';
  if ((sell - orig) / orig <= 0.10) return 'Hot Price';
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.json();
    const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID ?? '';
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_CONFIG_ID not configured');

    // Read only the header row — no need to load all data
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

    const num = (v: unknown) => { const n = parseAed(v); return n === '' ? '' : n; };
    const dt  = (v: unknown) => parseDate(v);

    // Identity fields
    set('Template Type',       form.projectName ?? '');
    set('Project Name',        form.projectName ?? '');
    set('Building',            form.building ?? '');
    set('Unit',                form.unit ?? '');
    set('Code',                form.code ?? '');
    set('Type',                form.type ?? '');
    set('Parking space',       num(form.parkingSpace));
    set('View',                form.view ?? '');
    set('Floor',               form.floor ?? '');
    set('Furnished',           form.furnished ?? '');

    // Pricing
    set('Original Price, AED', num(form.originalPrice));
    set('Old Price, AED',      num(form.oldPrice));
    set('Selling Price, AED',  num(form.sellingPrice));
    set('Approx. rental rate', form.approxRentalRate ?? '');

    // Area
    set('Area, m2',            num(form.areaM2));
    set('Gross Area, m2',      num(form.grossAreaM2));
    set('Plot Area, m2',       num(form.plotAreaM2));

    // Villa-specific
    set('Specification',       form.specification ?? '');
    set('Finishes',            form.finishes ?? '');
    set('POD',                 form.pod ?? '');
    set('Row',                 form.rowType ?? '');
    set('Unit Position',       form.unitPosition ?? '');

    // Deal
    set('Payment Plan',        form.paymentPlan ?? '');
    set('Status',              form.status ?? '');
    set('Mortgage',            form.mortgage ?? '');
    set('Handover Date',       dt(form.handoverDate));
    set('Handover AED',        num(form.handoverAed));

    // Payment schedule 2–6
    for (const n of [2, 3, 4, 5, 6]) {
      set(`Payment ${n} Date`, dt(form[`payment${n}Date`]));
      set(`Payment ${n} AED`,  num(form[`payment${n}Aed`]));
    }

    // Computed & meta
    set('Distress | Hot Deal', dealTag(form.originalPrice, form.sellingPrice));
    set('Manager',             form.manager ?? '');
    set('Folder Link',         '');
    set('Payment Sheet Link',  '');
    set('Notes',               form.notes ?? '');
    set('Created At',          new Date().toISOString().slice(0, 10));

    const sheets = await getGoogleSheetsClient();
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'OBJECTS!A:A',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return NextResponse.json({
      ok: true,
      message: 'Unit saved to OBJECTS',
      updatedRange: result.data.updates?.updatedRange ?? '',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
