import { NextResponse } from 'next/server';
import { listAllAbuDhabiProjects } from '@/lib/units-db/units';
import { syncProjectStubs } from '@/lib/post-meta/emoji';

export const dynamic = 'force-dynamic';

// Daily: pull the Abu Dhabi project list from the IT team's DB (read-only) and
// make sure each one has a row in our project_emoji. New projects appear with an
// empty emoji so they can be filled in; existing emojis are never touched.
export async function GET() {
  try {
    const projects = await listAllAbuDhabiProjects();
    const stats = await syncProjectStubs(projects);
    return NextResponse.json({ ok: true, total: projects.length, ...stats, ranAt: new Date().toISOString() });
  } catch (e: any) {
    console.error('project-sync error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
