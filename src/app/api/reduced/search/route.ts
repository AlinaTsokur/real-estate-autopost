import { NextResponse } from 'next/server';
import { searchOldPost } from '@/lib/telegram/search-client';

export async function POST(request: Request) {
  try {
    const { originalPrice, projectName } = await request.json();

    if (!originalPrice || !projectName) {
      return NextResponse.json({ error: 'Missing originalPrice or projectName' }, { status: 400 });
    }

    const posts = await searchOldPost(originalPrice, projectName);

    return NextResponse.json({ posts });
  } catch (error: any) {
    console.error('Reduced search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
