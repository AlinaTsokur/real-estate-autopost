import { NextResponse } from 'next/server';
import { sendWhatsAppText, getInstanceState } from '@/lib/whatsapp/green-api';

// Sends to ONE group. Frontend handles the 36s delay between calls.
export async function POST(req: Request) {
  try {
    const { text, groupId } = await req.json() as { text: string; groupId: string };

    if (!text || !groupId) {
      return NextResponse.json({ error: 'text and groupId required' }, { status: 400 });
    }

    const state = await getInstanceState().catch(() => 'unknown');
    if (state !== 'authorized') {
      return NextResponse.json({ error: `WhatsApp не готов (статус: ${state})` }, { status: 409 });
    }

    await sendWhatsAppText(groupId, text);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
