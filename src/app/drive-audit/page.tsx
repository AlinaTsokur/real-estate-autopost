"use client";

import { useState } from 'react';
import type { AuditRow } from '@/app/api/audit/drive-folders/route';

const EXPECTED_LABEL: Record<string, string> = {
  search:  'Активный листинг',
  sold:    'Продано',
  removed: 'Снято с продажи',
};

const STATUS_STYLE: Record<string, string> = {
  ok:             'text-emerald-400',
  wrong:          'text-rose-400',
  not_found:      'text-amber-400',
  config_missing: 'text-slate-400',
};

const STATUS_LABEL: Record<string, string> = {
  ok:             '✓ На месте',
  wrong:          '✗ Не там',
  not_found:      '⚠ Не найдена',
  config_missing: '— Нет конфига',
};

export default function DriveAuditPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    rows: AuditRow[];
    total: number;
    ok: number;
    wrong: number;
    missing: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'wrong' | 'ok'>('all');

  const run = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/audit/drive-folders');
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const visible = result
    ? result.rows.filter(r =>
        filter === 'all'   ? true :
        filter === 'wrong' ? r.status !== 'ok' :
                             r.status === 'ok'
      )
    : [];

  return (
    <div className="max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Drive Folder Audit</h1>
        <p className="text-slate-400 text-sm">
          Проверяет что все папки юнитов находятся в правильном месте согласно статусу в Abu Dhabi.
        </p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {running ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Проверяю...
            </>
          ) : '🔍 Запустить проверку'}
        </button>
        {running && (
          <p className="text-slate-400 text-sm">Это может занять несколько минут — проверяем каждую папку в Drive</p>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-6">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Всего проверено', value: result.total, color: 'text-white' },
              { label: 'На месте',        value: result.ok,    color: 'text-emerald-400' },
              { label: 'Не там',          value: result.wrong, color: 'text-rose-400' },
              { label: 'Не найдено',      value: result.missing, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 text-center">
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {(['all', 'wrong', 'ok'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 border border-white/10 hover:text-white hover:bg-white/5'
                }`}
              >
                {f === 'all' ? 'Все' : f === 'wrong' ? 'Проблемные' : 'ОК'}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-slate-900/60 border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Строка</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Код</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Юнит</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Комментарий</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Должна быть</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Сейчас в</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr
                    key={row.rowNum}
                    className={`border-b border-white/[0.04] ${i % 2 === 0 ? '' : 'bg-white/[0.01]'} ${
                      row.status === 'wrong' ? 'bg-rose-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-slate-500">{row.rowNum}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      <a
                        href={`https://drive.google.com/drive/folders/${row.unitFolderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-indigo-300 transition-colors"
                      >
                        {row.code}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[180px] truncate" title={row.folderName || row.unit}>
                      {row.folderName || row.unit}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{row.comment || '—'}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{EXPECTED_LABEL[row.expected]}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.actualParentName ? (
                        <a
                          href={`https://drive.google.com/drive/folders/${row.actualParentId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-300 hover:text-indigo-300 transition-colors"
                        >
                          {row.actualParentName}
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${STATUS_STYLE[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.detail && row.status === 'wrong' && (
                        <p className="text-[10px] text-slate-500 mt-0.5 max-w-[200px]">{row.detail}</p>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {filter === 'wrong' ? 'Все папки на своих местах 🎉' : 'Нет данных'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
