import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/google/sheets';

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_CONFIG_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'GOOGLE_SHEETS_CONFIG_ID not configured' }, { status: 500 });
    }

    // Read the entire column L from the CONFIG sheet
    const data = await getSheetData(spreadsheetId, 'CONFIG!L:L');

    // Read the entire column F from the CONFIG sheet for floors
    const floorsData = await getSheetData(spreadsheetId, 'CONFIG!F:F');

    // Filter out the header row and empty cells
    const projects = data
      .flat()
      .filter((val: any, index: number) => {
        // Skip row 0 (header "Project Name")
        if (index === 0) return false;
        // Skip empty values
        if (!val || String(val).trim() === '') return false;
        return true;
      })
      .map((val: any) => String(val).trim());

    const floors = floorsData
      .flat()
      .filter((val: any, index: number) => {
        // Skip row 0 (header "Floor")
        if (index === 0) return false;
        if (!val || String(val).trim() === '') return false;
        return true;
      })
      .map((val: any) => String(val).trim());

    return NextResponse.json({ projects, floors });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch projects' }, { status: 500 });
  }
}
