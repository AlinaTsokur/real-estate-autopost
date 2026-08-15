// Замена листа CONFIG2: остров, смайлик и дата сдачи.
//
// Источники разные и это намеренно:
//   остров и здания — база IT-команды (там они ведутся),
//   смайлик        — наша база project_emoji (его придумываем мы).
// Проект ищем по имени в базе IT и дальше работаем по его id, чтобы не
// спотыкаться о разное написание названий.
import { neon } from '@neondatabase/serverless';

const unitsDb = neon(process.env.UNITS_DB_URL!);
const meta = neon(process.env.META_DB_URL!);

// В базу IT-команды мы только читаем. Запрос идёт в транзакции READ ONLY, так
// что случайная запись будет отклонена самим Postgres, а не только уговором.
async function units<T = any>(q: any): Promise<T[]> {
  const [rows] = await unitsDb.transaction([q], { readOnly: true });
  return rows as T[];
}

/** Имена приходят из постов и вставленных строк — сверяем без регистра и лишних пробелов. */
const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

interface ProjectRow { id: string; code: string; island: string }

async function lookup(key: string): Promise<ProjectRow | null> {
  const rows = (await units(unitsDb`
    SELECT p.id, p.code::text AS code, coalesce(d.name, '') AS island
    FROM projects p LEFT JOIN districts d ON d.id = p.district_id
    WHERE lower(regexp_replace(trim(p.name), '\\s+', ' ', 'g')) = ${key}
    ORDER BY (p.emirate::text = 'Abu Dhabi') DESC
    LIMIT 1
  `)) as any[];
  return rows.length ? { id: rows[0].id, code: rows[0].code, island: rows[0].island } : null;
}

/**
 * В таблице проекты разбиты по зданиям и написаны вольнее, чем в базе:
 * «The Source II», «Manarat Living III», «Bashayer Residence». В базе это один
 * проект, поэтому пробуем несколько вариантов написания.
 */
const ALIASES: Record<string, string> = {
  'louvre abu dhabi residences': 'louvre residences',
  'the source terraces': 'the source',
  'beach terraces': 'fahid beach terraces',
};

function variants(name: string): string[] {
  const base = norm(name);
  const out = [base];
  if (ALIASES[base]) out.push(ALIASES[base]);
  const noRoman = base.replace(/\s+(i{1,3}|iv|v)$/i, '').trim();
  if (noRoman !== base) out.push(noRoman);
  for (const v of [...out]) {
    if (v.endsWith('residence')) out.push(v + 's');
    if (v.endsWith('residences')) out.push(v.slice(0, -1));
  }
  return [...new Set(out)].filter(Boolean);
}

async function findProject(projectName: string): Promise<ProjectRow | null> {
  for (const v of variants(projectName)) {
    const hit = await lookup(v);
    if (hit) return hit;
  }
  return null;
}

/** Остров и смайлик проекта. Пустые строки, если проект не найден — как и лист раньше. */
export async function getProjectConfig(projectName: string): Promise<{ island: string; emoji: string }> {
  const proj = await findProject(projectName);
  if (!proj) return { island: '', emoji: '' };

  const rows = (await meta`SELECT emoji FROM project_emoji WHERE project_id = ${proj.id}`) as any[];
  return { island: proj.island, emoji: rows[0]?.emoji || '' };
}

/**
 * Разбирает код юнита на номер проекта и номер здания. Форматов два:
 *   старый из таблицы — 2+2+2 («010511»)
 *   нынешний из базы  — 3+2+3 («040·01·001»)
 */
export function splitUnitCode(code: string): { building: number } | null {
  const d = String(code || '').replace(/\D/g, '');
  if (d.length >= 8) return { building: Number(d.slice(3, 5)) };
  if (d.length >= 4) return { building: Number(d.slice(2, 4)) };
  return null;
}

/**
 * Дата сдачи здания в формате «31/08/2026».
 * Форматируем в SQL: в JS дата приезжает как момент времени в UTC и съезжает
 * на день назад.
 */
export async function getHandoverByCode(
  projectName: string,
  code: string,
): Promise<{ value: string; warning: string }> {
  const proj = await findProject(projectName);
  if (!proj) return { value: '', warning: `Проект не найден в базе: ${projectName}` };

  const parts = splitUnitCode(code);
  if (!parts) return { value: '', warning: `Не разобрать код юнита: ${code}` };

  const rows = (await units(unitsDb`
    SELECT to_char(handover_date, 'DD/MM/YYYY') AS handover, name
    FROM buildings
    WHERE project_id = ${proj.id} AND code::int = ${parts.building}
    LIMIT 1
  `)) as any[];

  if (!rows.length) return { value: '', warning: `Здание ${parts.building} не найдено в проекте ${projectName}` };
  if (!rows[0].handover) return { value: '', warning: `Дата сдачи не задана: ${projectName} / ${rows[0].name}` };
  return { value: rows[0].handover, warning: '' };
}
