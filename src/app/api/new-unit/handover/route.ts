import { NextRequest, NextResponse } from 'next/server';
import { getConfig2Handover } from '@/lib/google/sheets';
import { formatHandoverDate } from '@/lib/posts/formatters';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project') ?? '';
  const code    = searchParams.get('code') ?? '';

  if (!project || !code) {
    return NextResponse.json({ date: '' });
  }

  const codePrefix = code.replace(/\D/g, '').slice(0, 4);
  if (codePrefix.length < 4) {
    return NextResponse.json({ date: '' });
  }

  try {
    const result = await getConfig2Handover(project, codePrefix);
    const date = result.value ? formatHandoverDate(result.value) : '';
    return NextResponse.json({ date });
  } catch {
    return NextResponse.json({ date: '' });
  }
}
