import { NextRequest, NextResponse } from 'next/server';
import { getCatalogRows, updateCatalogCover } from '@/lib/catalog/store';

export async function GET() {
  try {
    const rows = await getCatalogRows();
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, imageUrl } = await req.json();
    if (!id || !imageUrl) return NextResponse.json({ error: 'id and imageUrl required' }, { status: 400 });
    await updateCatalogCover(id, imageUrl);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
