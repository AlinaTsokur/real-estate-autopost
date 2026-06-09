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

    let count = 0;
    for (let i = 1; i < rowData.length; i++) {
      const row = rowData[i].values || [];
      const statusValue = getCellText(row[statusCol]).toLowerCase();
      
      if (statusValue === 'quick sale') {
        const unitVal = getCellText(row[unitCol]);
        const bgColor = row[unitCol]?.userEnteredFormat?.backgroundColor;
        const effColor = row[unitCol]?.effectiveFormat?.backgroundColor;
        console.log(`[Row ${i+1}] Unit: ${unitVal} | Status: Quick Sale`);
        console.log(`  userEnteredFormat.backgroundColor:`, JSON.stringify(bgColor));
        console.log(`  effectiveFormat.backgroundColor:`, JSON.stringify(effColor));
        count++;
        if (count >= 15) break; // Limit output
      }
    }
  } catch (e) {
    console.error(e);
  }
}
run();
