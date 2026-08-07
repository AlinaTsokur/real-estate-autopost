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

// Daily sync: make sure every source project has a row. New projects get an
// empty emoji (to be filled later); existing rows keep their emoji untouched.
export async function syncProjectStubs(projects: { id: string; name: string }[]): Promise<number> {
  let added = 0;
  for (const p of projects) {
    const res = (await sql`
      INSERT INTO project_emoji (project_id, project_name)
      VALUES (${p.id}, ${p.name})
      ON CONFLICT (project_id) DO UPDATE SET project_name = EXCLUDED.project_name
      RETURNING (xmax = 0) AS inserted
    `) as any[];
    if (res[0]?.inserted) added++;
  }
  return added;
}
