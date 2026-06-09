import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';
import { normalizeText, formatNumberLikeSheet } from '@/lib/posts/formatters';

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_OBJECTS_ID not configured');

    const data = await getSheetData(spreadsheetId, 'Abu Dhabi');
    
    if (!data || data.length < 2) {
      return NextResponse.json({ items: [] });
    }

    const headers = data[0].map(h => normalizeText(String(h || '').trim()));
    
    // Find required column indices
    const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
    const codeCol = headers.findIndex(h => h === normalizeText('Код') || h === normalizeText('Code'));
    const brCol = headers.findIndex(h => h === normalizeText('# Br'));
    const origPriceCol = headers.findIndex(h => h === normalizeText('Original Price'));
    const sellPriceCol = headers.findIndex(h => h === normalizeText('Selling Price'));
    
    // The exact column from the user: "Regular\nHot\nDistress"
    // Let's find it flexibly
    const statusCol = headers.findIndex(h => h.includes(normalizeText('distress')) || h.includes(normalizeText('hot')) || h.includes(normalizeText('regular')));

    if (statusCol === -1) {
      throw new Error('Could not find the Regular/Hot/Distress column in Abu Dhabi sheet');
    }

    const items: any[] = [];

    // Loop through rows starting from index 1 (skipping header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const statusValue = String(row[statusCol] || '').trim().toLowerCase();

      if (statusValue === 'quick sale') {
        items.push({
          unit: unitCol !== -1 ? String(row[unitCol] || '').trim() : '',
          code: codeCol !== -1 ? String(row[codeCol] || '').trim() : '',
          bedrooms: brCol !== -1 ? String(row[brCol] || '').trim() : '',
          originalPrice: origPriceCol !== -1 ? String(row[origPriceCol] || '').trim() : '',
          sellingPrice: sellPriceCol !== -1 ? String(row[sellPriceCol] || '').trim() : '',
        });
      }
    }

    return NextResponse.json({ items });

  } catch (error: any) {
    console.error('Quick sales fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
