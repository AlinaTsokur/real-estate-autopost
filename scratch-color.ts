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
    
    console.log('First few rows format:');
    for (let i = 0; i < 5; i++) {
      if (rowData[i]?.values?.[0]) {
        console.log(`Row ${i+1} Col A bgColor:`, rowData[i].values![0].userEnteredFormat?.backgroundColor);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
run();
