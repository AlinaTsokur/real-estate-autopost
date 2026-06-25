import { NextRequest, NextResponse } from 'next/server';
import { uploadCatalogCover } from '@/lib/google/drive';
import { updateCatalogCover } from '@/lib/google/sheets';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const listingId = formData.get('listingId') as string | null;

    if (!file || !listingId) {
      return NextResponse.json({ error: 'file and listingId required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = file.type || 'image/jpeg';
    const fileName = `${listingId}.${ext}`;

    const url = await uploadCatalogCover(buffer, mimeType, fileName);
    await updateCatalogCover(listingId, url);

    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
