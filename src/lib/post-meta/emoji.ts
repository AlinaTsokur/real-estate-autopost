// Our own "Post Meta" DB: emoji/island per project, keyed by the IT team's
// project id. This is the ONLY thing we store on our side; everything else is
// read live from their DB.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.META_DB_URL!);

export interface ProjectMeta {
  projectId: string;
  projectName: string;
  emoji: string;
  island: string;
}

export async function getProjectMeta(projectId: string): Promise<ProjectMeta | null> {
  const rows = (await sql`
    SELECT project_id, project_name, emoji, island FROM project_emoji WHERE project_id = ${projectId}
  `) as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return { projectId: r.project_id, projectName: r.project_name || '', emoji: r.emoji || '', island: r.island || '' };
}

export async function listProjectMeta(): Promise<ProjectMeta[]> {
  const rows = (await sql`
    SELECT project_id, project_name, emoji, island FROM project_emoji ORDER BY project_name
  `) as any[];
  return rows.map(r => ({ projectId: r.project_id, projectName: r.project_name || '', emoji: r.emoji || '', island: r.island || '' }));
}

export async function setProjectEmoji(projectId: string, projectName: string, emoji: string) {
  await sql`
    INSERT INTO project_emoji (project_id, project_name, emoji)
    VALUES (${projectId}, ${projectName}, ${emoji})
    ON CONFLICT (project_id) DO UPDATE SET emoji = EXCLUDED.emoji, project_name = EXCLUDED.project_name, updated_at = now()
  `;
}

/** Проекты, которые ушли из источника, помечаются датой — строку со смайликом не удаляем. */
async function ensureArchivedColumn() {
  await sql`ALTER TABLE project_emoji ADD COLUMN IF NOT EXISTS archived_at timestamptz`;
}

// Названия активных проектов — из НАШЕЙ базы. Её наполняет ночная синхронизация,
// поэтому список тот же, что у источника, но читается из своего хранилища.
export async function listActiveProjectNames(): Promise<string[]> {
  await ensureArchivedColumn();
  const rows = (await sql`
    SELECT project_name FROM project_emoji
    WHERE archived_at IS NULL AND coalesce(project_name, '') <> ''
    ORDER BY project_name
  `) as any[];
  return rows.map(r => String(r.project_name).trim()).filter(Boolean);
}

// Daily sync: make sure every source project has a row. New projects get an
// empty emoji (to be filled later); existing rows keep their emoji untouched.
// Projects that vanished from the source are archived, not deleted — otherwise
// a hiccup on their side would wipe emoji we filled in by hand.
export async function syncProjectStubs(
  projects: { id: string; name: string }[],
): Promise<{ added: number; renamed: number; archived: number; restored: number }> {
  await ensureArchivedColumn();
  let added = 0, renamed = 0;

  for (const p of projects) {
    const name = (p.name || '').trim();
    const before = (await sql`SELECT project_name FROM project_emoji WHERE project_id = ${p.id}`) as any[];
    const res = (await sql`
      INSERT INTO project_emoji (project_id, project_name)
      VALUES (${p.id}, ${name})
      ON CONFLICT (project_id)
        DO UPDATE SET project_name = EXCLUDED.project_name, archived_at = NULL
      RETURNING (xmax = 0) AS inserted
    `) as any[];
    if (res[0]?.inserted) added++;
    else if (before[0] && before[0].project_name !== name) renamed++;
  }

  const ids = projects.map(p => p.id);
  const archived = (await sql`
    UPDATE project_emoji SET archived_at = now()
    WHERE archived_at IS NULL AND NOT (project_id = ANY(${ids}::uuid[]))
    RETURNING project_id
  `) as any[];

  return { added, renamed, archived: archived.length, restored: 0 };
}
