import { NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/google/sheets';
import { normalizeText, formatNumberLikeSheet } from '@/lib/posts/formatters';

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_OBJECTS_ID;
    if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_OBJECTS_ID not configured');

    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: ['Abu Dhabi!A:Z'],
      includeGridData: true,
    });

    const gridData = res.data.sheets?.[0]?.data?.[0];
    const rowData = gridData?.rowData;
    
    if (!rowData || rowData.length < 2) {
      return NextResponse.json({ items: [] });
    }

    // Helper to get text from a cell
    const getCellText = (cell: any) => String(cell?.formattedValue || cell?.userEnteredValue?.stringValue || cell?.userEnteredValue?.numberValue || '').trim();

    // Extract headers
    const headerRow = rowData[0].values || [];
    const headers = headerRow.map(h => normalizeText(getCellText(h)));
    
    // Find required column indices
    const unitCol = headers.findIndex(h => h === normalizeText('Unit'));
    const codeCol = headers.findIndex(h => h === normalizeText('Код') || h === normalizeText('Code'));
    const brCol = headers.findIndex(h => h === normalizeText('# Br'));
    const origPriceCol = headers.findIndex(h => h === normalizeText('Original Price'));
    const sellPriceCol = headers.findIndex(h => h === normalizeText('Selling Price'));
    
    const statusCol = headers.findIndex(h => h.includes(normalizeText('distress')) || h.includes(normalizeText('hot')) || h.includes(normalizeText('regular')));

    if (statusCol === -1) {
      throw new Error('Could not find the Regular/Hot/Distress column in Abu Dhabi sheet');
    }

    const items: any[] = [];

    // Loop through rows starting from index 1
    for (let i = 1; i < rowData.length; i++) {
      const row = rowData[i].values || [];
      const statusValue = getCellText(row[statusCol]).toLowerCase();

      // Check background color of the first cell (or the status cell) to see if it's #f4cccc
      // #f4cccc is rgb(244, 204, 204) -> red: ~0.95, green: ~0.8, blue: ~0.8
      const bgColor = row[0]?.userEnteredFormat?.backgroundColor;
      let isSold = false;
      if (bgColor) {
        const r = bgColor.red || 0;
        const g = bgColor.green || 0;
        const b = bgColor.blue || 0;
        // Check if it's around #f4cccc
        if (r > 0.9 && r < 1.0 && g > 0.75 && g < 0.85 && b > 0.75 && b < 0.85) {
          isSold = true; // It's light red (#f4cccc)
        }
      }

      if (statusValue === 'quick sale' && !isSold) {
        items.push({
          unit: unitCol !== -1 ? getCellText(row[unitCol]) : '',
          code: codeCol !== -1 ? getCellText(row[codeCol]) : '',
          bedrooms: brCol !== -1 ? getCellText(row[brCol]) : '',
          originalPrice: origPriceCol !== -1 ? getCellText(row[origPriceCol]) : '',
          sellingPrice: sellPriceCol !== -1 ? getCellText(row[sellPriceCol]) : '',
        });
      }
    }

    return NextResponse.json({ items });

  } catch (error: any) {
    console.error('Quick sales fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
