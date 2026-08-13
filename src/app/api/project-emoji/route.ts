import { NextResponse } from 'next/server';
import {
  listProjectMeta,
  listActiveProjectNames,
  setProjectEmoji,
  setPhotosFolderUrl,
} from '@/lib/post-meta/emoji';

export const dynamic = 'force-dynamic';

// GET            → проекты: смайлик и папка с фото
// GET ?names=1   → только названия активных проектов, для трекера рассылки
export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('names')) {
      return NextResponse.json({ names: await listActiveProjectNames() });
    }
    return NextResponse.json({ projects: await listProjectMeta() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { projectId, emoji } | { projectId, photosFolderUrl }
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    if (body.photosFolderUrl !== undefined) {
      await setPhotosFolderUrl(body.projectId, body.photosFolderUrl || '');
    }
    if (body.emoji !== undefined) {
      await setProjectEmoji(body.projectId, body.projectName || '', body.emoji || '');
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
