import { NextResponse } from 'next/server';
import { buildTelegramHtmlPost } from '@/lib/posts/templates';

export async function POST(req: Request) {
  try {
    const { data } = await req.json();

    if (!data) {
      return NextResponse.json({ error: 'data is required' }, { status: 400 });
    }

    const previewText = await buildTelegramHtmlPost(data);

    return NextResponse.json({ preview: previewText });
  } catch (error: any) {
    console.error('Error building preview:', error);
    return NextResponse.json({ error: error.message || 'Failed to build preview' }, { status: 500 });
  }
}
