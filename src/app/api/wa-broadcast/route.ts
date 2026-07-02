import { NextResponse } from 'next/server';
import { addWaQueueItem } from '@/lib/google/sheets';

const DELAY_SECONDS = 36;

function dubaiNow(): Date {
  // Dubai is UTC+4, no DST
  return new Date(Date.now() + 4 * 60 * 60 * 1000);
}

function toScheduledAt(d: Date): string {
  // "YYYY-MM-DD HH:MM" in Dubai wall-clock time
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export async function POST(req: Request) {
  try {
    const { text, label, groups } = await req.json() as {
      text: string;
      label: string;
      groups: { id: string; name: string }[];
    };

    if (!text || !groups?.length) {
      return NextResponse.json({ error: 'text and groups required' }, { status: 400 });
    }

    const base = dubaiNow();

    for (let i = 0; i < groups.length; i++) {
      const sendAt = new Date(base.getTime() + i * DELAY_SECONDS * 1000);
      const scheduledAt = toScheduledAt(sendAt);
      await addWaQueueItem(
        `${label} → ${groups[i].name}`,
        text,
        '',
        scheduledAt,
        groups[i].id,
      );
    }

    return NextResponse.json({ ok: true, queued: groups.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
