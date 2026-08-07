"use client";

import { useEffect, useState } from 'react';

interface Row { projectId: string; projectName: string; emoji: string; island: string; }

export default function ProjectEmojiPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/project-emoji')
      .then(r => r.json())
      .then(d => setRows(d.projects || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setEmoji = (id: string, emoji: string) =>
    setRows(rs => rs.map(r => r.projectId === id ? { ...r, emoji } : r));

  const save = async (row: Row) => {
    setSavingId(row.projectId);
    try {
      await fetch('/api/project-emoji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: row.projectId, projectName: row.projectName, emoji: row.emoji }),
      });
      setSavedId(row.projectId);
      setTimeout(() => setSavedId(null), 1500);
    } finally {
      setSavingId(null);
    }
  };

  const missing = rows.filter(r => !r.emoji).length;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white tracking-tight">🎨 Смайлики проектов</h1>
        {!loading && missing > 0 && (
          <span className="bg-amber-500/20 text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
            {missing} без смайлика
          </span>
        )}
        <button onClick={load} className="ml-auto bg-slate-800 hover:bg-slate-700 text-white text-sm py-1.5 px-3 rounded-lg border border-white/10">🔄</button>
      </div>
      <p className="text-slate-400 text-sm mb-5">Смайлик подставляется в шапку поста по проекту. Новые проекты появляются здесь автоматически (раз в день) с пустым смайликом.</p>

      {loading ? (
        <div className="text-slate-500 text-sm">Загрузка…</div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl divide-y divide-white/5">
          {rows.map(row => (
            <div key={row.projectId} className={`flex items-center gap-3 px-4 py-2.5 ${!row.emoji ? 'bg-amber-500/5' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{row.projectName || '(без имени)'}{!row.emoji && <span className="text-amber-400 text-xs ml-2">⚠️ пусто</span>}</div>
              </div>
              <input
                value={row.emoji}
                onChange={e => setEmoji(row.projectId, e.target.value)}
                placeholder="🌿"
                className="w-16 px-2 py-1.5 bg-slate-950/50 border border-white/10 rounded-lg text-center text-lg outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                onClick={() => save(row)}
                disabled={savingId === row.projectId}
                className="text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 shrink-0"
              >
                {savingId === row.projectId ? '…' : savedId === row.projectId ? '✓' : 'Сохранить'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
