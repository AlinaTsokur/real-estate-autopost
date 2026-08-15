import { NextResponse } from 'next/server';
import { saveCatalogRows, CatalogRow } from '@/lib/catalog/store';

export async function POST(request: Request) {
  try {
    const { rows } = await request.json();
    if (!rows?.length) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    await saveCatalogRows(rows as CatalogRow[]);
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
