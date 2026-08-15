import { NextResponse } from 'next/server';
import { buildCatalogDraftSheet } from '@/lib/catalog/draft-sheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Собирает гугл-таблицу по всем проектам для ручного заполнения каталога.
export async function POST() {
  try {
    return NextResponse.json(await buildCatalogDraftSheet());
  } catch (e: any) {
    console.error('catalog-draft-sheet error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
