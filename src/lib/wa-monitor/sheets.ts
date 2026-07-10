// WA Monitor data layer — backed by Neon (Postgres), not Google Sheets.
// Tables: wa_requests, wa_triggers, wa_instances (created via migration).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export interface WaInstance {
  id: string;
  token: string;
  name: string;
  tgMentions: string;
}

export interface PendingReminder {
  id: number;
  instance: string;
  instanceName: string;
  phone: string;
  name: string;
  request: string;
  timestamp: string;
  chat: string;
  tgMentions: string;
}

// ── Requests ────────────────────────────────────────────────────────────────

export async function saveWaRequest(opts: {
  instance: string;
  instanceName: string;
  phone: string;
  name: string;
  request: string;
  remindAt: Date;
  chat?: string;
}) {
  await sql`
    INSERT INTO wa_requests (instance, instance_name, phone, name, request, remind_at, chat)
    VALUES (${opts.instance}, ${opts.instanceName}, ${opts.phone}, ${opts.name}, ${opts.request}, ${opts.remindAt.toISOString()}, ${opts.chat || ''})
  `;
}

export async function getPendingReminders(): Promise<PendingReminder[]> {
  const rows = await sql`
    SELECT r.id, r.instance, r.instance_name, r.phone, r.name, r.request, r.chat, r.created_at,
           COALESCE(i.tg_mentions, '') AS tg_mentions
    FROM wa_requests r
    LEFT JOIN wa_instances i ON i.instance_id = r.instance
    WHERE r.reminded = false AND r.remind_at <= now()
    ORDER BY r.id
  ` as any[];
  return rows.map(r => ({
    id: Number(r.id),
    instance: r.instance || '',
    instanceName: r.instance_name || '',
    phone: r.phone || '',
    name: r.name || '',
    request: r.request || '',
    timestamp: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    chat: r.chat || '',
    tgMentions: r.tg_mentions || '',
  }));
}

// Delete requests by id (called after a reminder is sent).
export async function deleteWaRequests(ids: number[]) {
  if (!ids.length) return;
  await sql`DELETE FROM wa_requests WHERE id = ANY(${ids})`;
}

// ── Config (triggers + instances) ─────────────────────────────────────────────

// Reminder delay in minutes (default 2 days if unset). Read by the webhook.
export async function getRemindDelayMinutes(): Promise<number> {
  try {
    const r = await sql`SELECT value FROM wa_settings WHERE key = 'remind_delay_minutes'` as any[];
    const n = parseInt(r[0]?.value, 10);
    return Number.isFinite(n) && n > 0 ? n : 2880;
  } catch {
    return 2880;
  }
}

export async function setRemindDelayMinutes(minutes: number) {
  const n = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 2880;
  await sql`
    INSERT INTO wa_settings (key, value) VALUES ('remind_delay_minutes', ${String(n)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function getConfig(): Promise<{ triggers: string[]; instances: WaInstance[]; remindDelayMinutes: number }> {
  const [t, i, delay] = await Promise.all([
    sql`SELECT word FROM wa_triggers ORDER BY word` as Promise<any[]>,
    sql`SELECT instance_id, token, name, tg_mentions FROM wa_instances ORDER BY name` as Promise<any[]>,
    getRemindDelayMinutes(),
  ]);
  return {
    triggers: t.map(r => String(r.word)),
    instances: i.map(r => ({ id: String(r.instance_id), token: String(r.token || ''), name: String(r.name || ''), tgMentions: String(r.tg_mentions || '') })),
    remindDelayMinutes: delay,
  };
}

export async function saveConfig(triggers: string[], instances: WaInstance[]) {
  // Replace triggers wholesale
  await sql`DELETE FROM wa_triggers`;
  for (const w of triggers) {
    const word = w.trim().toLowerCase();
    if (word) await sql`INSERT INTO wa_triggers (word) VALUES (${word}) ON CONFLICT (word) DO NOTHING`;
  }
  // Upsert instances; drop ones no longer present
  const keepIds = instances.map(i => i.id.trim()).filter(Boolean);
  if (keepIds.length) {
    await sql`DELETE FROM wa_instances WHERE instance_id <> ALL(${keepIds})`;
  } else {
    await sql`DELETE FROM wa_instances`;
  }
  for (const inst of instances) {
    const id = inst.id.trim();
    if (!id) continue;
    await sql`
      INSERT INTO wa_instances (instance_id, token, name, tg_mentions)
      VALUES (${id}, ${inst.token.trim()}, ${inst.name.trim()}, ${(inst.tgMentions || '').trim()})
      ON CONFLICT (instance_id) DO UPDATE SET token = EXCLUDED.token, name = EXCLUDED.name, tg_mentions = EXCLUDED.tg_mentions
    `;
  }
}
