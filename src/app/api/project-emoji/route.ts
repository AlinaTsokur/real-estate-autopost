import { NextResponse } from 'next/server';
import { listProjectMeta, setProjectEmoji } from '@/lib/post-meta/emoji';

export const dynamic = 'force-dynamic';

// GET → all project emoji rows (for the management page)
export async function GET() {
  try {
    return NextResponse.json({ projects: await listProjectMeta() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { projectId, projectName, emoji } → save/update one project's emoji
export async function POST(request: Request) {
  try {
    const { projectId, projectName, emoji } = await request.json();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    await setProjectEmoji(projectId, projectName || '', emoji || '');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
