"use client";

import { useState, useEffect } from 'react';
import QuickSalesPage from '../quick-sales/page';
import Segmented from '@/components/Segmented';

const WA_GROUPS = [
  { id: '120363213058937905@g.us', name: 'Abu Dhabi & Dubai properties', defaultOn: true },
  { id: '120363131158226499@g.us', name: 'Fliplux properties listing', defaultOn: true },
  { id: '120363243671933793@g.us', name: 'Blue One Properties', defaultOn: true },
  { id: '120363262055909265@g.us', name: 'AD Real Estate Availability', defaultOn: true },
  { id: '120363419032330817@g.us', name: '🆎 ALE + Rent', defaultOn: true },
  { id: '120363315978879330@g.us', name: '🏝️ Yas Island', defaultOn: false },
  { id: '120363180834286557@g.us', name: 'VIP Properties Abu Dhabi', defaultOn: true },
  { id: '120363023065348490@g.us', name: 'AD&D Realtors', defaultOn: true },
  { id: '120363179418473887@g.us', name: 'AUH Rent/Invest', defaultOn: true },
  { id: '120363425347743544@g.us', name: 'Abu Dhabi Off-Plan/Resale', defaultOn: true },
];

const convertRuToEn = (str: string) => {
  const ru = 'йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,';
  const en = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?';
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const idx = ru.indexOf(str[i]);
    res += idx !== -1 ? en[idx] : str[i];
  }
  return res;
};

function formatDateRu() {
  const now = new Date();
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const days = ['вс','пн','вт','ср','чт','пт','сб'];
  return `${now.getDate()} ${months[now.getMonth()]}, ${days[now.getDay()]}`;
}

function loadLocal(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('budget_checks');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLocal(c: Record<string, boolean>) {
  try { localStorage.setItem('budget_checks', JSON.stringify(c)); } catch {}
}

async function fetchChecked(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch('/api/tracker');
    const data = await res.json();
    return data.checked ?? {};
  } catch { return {}; }
}

async function persistChecked(c: Record<string, boolean>) {
  saveLocal(c);
  try {
    await fetch('/api/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: c }),
    });
  } catch {}
}

