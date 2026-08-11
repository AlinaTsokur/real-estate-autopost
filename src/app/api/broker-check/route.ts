import { NextResponse } from 'next/server';
import axios from 'axios';
import { loadBrokers, listPeople } from '@/lib/broker-check/brokers';
import { buildMessage } from '@/lib/broker-check/message';
import {
  getSettings, saveSettings, getOptOut, setOptOut,
  getLastSentByPhone, countSentToday, logSend, Settings,
} from '@/lib/broker-check/store';
import { getConfig } from '@/lib/wa-monitor/sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ── GET: всё для страницы одним запросом ─────────────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const settings = await getSettings();
    const assistant = url.searchParams.get('assistant') ?? settings.assistant;
    const manager = url.searchParams.get('manager') ?? settings.manager;

    const [{ brokers, withoutPhone }, optOut, lastSent, sentToday, people, waConfig] = await Promise.all([
      loadBrokers(assistant || undefined, manager || undefined),
      getOptOut(),
      getLastSentByPhone(),
      countSentToday(),
      listPeople(),
      getConfig().catch(() => ({ instances: [] as { id: string; name: string; token: string }[] })),
    ]);

    const items = brokers.map(b => ({
      phone: b.phone,
      phoneRaw: b.phoneRaw,
      name: b.name,
      language: b.language,
      assistant: b.assistant,
      manager: b.manager,
      units: b.units,
      message: buildMessage(b, settings),
      excluded: b.phone in optOut,
      last: lastSent[b.phone] ?? null,
    }));

    return NextResponse.json({
      items,
      withoutPhone,
      assistants: people.assistants,
      managers: people.managers,
      settings,
      sentToday,
      instances: (waConfig.instances || []).map(i => ({ id: i.id, name: i.name })),
    });
  } catch (e: any) {
    console.error('broker-check GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Отправка одного сообщения через Green API ────────────────────────────────
async function sendOne(instanceId: string, token: string, phone: string, message: string) {
  const res = await axios.post(
    `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`,
    { chatId: `${phone}@c.us`, message },
    { timeout: 30000 },
  );
  return String(res.data?.idMessage ?? '');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'settings') {
      await saveSettings(body.settings as Partial<Settings>);
      return NextResponse.json({ ok: true, settings: await getSettings() });
    }

    if (body.action === 'optout') {
      await setOptOut(String(body.phone), String(body.name ?? ''), !!body.excluded);
      return NextResponse.json({ ok: true });
    }

    // Отправка выбранным. targets: [{ phone, name, message, unitsCount }]
    if (body.action === 'send') {
      const settings = await getSettings();

      // Рубильник: пока выключен, наружу не уходит ничего.
      if (!settings.sendingEnabled) {
        return NextResponse.json(
          { error: 'Рассылка выключена. Включи её в настройках на странице — до этого ни одно сообщение не уйдёт.' },
          { status: 409 },
        );
      }

      const targets: { phone: string; name: string; message: string; unitsCount: number }[] = body.targets || [];
      if (!targets.length) return NextResponse.json({ error: 'Никто не выбран' }, { status: 400 });

      const { instances } = await getConfig();
      const inst = instances.find(i => i.id === settings.instanceId);
      if (!inst) {
        return NextResponse.json(
          { error: 'Не выбран номер, с которого писать. Укажи его в настройках.' },
          { status: 400 },
        );
      }

      // Не пишем с номера, который WhatsApp уже ограничил.
      const state = await axios
        .get(`https://api.green-api.com/waInstance${inst.id}/getStateInstance/${inst.token}`, { timeout: 15000 })
        .then(r => String(r.data?.stateInstance || 'unknown'))
        .catch(() => 'unknown');
      if (state !== 'authorized') {
        return NextResponse.json({ error: `WhatsApp «${inst.name}» не готов (статус: ${state})` }, { status: 409 });
      }

      const already = await countSentToday();
      const room = Math.max(0, settings.dailyLimit - already);
      if (room === 0) {
        return NextResponse.json(
          { error: `Дневной лимит исчерпан: сегодня уже ушло ${already} из ${settings.dailyLimit}.` },
          { status: 409 },
        );
      }

      const optOut = await getOptOut();
      const results: { phone: string; name: string; ok: boolean; error?: string }[] = [];
      let sent = 0;

      for (const t of targets) {
        if (sent >= room) {
          results.push({ phone: t.phone, name: t.name, ok: false, error: 'не уместился в дневной лимит' });
          continue;
        }
        if (t.phone in optOut) {
          results.push({ phone: t.phone, name: t.name, ok: false, error: 'исключён из рассылки' });
          continue;
        }

        try {
          const id = await sendOne(inst.id, inst.token, t.phone, t.message);
          await logSend({
            phone: t.phone, brokerName: t.name, unitsCount: t.unitsCount,
            message: t.message, status: 'sent', waMessageId: id, sentBy: inst.name,
          });
          results.push({ phone: t.phone, name: t.name, ok: true });
          sent++;
        } catch (e: any) {
          const detail = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
          await logSend({
            phone: t.phone, brokerName: t.name, unitsCount: t.unitsCount,
            message: t.message, status: 'failed', error: detail, sentBy: inst.name,
          });
          results.push({ phone: t.phone, name: t.name, ok: false, error: detail });
        }

        // Паузу между сообщениями держит страница, а не роут: со стороны сервера
        // ожидание в минуту упёрлось бы в лимит времени функции, и было бы не
        // видно прогресс. Здесь запрос всегда короткий.
      }

      return NextResponse.json({ ok: true, sent, results, limitLeft: Math.max(0, room - sent) });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (e: any) {
    console.error('broker-check POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
