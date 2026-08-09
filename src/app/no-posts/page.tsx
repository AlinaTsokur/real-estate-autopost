"use client";

import { useEffect, useState } from 'react';

interface U { code: string; unitNumber: string; project: string; }

export default function NoPostsPage() {
  const [units, setUnits] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/unit-from-db?nopost=1')
      .then(r => r.json())
      .then(d => setUnits(d.units || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // group by project
  const groups: Record<string, U[]> = {};
  for (const u of units) (groups[u.project] ||= []).push(u);
  const projectNames = Object.keys(groups).sort();

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--ink-900)' }}>📝 Юниты без постов</h1>
        {!loading && <span className="bb-tint-bad bb-bad text-xs font-semibold px-2 py-0.5 rounded-full border bb-edge">{units.length}</span>}
        <button onClick={load} className="ml-auto bb-surface-soft hover:bb-surface-soft bb-ink text-xs py-1 px-2.5 rounded-lg border bb-edge">🔄</button>
      </div>
      <p className="bb-ink-3 text-xs mb-4">Доступные юниты Абу-Даби, по которым ещё не делали пост (нет даты первого объявления). Данные вживую из базы.</p>

      {loading ? (
        <div className="bb-ink-4 text-sm">Загрузка…</div>
      ) : units.length === 0 ? (
        <div className="bb-ok text-sm">🎉 По всем доступным юнитам посты сделаны.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          {projectNames.map(proj => (
            <div key={proj} className="min-w-0">
              <div className="flex items-baseline gap-2 mb-1 border-b bb-edge pb-1">
                <span className="text-sm font-semibold bb-ink truncate">{proj}</span>
                <span className="text-xs bb-ink-4">{groups[proj].length}</span>
              </div>
              <div className="space-y-0.5">
                {groups[proj].map(u => (
                  <div key={u.code} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="font-mono bb-accent shrink-0">{u.code}</span>
                    <span className="bb-ink-3 truncate" title={u.unitNumber}>{u.unitNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
