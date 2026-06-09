import { NextResponse } from 'next/server';
import { getC3Units, getRawRowData } from '@/lib/google/sheets';
import { parsePastedRow } from '@/lib/parsing/row-parser';
import { findC3SlideByUnit } from '@/lib/google/drive';
import { buildTelegramHtmlPost } from '@/lib/posts/templates';

// Disable caching to always fetch fresh units from Google Sheets
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const units = await getC3Units();
    return NextResponse.json({ units });
  } catch (error: any) {
    console.error('Failed to get C3 units:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch units' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { unit } = await req.json();
    if (!unit) {
      return NextResponse.json({ error: 'Unit is required' }, { status: 400 });
    }

    const projectName = 'C3 Garden Residence';
    
    // 1. Get raw row
    const rawRow = await getRawRowData(projectName, unit);
    if (!rawRow) {
      return NextResponse.json({ error: `Row not found for unit ${unit}` }, { status: 404 });
    }

    // 2. Parse row
    const parsed = await parsePastedRow(rawRow, projectName);
    parsed.postType = 'READY_TO_MOVE';

    // 3. Find slide image on Google Drive
    let slideDataUrl = '';
    try {
      slideDataUrl = await findC3SlideByUnit(unit);
    } catch (e: any) {
      return NextResponse.json({ error: `Failed to find slide image: ${e.message}` }, { status: 404 });
    }

    parsed.slideDataUrl = slideDataUrl;
    parsed.slideName = `${unit}.jpg`;

    // 4. Build preview
    const previewText = await buildTelegramHtmlPost(parsed);

    return NextResponse.json({
      parsed,
      preview: previewText,
      slideDataUrl
    });

  } catch (error: any) {
    console.error('C3 Autopost error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process request' }, { status: 500 });
  }
}