export default function BudgetPage() {
  const [mode, setMode] = useState<'budget' | 'quick'>('budget');
  const [copied, setCopied] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [project, setProject] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [enabledGroups, setEnabledGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(WA_GROUPS.map(g => [g.id, g.defaultOn]))
  );
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastQueued, setBroadcastQueued] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastTime, setBroadcastTime] = useState('');

  useEffect(() => {
    setChecked(loadLocal());
    fetchChecked().then(c => { setChecked(c); saveLocal(c); });
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { if (d.projects?.length) setProjects(d.projects); })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  const toggleCheck = (p: string, allProjects: string[]) => {
    const next = { ...checked, [p]: !checked[p] };
    const reset = allProjects.every(proj => next[proj]);
    const toSave = reset ? {} : next;
    setChecked(toSave);
    persistChecked(toSave);
  };

  const filteredProjects = projects.filter(p =>
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const handleParse = async () => {
    if (!project || !rawText) return alert('Select project and paste table');
    setLoading(true);
    try {
      const res = await fetch('/api/parse-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, projectName: project })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsedData(data);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    setEnabledGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const sendBroadcast = async () => {
    if (!parsedData?.text || !broadcastTime) return;
    const groups = WA_GROUPS.filter(g => enabledGroups[g.id]);
    if (!groups.length) return;
    setBroadcasting(true);
    setBroadcastQueued(false);
    setBroadcastError(null);
    try {
      const res = await fetch('/api/wa-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: parsedData.text, label: project, groups, startAt: broadcastTime }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setBroadcastQueued(true);
    } catch (e: any) {
      setBroadcastError(e.message);
    } finally {
      setBroadcasting(false);
    }
  };

  const isSunday = new Date().getDay() === 0;
  const activeGroups = WA_GROUPS.filter(g => enabledGroups[g.id]).length;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-5">
      {/* ── Шапка ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bb-rise">
        <div>
          <h1 className="bb-title text-[34px] leading-tight mb-1">Рассылки</h1>
          <p className="bb-sub text-sm">Две утренние рассылки: список Budget Units и Quick Sales.</p>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'budget', label: 'Budget Units', icon: '💰' },
            { value: 'quick', label: 'Quick Sales', icon: '⚡' },
          ] as const}
        />
      </div>

      {mode === 'quick' ? (
        <QuickSalesPage />
      ) : (
        <>
          {/* ── Трекер проектов ── */}
          <div className="bb-card p-6 bb-rise" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="bb-title text-[17px]">Расписание рассылки</span>
              <span className="bb-chip bb-chip-sky">{formatDateRu()}</span>
              {isSunday && <span className="bb-chip bb-chip-lemon">выходной</span>}
            </div>

            {projectsLoading ? (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--ink-500)' }}>
                <div
                  className="w-4 h-4 border-[3px] rounded-full animate-spin"
                  style={{ borderColor: 'var(--sky-200)', borderTopColor: 'var(--aqua-500)' }}
                />
                Загружаю проекты...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm py-2" style={{ color: 'var(--ink-500)' }}>Проекты не найдены</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projects.map((p, i) => {
                  const done = !!checked[p];
                  return (
                    <button
                      key={p}
                      onClick={() => toggleCheck(p, projects)}
                      className="bb-pop group flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-full
                                 text-[13px] font-bold select-none cursor-pointer
                                 transition-all duration-200 hover:-translate-y-0.5 active:scale-[.96]"
                      style={{
                        animationDelay: `${Math.min(i * 18, 400)}ms`,
                        background: done ? 'var(--mint)' : '#fff',
                        color: done ? '#075f3d' : 'var(--ink-700)',
                        boxShadow: done ? 'var(--lift-1)' : 'var(--lift-1)',
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-200"
                        style={{
                          background: done ? '#10b981' : 'var(--sky-100)',
                          transform: done ? 'scale(1)' : 'scale(.9)',
                        }}
                      >
                        {done && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={done ? 'line-through decoration-2' : ''}>{p}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Форма и превью ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <div className="bb-card p-6 space-y-5 bb-rise" style={{ animationDelay: '120ms' }}>
              <div className="relative">
                <label className="bb-label block mb-2">Проект</label>
                {projectsLoading ? (
                  <div className="bb-input flex items-center gap-2" style={{ color: 'var(--ink-500)' }}>
                    <div
                      className="w-4 h-4 border-[3px] rounded-full animate-spin"
                      style={{ borderColor: 'var(--sky-200)', borderTopColor: 'var(--aqua-500)' }}
                    />
                    Загружаю проекты...
                  </div>
                ) : projects.length > 0 ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={projectSearch}
                      onChange={e => { setProjectSearch(convertRuToEn(e.target.value)); setIsDropdownOpen(true); }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                      placeholder="Начни вводить название..."
                      className="bb-input pr-11"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg
                        className="w-4 h-4 transition-transform duration-200"
                        style={{ color: 'var(--ink-300)', transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isDropdownOpen && (
                      <div
                        className="bb-pop absolute z-50 w-full mt-2 max-h-60 overflow-y-auto p-1.5"
                        style={{ background: '#fff', borderRadius: 'var(--r-md)', boxShadow: 'var(--lift-3)' }}
                      >
                        {filteredProjects.length > 0 ? filteredProjects.map(p => (
                          <div
                            key={p}
                            onClick={() => { setProject(p); setProjectSearch(p); setIsDropdownOpen(false); }}
                            className="px-3 py-2.5 rounded-xl cursor-pointer text-sm font-semibold transition-colors duration-150"
                            style={{
                              background: project === p ? 'var(--sky-100)' : 'transparent',
                              color: project === p ? 'var(--aqua-600)' : 'var(--ink-700)',
                            }}
                            onMouseEnter={e => { if (project !== p) e.currentTarget.style.background = 'var(--sky-50)'; }}
                            onMouseLeave={e => { if (project !== p) e.currentTarget.style.background = 'transparent'; }}
                          >
                            {p}
                          </div>
                        )) : (
                          <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--ink-300)' }}>
                            Ничего не нашлось
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bb-input" style={{ background: 'var(--peach)', color: '#9f1239' }}>
                    Не удалось загрузить проекты
                  </div>
                )}
              </div>

              <div>
                <label className="bb-label block mb-2">Таблица целиком (TSV)</label>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  className="bb-input font-mono text-sm resize-y"
                  placeholder="Вставь сюда данные из таблицы..."
                />
              </div>

              <button
                onClick={handleParse}
                disabled={loading || !project}
                className="bb-btn bb-btn-primary w-full"
              >
                {loading ? 'Считаю...' : '✨ Собрать рассылку'}
              </button>
            </div>

            {parsedData && (
              <div className="bb-card p-6 bb-rise">
                <div className="flex items-center justify-between mb-4 gap-3">
                  <h3 className="bb-title text-[17px]">Текст для WhatsApp</h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(parsedData.text || '');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                    className="bb-btn bb-btn-ghost py-2 px-4 text-[13px]"
                    style={copied ? { background: 'var(--mint)', color: '#075f3d' } : undefined}
                  >
                    {copied ? '✓ Скопировано' : 'Копировать'}
                  </button>
                </div>

                <div
                  className="p-5 text-sm whitespace-pre-wrap overflow-auto max-h-[520px]"
                  style={{ background: 'var(--sky-50)', borderRadius: 'var(--r-md)', color: 'var(--ink-900)' }}
                >
                  {parsedData.text}
                </div>

                <div className="mt-3 text-xs text-right" style={{ color: 'var(--ink-300)' }}>
                  Выбрано {parsedData.selectedRows} юнитов из {parsedData.totalRows}
                </div>

                {/* ── Рассылка по группам ── */}
                <div className="mt-5 pt-5 space-y-3" style={{ borderTop: '2px solid var(--sky-50)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="bb-title text-[15px]">📤 Рассылка по группам</span>
                    <span className="bb-chip bb-chip-sky">{activeGroups} из {WA_GROUPS.length}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {WA_GROUPS.map(g => {
                      const on = !!enabledGroups[g.id];
                      return (
                        <button
                          key={g.id}
                          onClick={() => toggleGroup(g.id)}
                          disabled={broadcasting || broadcastQueued}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold
                                     select-none cursor-pointer transition-all duration-200
                                     hover:-translate-y-0.5 active:scale-[.96] disabled:opacity-50 disabled:pointer-events-none"
                          style={{
                            background: on ? 'var(--lilac)' : 'var(--sky-50)',
                            color: on ? '#5b21b6' : 'var(--ink-300)',
                          }}
                        >
                          {on ? '✓' : '○'} {g.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bb-label shrink-0">⏰ Старт (Дубай)</span>
                    <input
                      type="datetime-local"
                      value={broadcastTime}
                      onChange={e => { setBroadcastTime(e.target.value); setBroadcastQueued(false); }}
                      className="bb-input w-auto py-2 text-[13px] font-semibold"
                    />
                  </div>

                  {broadcastError && (
                    <div
                      className="bb-pop px-4 py-2.5 text-xs font-semibold"
                      style={{ background: 'var(--peach)', color: '#9f1239', borderRadius: 'var(--r-md)' }}
                    >
                      {broadcastError}
                    </div>
                  )}

                  {broadcastQueued && (
                    <div
                      className="bb-pop px-4 py-2.5 text-xs font-semibold"
                      style={{ background: 'var(--mint)', color: '#075f3d', borderRadius: 'var(--r-md)' }}
                    >
                      ✓ Добавлено в очередь. Группы получат сообщения с {broadcastTime.replace('T', ' ')} с интервалом 2 мин.
                      Смотри на странице <a href="/scheduled" className="underline">Расписание WA</a>.
                    </div>
                  )}

                  <button
                    onClick={sendBroadcast}
                    disabled={broadcasting || broadcastQueued || !broadcastTime || activeGroups === 0}
                    className="bb-btn bb-btn-ink w-full"
                  >
                    {broadcasting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Добавляю в очередь...
                      </>
                    ) : '📲 Добавить в очередь'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
