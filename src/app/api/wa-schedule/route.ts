import { NextResponse } from 'next/server';
import {
  getWaQueue,
  updateWaQueueItemMarked,
  updateWaQueueConfig,
} from '@/lib/google/sheets';

export async function GET() {
  try {
    const data = await getWaQueue();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'toggle') {
      const { rowIndex, marked } = body as { action: string; rowIndex: number; marked: boolean };
      await updateWaQueueItemMarked(rowIndex, marked);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'config') {
      const { configRowIndex, scheduledAt, waChatId } = body as {
        action: string;
        configRowIndex: number;
        scheduledAt: string;
        waChatId: string;
      };
      await updateWaQueueConfig(configRowIndex, scheduledAt, waChatId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
