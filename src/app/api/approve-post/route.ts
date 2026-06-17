import { NextResponse } from 'next/server';
import { approveUnitRow } from '@/lib/google/sheets';

export async function POST(req: Request) {
  try {
    const { unit, code } = await req.json() as { unit?: string; code?: string };
    if (!unit && !code) return NextResponse.json({ error: 'unit or code required' }, { status: 400 });

    const result = await approveUnitRow(code ?? '', unit);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
