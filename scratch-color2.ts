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
    console.log('Unit col index:', unitCol);

    for (let i = 1; i < rowData.length; i++) {
      const row = rowData[i].values || [];
      const unitVal = getCellText(row[unitCol]);
      if (unitVal.includes('SL7-V-053')) {
        console.log('FOUND ROW:', unitVal);
        console.log('Unit cell background color:', JSON.stringify(row[unitCol]?.userEnteredFormat?.backgroundColor, null, 2));
        console.log('Unit cell background color style:', JSON.stringify(row[unitCol]?.userEnteredFormat?.backgroundColorStyle?.rgbColor, null, 2));
        break;
      }
    }
  } catch (e) {
    console.error(e);
  }
}
run();
