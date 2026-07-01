import { NextResponse } from 'next/server';
import { sendWhatsAppText } from '@/lib/whatsapp/green-api';
import { getInstanceState } from '@/lib/whatsapp/green-api';

const DELAY_MS = 5000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  try {
    const { text, groupIds } = await req.json() as { text: string; groupIds: string[] };

    if (!text || !groupIds?.length) {
      return NextResponse.json({ error: 'text and groupIds required' }, { status: 400 });
    }

    const state = await getInstanceState().catch(() => 'unknown');
    if (state !== 'authorized') {
      return NextResponse.json({ error: `WhatsApp не готов (статус: ${state})` }, { status: 409 });
    }

    const results: { id: string; ok?: boolean; error?: string }[] = [];

    for (let i = 0; i < groupIds.length; i++) {
      if (i > 0) await sleep(DELAY_MS);
      try {
        await sendWhatsAppText(groupIds[i], text);
        results.push({ id: groupIds[i], ok: true });
      } catch (e: any) {
        const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
        results.push({ id: groupIds[i], error: detail });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
