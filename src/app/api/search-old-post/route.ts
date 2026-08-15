import { NextResponse } from 'next/server';
import { getUnitPricesByCode } from '@/lib/units-db/units';
import { searchOldPosts, SearchedPost } from '@/lib/telegram/mtproto';

// Варианты написания цены для поиска по каналу: «7.284.965».
// Филсы в постах не печатают, но округляли их по-разному, поэтому пробуем
// и округление, и отбрасывание копеек — иначе старый пост не находится.
function priceQueries(price: number): string[] {
  const variants = [Math.round(price), Math.floor(price), Math.ceil(price)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    if (!Number.isFinite(v) || v <= 0) continue;
    const s = new Intl.NumberFormat('de-DE').format(v);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function extractOldSellingPrice(text: string): string | null {
  // Ловит и «Selling Price: 8.490.000 AED» обычного поста,
  // и «New Selling price: …» поста об изменении цены.
  const match = text.match(/Selling Price:\s*([\d.,\s]+)/i);
  return match && match[1] ? match[1].trim() : null;
}

export async function POST(req: Request) {
  try {
    const { unit } = await req.json();

    if (!unit) {
      return NextResponse.json({ error: 'Unit is required' }, { status: 400 });
    }

    // 1. Цены юнита — из нашей базы, как и всё остальное в посте (только чтение)
    const prices = await getUnitPricesByCode(unit);

    if (!prices) {
      return NextResponse.json({
        originalPrice: '',
        posts: [],
        message: `Юнит ${unit} не найден в базе.`,
      });
    }

    if (!prices.originalPrice) {
      return NextResponse.json({
        originalPrice: '',
        posts: [],
        message: `У юнита ${prices.code} в базе не заполнена Original Price — по ней ищется старый пост.`,
      });
    }

    // 2. Ищем в канале пост с этой Original Price: она не меняется от поста
    // к посту, поэтому по ней и находится предыдущее объявление юнита.
    const queries = priceQueries(prices.originalPrice);
    let posts: SearchedPost[] = [];
    let searchStr = queries[0] || '';

    for (const q of queries) {
      const found = await searchOldPosts(q);
      if (found.length) { posts = found; searchStr = q; break; }
    }

    // 3. Достаём из найденных постов их Selling Price — это и есть старая цена
    const enrichedPosts = posts.map(post => ({
      ...post,
      extractedSellingPrice: extractOldSellingPrice(post.text),
    }));

    const extractedOldPrice = enrichedPosts[0]?.extractedSellingPrice || '';

    return NextResponse.json({
      originalPrice: new Intl.NumberFormat('de-DE').format(Math.round(prices.originalPrice)) + ' AED',
      extractedOldPrice, // the first one found, for auto-fill
      searchStr,
      posts: enrichedPosts,
      message: enrichedPosts.length
        ? ''
        : `В канале нет поста с Original Price ${searchStr} — старую цену придётся вписать вручную.`,
    });
  } catch (error: any) {
    console.error('Search old post error:', error);
    return NextResponse.json({ error: error.message || 'Failed to search old posts' }, { status: 500 });
  }
}
