import { NextResponse } from 'next/server';
import { getProjectParseConfig, getConfig2 } from '@/lib/google/sheets';
import { parseTsvWithQuotedMultiline, isEmptyRow, isHeaderRow, selectLowestByExactType } from '@/lib/parsing/table-parser';
import { parseRowByFormat } from '@/lib/parsing/row-parser';
import { extractLeadingNumberText, formatNumberLikeSheet, formatArea2, toNumber, isVillaObject } from '@/lib/posts/formatters';
import { buildBudgetText, BudgetItem } from '@/lib/posts/budget';

export async function POST(request: Request) {
  try {
    const { rawText, projectName } = await request.json();

    if (!rawText || !projectName) {
      return NextResponse.json({ error: 'Missing rawText or projectName' }, { status: 400 });
    }

    const config = await getProjectParseConfig(projectName);
    const objectType = config.objectType || 'Apartment';
    
    const rows = parseTsvWithQuotedMultiline(rawText);
    const parsedRows: any[] = [];

    rows.forEach(parts => {
      if (isEmptyRow(parts)) return;
      if (isHeaderRow(parts)) return;

      const parsed = parseRowByFormat(parts, config, projectName);
      
      const sellingPriceText = String(parsed.sellingPrice || '').trim();
      const type = String(parsed.type || '').trim();

      if (!type || !sellingPriceText) return;

      const sellingPriceNumber = Number(toNumber(sellingPriceText));
      if (isNaN(sellingPriceNumber) || sellingPriceNumber === 0) return;

      parsed.objectType = objectType;
      parsed.sellingPriceNumber = sellingPriceNumber;
      parsed.areaNumber = Number(toNumber(extractLeadingNumberText(parsed.areaM2))) || '';
      parsed.grossAreaNumber = Number(toNumber(extractLeadingNumberText(parsed.grossAreaM2))) || '';
      parsed.plotAreaNumber = Number(toNumber(extractLeadingNumberText(parsed.plotAreaM2))) || '';

      parsedRows.push(parsed);
    });

    if (!parsedRows.length) {
      return NextResponse.json({ error: 'Failed to read any valid rows. Check table format.' }, { status: 400 });
    }

    const selected = selectLowestByExactType(parsedRows);

    const formattedSelected = selected.map(item => ({
      code: item.code || '',
      type: item.type || '',
      view: item.view || '',
      unit: item.unit || '',
      rowName: item.rowName || '',
      sellingPrice: formatNumberLikeSheet(item.sellingPriceNumber),
      areaM2: item.areaNumber !== '' ? formatArea2(item.areaNumber) : '',
      grossAreaM2: item.grossAreaNumber !== '' ? formatArea2(item.grossAreaNumber) : '',
      plotAreaM2: item.plotAreaNumber !== '' ? formatArea2(item.plotAreaNumber) : '',
      paymentPlan: item.paymentPlan || ''
    }));

    const cfg2 = await getConfig2(projectName);
    const isVilla = isVillaObject(objectType);

    const items: BudgetItem[] = selected.map(item => ({
      type: item.type || '',
      isVilla,
      price: Number(item.sellingPriceNumber),
      view: item.view || '',
      unit: item.unit || '',
      rowName: item.rowName || '',
      areaM2: item.areaNumber,
      grossAreaM2: item.grossAreaNumber,
      plotAreaM2: item.plotAreaNumber,
      paymentPlan: item.paymentPlan || '',
    }));

    const text = buildBudgetText(
      { project: projectName, island: cfg2.island, emoji: cfg2.emoji, count: items.length },
      items,
    );


    return NextResponse.json({
      project: projectName,
      objectType,
      totalRows: parsedRows.length,
      selectedRows: selected.length,
      source: 'paste',
      text,
      selected: formattedSelected,
      rawSelected: selected // for generating text on client or server
    });

  } catch (error: any) {
    console.error('Parse budget error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
