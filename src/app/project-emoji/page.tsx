"use client";

import { useCallback, useEffect, useState } from 'react';

/* Проекты: смайлик для постов и папка Drive с фотографиями. Список приезжает
   из базы разработчиков ночной синхронизацией — руками сюда ничего не заводят,
   у новых проектов просто подсвечена пустая папка. */

interface Row {
  projectId: string;
  projectName: string;
  emoji: string;
  island: string;
  photosFolderUrl: string;
}

interface Alias {
  nameKey: string;
  name: string;
  folderUrl: string;
}

const isFolderUrl = (v: string) => !v || /\/folders\/[a-zA-Z0-9_-]+|[?&]id=[a-zA-Z0-9_-]+/.test(v);

export default function ProjectsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await (await fetch('/api/project-emoji')).json();
      setRows(d.projects || []);
      setAliases(d.aliases || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  // Обновить список, не дожидаясь ночной синхронизации.
  const sync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/project-sync');
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const flash = (id: string) => {
    setSavedId(id);
    setTimeout(() => setSavedId(cur => (cur === id ? null : cur)), 1400);
  };

  const patch = (id: string, part: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.projectId === id ? { ...r, ...part } : r)));

  const save = async (row: Row, body: Record<string, unknown>) => {
    await fetch('/api/project-emoji', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: row.projectId, projectName: row.projectName, ...body }),
    });
    flash(row.projectId);
  };

  const saveAlias = async (a: Alias) => {
    await fetch('/api/project-emoji', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: a.name, folderUrl: a.folderUrl }),
    });
    flash(a.nameKey);
  };

  const dropAlias = async (a: Alias) => {
    setAliases(list => list.filter(x => x.nameKey !== a.nameKey));
    await fetch('/api/project-emoji', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteAlias: a.nameKey }),
    });
  };

  const noFolder = rows.filter(r => !r.photosFolderUrl);
  const noEmoji = rows.filter(r => !r.emoji).length;

  const row = (r: Row) => (
    <div
      key={r.projectId}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bb-hover-soft"
      style={!r.photosFolderUrl ? { background: 'var(--lemon)' } : undefined}
    >
      <input
        value={r.emoji}
        onChange={e => patch(r.projectId, { emoji: e.target.value })}
        onBlur={() => save(r, { emoji: r.emoji })}
        placeholder="—"
        title="Смайлик проекта"
        className="w-9 shrink-0 px-1 py-1 bb-surface-soft border bb-edge rounded-md text-center text-base outline-none focus:ring-2 focus:bb-ring"
      />
      <span className="text-sm bb-ink-2 truncate w-44 shrink-0" title={r.projectName}>
        {r.projectName || '(без имени)'}
      </span>
      <input
        value={r.photosFolderUrl}
        onChange={e => patch(r.projectId, { photosFolderUrl: e.target.value })}
        onBlur={() => save(r, { photosFolderUrl: r.photosFolderUrl })}
        placeholder="создай папку с фото и вставь ссылку"
        title="Ссылка на папку Drive с фотографиями проекта"
        className="flex-1 min-w-0 px-2 py-1 bb-surface-soft border bb-edge rounded-md text-xs bb-ink outline-none focus:ring-2 focus:bb-ring"
        style={!isFolderUrl(r.photosFolderUrl) ? { background: 'var(--peach)' } : undefined}
      />
      {r.photosFolderUrl && isFolderUrl(r.photosFolderUrl) && (
        <a
          href={r.photosFolderUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs shrink-0"
          title="Открыть папку"
        >
          ↗
        </a>
      )}
      <span className="w-4 shrink-0 text-xs bb-ok">{savedId === r.projectId ? '✓' : ''}</span>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto w-full space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="bb-title text-[22px]">🎨 Проекты</h1>
        <span className="bb-chip bb-chip-sky">{rows.length} проектов</span>
        {!loading && noFolder.length > 0 && (
          <span className="bb-chip bb-chip-lemon">{noFolder.length} без папки с фото</span>
        )}
        {!loading && noEmoji > 0 && <span className="bb-chip bb-chip-peach">{noEmoji} без смайлика</span>}
        <button onClick={sync} disabled={syncing} className="ml-auto bb-btn bb-btn-ghost text-xs">
          {syncing ? 'Обновляю…' : '🔄 Обновить список'}
        </button>
      </div>

      {loading ? (
        <div className="bb-sub text-sm">Загрузка…</div>
      ) : (
        <>
          {noFolder.length > 0 && (
            <div className="bb-card p-4 space-y-1">
              <div className="bb-label mb-1.5">Нужна папка с фото</div>
              {noFolder.map(row)}
            </div>
          )}

          <div className="bb-card p-4 space-y-1">
            <div className="bb-label mb-1.5">Все проекты</div>
            {rows.map(row)}
          </div>

          {aliases.length > 0 && (
            <div className="bb-card p-4 space-y-1">
              <div className="bb-label mb-1.5">Старые названия из таблицы</div>
              <p className="bb-sub text-xs mb-2">
                Проекта с таким именем в базе нет — эти строки нужны постам, собранным вставкой
                текста по названию корпуса. Можно удалить, если больше не пользуетесь.
              </p>
              {aliases.map(a => (
                <div key={a.nameKey} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bb-hover-soft">
                  <span className="text-sm bb-ink-2 truncate w-44 shrink-0" title={a.name}>
                    {a.name}
                  </span>
                  <input
                    value={a.folderUrl}
                    onChange={e =>
                      setAliases(list =>
                        list.map(x => (x.nameKey === a.nameKey ? { ...x, folderUrl: e.target.value } : x)),
                      )
                    }
                    onBlur={() => saveAlias(a)}
                    className="flex-1 min-w-0 px-2 py-1 bb-surface-soft border bb-edge rounded-md text-xs bb-ink outline-none focus:ring-2 focus:bb-ring"
                  />
                  <button
                    onClick={() => dropAlias(a)}
                    className="text-xs shrink-0 bb-bad"
                    title="Удалить строку"
                  >
                    ✕
                  </button>
                  <span className="w-4 shrink-0 text-xs bb-ok">{savedId === a.nameKey ? '✓' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="bb-sub text-xs">
        Сохраняется автоматически, когда убираешь курсор из поля. Новые проекты появляются здесь
        сами: раз в день из базы или сразу по кнопке «Обновить список».
      </p>
    </div>
  );
}
