import { NextResponse } from 'next/server';
import { getPendingReminders, deleteWaRequests } from '@/lib/wa-monitor/sheets';

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

// Dubai time (UTC+4).
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
    });
  } catch { return iso; }
}

export async function GET() {
  const pending = await getPendingReminders();
  const sentIds: number[] = [];

  for (const item of pending) {
    const line = item.tgMentions
      ? `${esc(item.instanceName)} ${item.tgMentions}`  // mentions must not be escaped so TG pings them
      : esc(item.instanceName);

    const lines = [
      `📌 <b>Напоминание о запросе брокера</b>`,
      ``,
      `👤 <b>Линия:</b> ${line}`,
      // Phone: monospace (tap to copy), no leading plus
      `📞 <b>Брокер:</b> ${esc(item.name)} <code>${esc(item.phone)}</code>`,
    ];
    if (item.chat) lines.push(`👥 <b>Группа:</b> ${esc(item.chat)}`);
    lines.push(`💬 <b>Запрос:</b> ${esc(item.request)}`);
    lines.push(`📅 <b>Написал (Дубай):</b> ${formatDate(item.timestamp)}`);

    await sendTgMessage(lines.join('\n'));
    sentIds.push(item.id);
  }

  // Remove reminded requests so the table keeps only pending ones.
  await deleteWaRequests(sentIds);

  return NextResponse.json({ ok: true, sent: sentIds.length });
}
