import { NextResponse } from 'next/server';
import { listAbuDhabiProjects, searchUnits, getRawUnit } from '@/lib/units-db/units';
import { mapRawUnitToPostData } from '@/lib/units-db/map';
import { getProjectMeta } from '@/lib/post-meta/emoji';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // ?projects=1 → project dropdown (Abu Dhabi, live)
    if (url.searchParams.get('projects')) {
      return NextResponse.json({ projects: await listAbuDhabiProjects() });
    }

    // ?id=<uuid> → full mapped post for one unit
    const id = url.searchParams.get('id');
    if (id) {
      const raw = await getRawUnit(id);
      if (!raw) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
      const meta = await getProjectMeta(raw.project_id);
      const post = mapRawUnitToPostData(raw, meta?.emoji || '');
      return NextResponse.json({
        post,
        projectId: raw.project_id,
        projectName: raw.project_name,
        emojiMissing: !meta?.emoji,
      });
    }

    // ?q=<code or name> [&projectId=<uuid>] → search results
    const q = url.searchParams.get('q') || '';
    const projectId = url.searchParams.get('projectId') || undefined;
    if (q || projectId) {
      return NextResponse.json({ results: await searchUnits(q, projectId) });
    }

    return NextResponse.json({ error: 'Provide projects=1, id=, or q=' }, { status: 400 });
  } catch (e: any) {
    console.error('unit-from-db error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
