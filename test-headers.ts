import { getSheetData } from './src/lib/google/sheets';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  try {
    const data = await getSheetData(process.env.GOOGLE_SHEETS_OBJECTS_ID!, 'Abu Dhabi');
    if (data && data.length > 0) {
      console.log('Headers:', data[0]);
    }
  } catch (e) {
    console.error(e);
  }
}
run();
