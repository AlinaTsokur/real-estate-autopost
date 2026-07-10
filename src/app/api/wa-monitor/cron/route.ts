import { NextResponse } from 'next/server';
import { getPendingReminders, markReminded } from '@/lib/wa-monitor/sheets';

const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TG_CHAT_ID = '-1004423234391';

async function sendTgMessage(text: string) {
  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' })
  });
}

function esc(s: string) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export async function GET() {
  const pending = await getPendingReminders();
  let sent = 0;

  for (const item of pending) {
    const lines = [
      `📌 <b>Напоминание о запросе брокера</b>`,
      ``,
      `👤 <b>Линия:</b> ${esc(item.instanceName)}`,
      `📞 <b>Брокер:</b> ${esc(item.name)} (+${esc(item.phone)})`,
    ];
    if (item.chat) lines.push(`👥 <b>Группа:</b> ${esc(item.chat)}`);
    lines.push(`💬 <b>Запрос:</b> ${esc(item.request)}`);
    lines.push(`📅 <b>Написал:</b> ${formatDate(item.timestamp)}`);

    await sendTgMessage(lines.join('\n'));
    await markReminded(item.rowIndex);
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
