// Наша память о сверке: кому и когда ушло, кто ответил, кого не трогать,
// и настройки рассылки. В базу IT-команды не пишем ничего.
import { neon } from '@neondatabase/serverless';
import { DEFAULT_TEMPLATES, Templates } from './message';

const sql = neon(process.env.META_DB_URL!);

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS broker_check_log (
        id          serial PRIMARY KEY,
        phone       text NOT NULL,
        broker_name text,
        units_count int  NOT NULL DEFAULT 0,
        message     text,
        status      text NOT NULL DEFAULT 'sent',
        error       text,
        wa_message_id text,
        sent_by     text,
        sent_at     timestamptz NOT NULL DEFAULT now(),
        reply_text  text,
        replied_at  timestamptz
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS broker_check_log_phone_idx ON broker_check_log (phone, sent_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS broker_check_optout (
        phone       text PRIMARY KEY,
        broker_name text,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS broker_check_settings (
        key   text PRIMARY KEY,
        value text NOT NULL
      )
    `;
  })();
  return ready;
}

// ── Настройки ────────────────────────────────────────────────────────────────

export interface Settings extends Templates {
  /** Главный рубильник. Пока 'off' — отправка физически невозможна. */
  sendingEnabled: boolean;
  /** Пауза между сообщениями в «отправить выбранным», секунды. */
  throttleSeconds: number;
  /** Инстанс Green API, от чьего имени пишем. */
  instanceId: string;
  /** Чьи листинги берём — ассистент, который их ведёт (assistant_name). */
  assistant: string;
  /** Дополнительный фильтр по старшему менеджеру (contacted_by); пусто — все. */
  manager: string;
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_TEMPLATES,
  sendingEnabled: false,   // намеренно выключено: включает только человек
  throttleSeconds: 60,
  instanceId: '',
  assistant: 'Daria',
  manager: '',
};

export async function getSettings(): Promise<Settings> {
  await ensureTables();
  const rows = (await sql`SELECT key, value FROM broker_check_settings`) as any[];
  const map = Object.fromEntries(rows.map(r => [r.key, r.value])) as Record<string, string>;
  const num = (k: string, d: number) => (Number.isFinite(Number(map[k])) && map[k] !== undefined ? Number(map[k]) : d);
  return {
    sendingEnabled: map.sendingEnabled === 'true',
    throttleSeconds: num('throttleSeconds', DEFAULT_SETTINGS.throttleSeconds),
    instanceId: map.instanceId ?? DEFAULT_SETTINGS.instanceId,
    assistant: map.assistant ?? DEFAULT_SETTINGS.assistant,
    manager: map.manager ?? DEFAULT_SETTINGS.manager,
    templateRu: map.templateRu || DEFAULT_SETTINGS.templateRu,
    templateEn: map.templateEn || DEFAULT_SETTINGS.templateEn,
    questionRuOne: map.questionRuOne || DEFAULT_SETTINGS.questionRuOne,
    questionRuMany: map.questionRuMany || DEFAULT_SETTINGS.questionRuMany,
    questionEnOne: map.questionEnOne || DEFAULT_SETTINGS.questionEnOne,
    questionEnMany: map.questionEnMany || DEFAULT_SETTINGS.questionEnMany,
  };
}

// Пишем только известные ключи: иначе в таблице настроек копится мусор от
// прежних версий формы, и потом непонятно, что из этого живое.
const SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await ensureTables();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !SETTING_KEYS.has(key)) continue;
    await sql`
      INSERT INTO broker_check_settings (key, value) VALUES (${key}, ${String(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
}

// ── Исключённые из рассылки ──────────────────────────────────────────────────

export async function getOptOut(): Promise<Record<string, string>> {
  await ensureTables();
  const rows = (await sql`SELECT phone, broker_name FROM broker_check_optout`) as any[];
  return Object.fromEntries(rows.map(r => [r.phone, r.broker_name || '']));
}

export async function setOptOut(phone: string, brokerName: string, excluded: boolean): Promise<void> {
  await ensureTables();
  if (excluded) {
    await sql`
      INSERT INTO broker_check_optout (phone, broker_name) VALUES (${phone}, ${brokerName})
      ON CONFLICT (phone) DO UPDATE SET broker_name = EXCLUDED.broker_name
    `;
  } else {
    await sql`DELETE FROM broker_check_optout WHERE phone = ${phone}`;
  }
}

// ── Журнал отправок ──────────────────────────────────────────────────────────

export interface LastSent {
  sentAt: string;
  status: string;
  error: string | null;
  unitsCount: number;
  repliedAt: string | null;
  replyText: string | null;
}

/** Последняя отправка по каждому номеру — для колонки статуса на странице. */
export async function getLastSentByPhone(): Promise<Record<string, LastSent>> {
  await ensureTables();
  const rows = (await sql`
    SELECT DISTINCT ON (phone) phone, sent_at, status, error, units_count, replied_at, reply_text
    FROM broker_check_log
    ORDER BY phone, sent_at DESC
  `) as any[];
  return Object.fromEntries(
    rows.map(r => [
      r.phone,
      {
        sentAt: new Date(r.sent_at).toISOString(),
        status: r.status,
        error: r.error,
        unitsCount: Number(r.units_count),
        repliedAt: r.replied_at ? new Date(r.replied_at).toISOString() : null,
        replyText: r.reply_text,
      } as LastSent,
    ]),
  );
}

/** Сколько сообщений ушло за сегодня — просто счётчик на странице. */
export async function countSentToday(): Promise<number> {
  await ensureTables();
  const rows = (await sql`
    SELECT count(*) AS n FROM broker_check_log
    WHERE status = 'sent' AND sent_at >= date_trunc('day', now())
  `) as any[];
  return Number(rows[0]?.n ?? 0);
}

export async function logSend(opts: {
  phone: string;
  brokerName: string;
  unitsCount: number;
  message: string;
  status: 'sent' | 'failed';
  error?: string;
  waMessageId?: string;
  sentBy?: string;
}): Promise<void> {
  await ensureTables();
  await sql`
    INSERT INTO broker_check_log (phone, broker_name, units_count, message, status, error, wa_message_id, sent_by)
    VALUES (${opts.phone}, ${opts.brokerName}, ${opts.unitsCount}, ${opts.message},
            ${opts.status}, ${opts.error ?? null}, ${opts.waMessageId ?? null}, ${opts.sentBy ?? null})
  `;
}

/**
 * Отметить ответ брокера. Зовётся из вебхука на входящее сообщение.
 * Пишем в последнюю отправку этому номеру, если она ещё без ответа.
 */
export async function markReply(phone: string, text: string): Promise<boolean> {
  await ensureTables();
  const rows = (await sql`
    UPDATE broker_check_log SET reply_text = ${text}, replied_at = now()
    WHERE id = (
      SELECT id FROM broker_check_log
      WHERE phone = ${phone} AND status = 'sent' AND replied_at IS NULL
      ORDER BY sent_at DESC LIMIT 1
    )
    RETURNING id
  `) as any[];
  return rows.length > 0;
}
