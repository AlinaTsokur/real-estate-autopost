import { NextResponse } from 'next/server';
import { sendWhatsAppText, sendWhatsAppImage } from '@/lib/whatsapp/green-api';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chatId, text, imageBase64 } = body as {
      chatId: string;
      text: string;
      imageBase64?: string;
    };

    if (!chatId) return NextResponse.json({ error: 'chatId required' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

    if (imageBase64) {
      const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
      await sendWhatsAppImage(chatId, buffer, text);
    } else {
      await sendWhatsAppText(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const detail = error?.response?.data ?? error.message;
    console.error('send-whatsapp error:', detail);
    return NextResponse.json({ error: JSON.stringify(detail) }, { status: 500 });
  }
}
