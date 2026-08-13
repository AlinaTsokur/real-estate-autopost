import { NextResponse } from 'next/server';
import {
  listProjectMeta,
  listActiveProjectNames,
  setProjectEmoji,
  setPhotosFolderUrl,
  listMediaAliases,
  saveMediaAlias,
  deleteMediaAlias,
} from '@/lib/post-meta/emoji';

export const dynamic = 'force-dynamic';

// GET            → проекты (смайлик + папка с фото) и старые названия из листа
// GET ?names=1   → только названия активных проектов, для трекера рассылки
export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('names')) {
      return NextResponse.json({ names: await listActiveProjectNames() });
    }
    const [projects, aliases] = await Promise.all([listProjectMeta(), listMediaAliases()]);
    return NextResponse.json({ projects, aliases });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { projectId, emoji } | { projectId, photosFolderUrl } | { alias, folderUrl }
// | { deleteAlias }
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.deleteAlias) {
      await deleteMediaAlias(body.deleteAlias);
      return NextResponse.json({ ok: true });
    }

    if (body.alias) {
      await saveMediaAlias(body.alias, body.folderUrl || '');
      return NextResponse.json({ ok: true });
    }

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
