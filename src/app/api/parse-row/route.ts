import { NextResponse } from 'next/server';
import { getProjectParseConfig, getConfig2Handover } from '@/lib/google/sheets';
import { parseRowByFormat, normalizeText } from '@/lib/parsing/row-parser';

export async function POST(request: Request) {
  try {
    const { rawText, projectName } = await request.json();

    if (!rawText || !projectName) {
      return NextResponse.json({ error: 'Missing rawText or projectName' }, { status: 400 });
    }

    const config = await getProjectParseConfig(projectName);
    
    // basic splitting logic
    let parts = rawText.trim().split('\\t').map((v: string) => String(v || '').trim());
    if (parts.length < 5) {
      parts = rawText.trim().split(/\\s{2,}/).map((v: string) => String(v || '').trim());
    }

    const parsed = parseRowByFormat(parts, config, projectName);
    
    // Auto handover
    if (normalizeText(projectName) === normalizeText('C3 Garden Residence')) {
      // C3 logic is already partially handled in row-parser, but we ensure handover
      parsed.handover = 'Ready to move';
    } else {
      // Fetch auto handover from CONFIG2
      const code = parsed.code || parsed.unit || '';
      if (code) {
        const prefix = code.replace(/\\D/g, '').slice(0, 4);
        const handoverObj = await getConfig2Handover(projectName, prefix);
        
        let formatted = handoverObj.value || '';
        
        // Format logic
        if (/ready/i.test(formatted) || /сдан/i.test(formatted)) {
          formatted = 'Ready to move';
        } else {
          const dateMatch = formatted.match(/^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$/);
          if (dateMatch) {
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const m = parseInt(dateMatch[2]) - 1;
            formatted = `from ${months[m]} ${dateMatch[3]}`;
          } else if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}$/i.test(formatted)) {
            formatted = `from ${formatted}`;
          }
        }
        
        // Post Builder doesn't use "from " in the final UI by default, so we can strip it or leave it.
        // Legacy stripped it.
        parsed.handover = formatted.replace(/^from\\s+/i, '');
      }
    }

    return NextResponse.json({ parsed });
  } catch (error: any) {
    console.error('Parse row error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
