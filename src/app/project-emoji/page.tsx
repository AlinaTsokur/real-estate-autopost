"use client";

import { useEffect, useState } from 'react';

interface Row { projectId: string; projectName: string; emoji: string; island: string; }

export default function ProjectEmojiPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Save on blur (no per-row button — compact)
  const save = async (row: Row) => {
    await fetch('/api/project-emoji', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: row.projectId, projectName: row.projectName, emoji: row.emoji }),
    });
    setSavedId(row.projectId);
    setTimeout(() => setSavedId(id => id === row.projectId ? null : id), 1200);
  };

  const missing = rows.filter(r => !r.emoji).length;

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold  tracking-tight" style={{ color: 'var(--ink-900)' }}>🎨 Смайлики проектов</h1>
        <span className="text-xs text-slate-500">{rows.length} проектов</span>
        {!loading && missing > 0 && (
          <span className="bg-amber-500/20 text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">{missing} без смайлика</span>
        )}
        <button onClick={load} className="ml-auto bg-slate-800 hover:bg-slate-700 text-white text-xs py-1 px-2.5 rounded-lg border border-white/10">🔄</button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Загрузка…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {rows.map(row => (
            <div key={row.projectId} className={`flex items-center gap-2 px-2 py-1 rounded-lg ${!row.emoji ? 'bg-amber-500/5' : 'hover:bg-white/5'}`}>
              <input
                value={row.emoji}
                onChange={e => setEmoji(row.projectId, e.target.value)}
                onBlur={() => save(row)}
                placeholder="—"
                className={`w-9 shrink-0 px-1 py-1 bg-slate-950/50 border rounded-md text-center text-base outline-none focus:ring-2 focus:ring-indigo-500/50 ${savedId === row.projectId ? 'border-emerald-500' : 'border-white/10'}`}
              />
              <span className="text-sm text-slate-300 truncate" title={row.projectName}>{row.projectName || '(без имени)'}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-slate-500 text-xs mt-4">Смайлик сохраняется автоматически когда убираешь курсор из поля. Новые проекты появляются здесь раз в день.</p>
    </div>
  );
}
