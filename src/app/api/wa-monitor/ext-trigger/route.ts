import { NextResponse } from 'next/server';
import { saveWaRequest } from '@/lib/wa-monitor/sheets';

const REMIND_DELAY_MS = 5 * 60 * 1000; // 5 min for testing → change to 2 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const { quotedText, chatName, instanceName } = await request.json();

    if (!quotedText) {
      return NextResponse.json({ error: 'quotedText required' }, { status: 400 });
    }

    await saveWaRequest({
      instance: 'web-extension',
      instanceName: instanceName || 'Алина (Web)',
      phone: chatName || 'unknown',
      name: chatName || 'unknown',
      request: quotedText.slice(0, 1000),
      remindAt: new Date(Date.now() + REMIND_DELAY_MS)
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
