import { NextResponse } from 'next/server';
import { parsePastedRow } from '@/lib/parsing/row-parser';
import { buildTelegramHtmlPost } from '@/lib/posts/templates';

export async function POST(req: Request) {
  try {
    const { rawText, projectName } = await req.json();

    if (!rawText) {
      return NextResponse.json({ error: 'rawText is required' }, { status: 400 });
    }

    // Use our ported Apps Script parsing logic
    const parsed = await parsePastedRow(rawText, projectName);

    // Pre-build a preview using default 'NEW' post type
    const previewData = { ...parsed, postType: 'NEW' };
    const previewText = await buildTelegramHtmlPost(previewData);

    return NextResponse.json({ 
      parsed,
      preview: previewText
    });
  } catch (error: any) {
    console.error('Error parsing row:', error);
    return NextResponse.json({ error: error.message || 'Failed to parse row' }, { status: 500 });
  }
}
