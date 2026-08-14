import { NextResponse } from 'next/server';
import { addWaQueueItem } from '@/lib/wa-queue/store';

const INTERVAL_MINUTES = 2;

// "YYYY-MM-DDTHH:MM" (datetime-local, Dubai wall-clock) → "YYYY-MM-DD HH:MM"
function toScheduledAt(base: string, offsetMinutes: number): string {
  const [datePart, timePart] = base.split('T');
  const [h, m] = timePart.split(':').map(Number);
  const totalMinutes = h * 60 + m + offsetMinutes;
  const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  // If overflow past midnight, advance date by days
  const extraDays = Math.floor((h * 60 + m + offsetMinutes) / (24 * 60));
  if (extraDays > 0) {
    const d = new Date(`${datePart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + extraDays);
    return `${d.toISOString().slice(0, 10)} ${hh}:${mm}`;
  }
  return `${datePart} ${hh}:${mm}`;
}

export async function POST(req: Request) {
  try {
    const { text, label, groups, startAt } = await req.json() as {
      text: string;
      label: string;
      groups: { id: string; name: string }[];
      startAt: string;
    };

    if (!text || !groups?.length || !startAt) {
      return NextResponse.json({ error: 'text, groups and startAt required' }, { status: 400 });
    }

    for (let i = 0; i < groups.length; i++) {
      const scheduledAt = toScheduledAt(startAt, i * INTERVAL_MINUTES);
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
