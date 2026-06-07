import { NextResponse } from 'next/server';
import { getOriginalPriceForObject } from '@/lib/google/sheets';
import { searchOldPosts } from '@/lib/telegram/mtproto';

function cleanPriceForSearch(price: string): string {
  // Typical prices might be "7.559.557,70" or "7 559 557"
  // We want to just search for the main integer part with dots for Telegram channel
  // e.g. "7.559.557"
  
  // 1. Remove all spaces, currencies, etc.
  let p = price.replace(/[^\d.,]/g, '');
  
  // 2. Try to drop the decimal part if it exists (usually after a comma)
  if (p.includes(',')) {
    p = p.split(',')[0];
  } else if (p.includes('.') && p.lastIndexOf('.') > p.length - 4 && (p.length - p.lastIndexOf('.') <= 3)) {
    // maybe it uses dot as decimal separator (e.g. 123.45)
    // if the last dot is very close to the end, assume it's a decimal
    const parts = p.split('.');
    if (parts[parts.length - 1].length <= 2) {
      parts.pop();
      p = parts.join('');
    }
  }

  // 3. Remove remaining dots just to get the raw number
  const rawNumStr = p.replace(/[.,]/g, '');
  const rawNum = parseInt(rawNumStr, 10);
  
  if (isNaN(rawNum)) return '';

  // 4. Format with dots for telegram search "7.559.557"
  return new Intl.NumberFormat('de-DE').format(rawNum);
}

function extractOldSellingPrice(text: string): string | null {
  // Looks for "Selling Price: 8.490.000 AED" or "Selling Price: 8 490 000"
  const match = text.match(/Selling Price:\s*([\d.,\s]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { unit } = await req.json();

    if (!unit) {
      return NextResponse.json({ error: 'Unit is required' }, { status: 400 });
    }

    // 1. Get original price from Google Sheets
    const originalPrice = await getOriginalPriceForObject(unit);
    
    if (!originalPrice) {
      return NextResponse.json({ 
        originalPrice: '', 
        posts: [], 
        message: 'Original Price not found in Google Sheets for this Unit.' 
      });
    }

    // 2. Format price for search
    const searchStr = cleanPriceForSearch(originalPrice);
    
    if (!searchStr) {
       return NextResponse.json({ 
        originalPrice, 
        posts: [], 
        message: 'Could not format price for search.' 
      });
    }

    // 3. Search via MTProto
    const posts = await searchOldPosts(searchStr);

    // 4. Try to extract old selling price from posts
    const enrichedPosts = posts.map(post => {
      return {
        ...post,
        extractedSellingPrice: extractOldSellingPrice(post.text)
      };
    });

    let extractedOldPrice = '';
    if (enrichedPosts && enrichedPosts.length > 0) {
      const p = enrichedPosts[0].extractedSellingPrice;
      if (p) extractedOldPrice = p;
    }

    return NextResponse.json({
      originalPrice,
      extractedOldPrice, // the first one found, for auto-fill
      searchStr,
      posts: enrichedPosts
    });
  } catch (error: any) {
    console.error('Search old post error:', error);
    return NextResponse.json({ error: error.message || 'Failed to search old posts' }, { status: 500 });
  }
}
