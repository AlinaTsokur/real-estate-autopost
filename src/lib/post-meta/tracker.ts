// Отметки «по этому проекту рассылка сегодня уже ушла».
// Раньше лежали в Google-таблице (лист TRACKER, ячейка A1) — теперь в нашей
// собственной базе, рядом со смайликами проектов.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.META_DB_URL!);

// Один ряд на вид рассылки — на случай, если появится второй трекер.
const KEY = 'budget';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS broadcast_tracker (
      key        text PRIMARY KEY,
      checked    jsonb       NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export async function getChecked(): Promise<Record<string, boolean>> {
  await ensureTable();
  const rows = (await sql`SELECT checked FROM broadcast_tracker WHERE key = ${KEY}`) as any[];
  return (rows[0]?.checked as Record<string, boolean>) ?? {};
}

export async function setChecked(checked: Record<string, boolean>): Promise<void> {
  await ensureTable();
  await sql`
    INSERT INTO broadcast_tracker (key, checked)
    VALUES (${KEY}, ${JSON.stringify(checked)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET checked = EXCLUDED.checked, updated_at = now()
  `;
}

/** Переносит отметки из таблицы, если в базе ещё пусто. Одноразово, при первом чтении. */
export async function seedFromSheetIfEmpty(fromSheet: () => Promise<Record<string, boolean>>): Promise<Record<string, boolean>> {
  await ensureTable();
  const rows = (await sql`SELECT checked FROM broadcast_tracker WHERE key = ${KEY}`) as any[];
  if (rows.length) return (rows[0].checked as Record<string, boolean>) ?? {};

  let seed: Record<string, boolean> = {};
  try { seed = await fromSheet(); } catch { /* таблица недоступна — начинаем с чистого */ }
  await setChecked(seed);
  return seed;
}
