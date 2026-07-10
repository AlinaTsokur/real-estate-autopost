import { NextResponse } from 'next/server';
import { getConfig, saveConfig, setRemindDelayMinutes } from '@/lib/wa-monitor/sheets';

export async function GET() {
  try {
    const config = await getConfig();
    return NextResponse.json(config);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { triggers, instances, remindDelayMinutes } = await request.json();
    await saveConfig(triggers || [], instances || []);
    if (typeof remindDelayMinutes === 'number') {
      await setRemindDelayMinutes(remindDelayMinutes);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
