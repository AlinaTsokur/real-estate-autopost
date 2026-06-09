import { getGoogleSheetsClient } from './src/lib/google/sheets';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  try {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_OBJECTS_ID!,
      ranges: ['Abu Dhabi!A:Z'],
      includeGridData: true,
    });
    
    const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData;
    if (!rowData) {
      console.log('No row data');
      return;
    }
    
    const headerRow = rowData[0].values || [];
    const getCellText = (cell: any) => String(cell?.formattedValue || cell?.userEnteredValue?.stringValue || cell?.userEnteredValue?.numberValue || '').trim();
    
    const headers = headerRow.map(h => getCellText(h).toLowerCase());
    const unitCol = headers.findIndex(h => h === 'unit');
    const statusCol = headers.findIndex(h => h.includes('distress') || h.includes('hot') || h.includes('regular'));

    console.log(`Unit Col: ${unitCol}, Status Col: ${statusCol}`);

    let total = 0;
    let included = 0;

    for (let i = 1; i < rowData.length; i++) {
      const row = rowData[i].values || [];
      const statusValue = getCellText(row[statusCol]).toLowerCase();
      
      if (statusValue === 'quick sale') {
        total++;
        const unitVal = getCellText(row[unitCol]);
        
        let isSold = false;
        if (unitCol !== -1) {
          const unitBgColor = row[unitCol]?.effectiveFormat?.backgroundColor || row[unitCol]?.userEnteredFormat?.backgroundColor;
          if (unitBgColor) {
            const r = unitBgColor.red || 0;
            const g = unitBgColor.green || 0;
            const b = unitBgColor.blue || 0;
            if (r > 0.9 && r <= 1.0 && g > 0.75 && g < 0.85 && b > 0.75 && b < 0.85) {
              isSold = true;
            } else if (r > 0.9 && g < 0.5 && b < 0.5) {
              isSold = true;
            }
          }
        }
        
        if (!isSold) {
          included++;
          console.log(`[INCLUDED] Row ${i+1}: Unit ${unitVal}`);
        } else {
          console.log(`[EXCLUDED] Row ${i+1}: Unit ${unitVal} (BgColor: ${JSON.stringify(row[unitCol]?.effectiveFormat?.backgroundColor || row[unitCol]?.userEnteredFormat?.backgroundColor)})`);
        }
      }
    }
    
    console.log(`Total Quick Sale rows: ${total}`);
    console.log(`Total included: ${included}`);
    console.log(`Total excluded: ${total - included}`);

  } catch (e) {
    console.error(e);
  }
}
run();
