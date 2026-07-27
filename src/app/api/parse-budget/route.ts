import { NextResponse } from 'next/server';
import { getProjectParseConfig } from '@/lib/google/sheets';
import { parseTsvWithQuotedMultiline, isEmptyRow, isHeaderRow, selectLowestByExactType } from '@/lib/parsing/table-parser';
import { parseRowByFormat } from '@/lib/parsing/row-parser';
import { extractLeadingNumberText, formatNumberLikeSheet, formatArea2, toNumber } from '@/lib/posts/formatters';

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

    const cfg2 = await import('@/lib/google/sheets').then(m => m.getConfig2(projectName));
    const isVilla = import('@/lib/posts/formatters').then(m => m.isVillaObject(objectType));

    let title = '💰 Best Budget ' + (selected.length === 1 ? 'Unit' : 'Units') + ' | ' + projectName;
    if (cfg2.island) title += ' - ' + cfg2.island;
    if (cfg2.emoji) title += ' ' + cfg2.emoji;

    let text = '*' + title + '*\n\n';

    formattedSelected.forEach((item, index) => {
      if (index > 0) text += '\n\n';

      text += '*' + item.type + '*\n';

      if (objectType.toLowerCase().includes('villa') || objectType.toLowerCase().includes('townhouse')) {
        if (item.unit) text += item.unit + '\n';
        if (item.rowName) text += 'Row: ' + item.rowName + '\n';

        if (item.grossAreaM2) {
          const sqft = new Intl.NumberFormat('de-DE', { useGrouping: true }).format(Math.round(Number(selected[index].grossAreaNumber) * 10.7639));
          text += 'Gross area ' + item.grossAreaM2 + ' sqm / ' + sqft + ' sqft\n';
        }
        if (item.plotAreaM2) {
          const sqft = new Intl.NumberFormat('de-DE', { useGrouping: true }).format(Math.round(Number(selected[index].plotAreaNumber) * 10.7639));
          text += 'Plot area ' + item.plotAreaM2 + ' sqm / ' + sqft + ' sqft\n';
        }
      } else {
        if (item.view) text += item.view + '\n';

        if (item.areaM2) {
          const sqft = new Intl.NumberFormat('de-DE', { useGrouping: true }).format(Math.round(Number(selected[index].areaNumber) * 10.7639));
          text += item.areaM2 + ' sqm / ' + sqft + ' sqft\n';
        }
      }

      if (item.paymentPlan) {
        text += 'Payment plan: ' + item.paymentPlan + '\n';
      }

      text += '💰 Price: ' + item.sellingPrice + ' AED';
    });

    return NextResponse.json({
      project: projectName,
      objectType,
      totalRows: parsedRows.length,
      selectedRows: selected.length,
      text: text,
      selected: formattedSelected,
      rawSelected: selected // for generating text on client or server
    });

  } catch (error: any) {
    console.error('Parse budget error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
