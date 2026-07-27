"use client";

import { useState, useEffect } from 'react';

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

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Budget Builder</h1>
        <p className="text-slate-400 text-sm">Paste your raw TSV table data to generate a budget plan.</p>
      </div>

      {/* ── TRACKER ── */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-visible">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent rounded-t-2xl" />

        <div className="flex items-center gap-3 mb-4">
          <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white">Расписание рассылки</span>
          <span className="text-slate-500 text-sm">{formatDateRu()}</span>
          {isSunday && (
            <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full px-2 py-0.5">
              выходной
            </span>
          )}
        </div>

        {projectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            Загрузка проектов...
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">Проекты не найдены</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {projects.map(p => {
              const done = !!checked[p];
              return (
                <button
                  key={p}
                  onClick={() => toggleCheck(p, projects)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all select-none
                    ${done
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-950/50 border-white/8 text-slate-300 hover:border-white/20 hover:text-white'
                    }`}
                >
                  <span className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all
                    ${done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}
                  >
                    {done && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className={done ? 'line-through decoration-emerald-600' : ''}>{p}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MAIN FORM ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-8">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

            <div className="space-y-6">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
                {projectsLoading ? (
                  <div className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-slate-500 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    Loading projects...
                  </div>
                ) : projects.length > 0 ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={projectSearch}
                      onChange={(e) => {
                        setProjectSearch(convertRuToEn(e.target.value));
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                      placeholder="Search project..."
                      className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all text-white placeholder-slate-500"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isDropdownOpen && (
                      <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-white/10 rounded-xl shadow-xl shadow-black/50 max-h-60 overflow-y-auto p-1 custom-scrollbar">
                        {filteredProjects.length > 0 ? filteredProjects.map(p => (
                          <div
                            key={p}
                            onClick={() => { setProject(p); setProjectSearch(p); setIsDropdownOpen(false); }}
                            className={`px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors
                              ${project === p ? 'bg-emerald-500/20 text-emerald-300 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                          >
                            {p}
                          </div>
                        )) : (
                          <div className="px-4 py-3 text-sm text-slate-500 text-center">No projects found</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                    Failed to load projects.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Paste Full Table (TSV)</label>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all text-white placeholder-slate-500 font-mono text-sm"
                  placeholder="Paste table data here..."
                />
              </div>

              <button
                onClick={handleParse}
                disabled={loading || !project}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? 'Calculating...' : 'Generate Budget'}
              </button>
            </div>
          </div>
        </div>

        {parsedData && (
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 backdrop-blur-md h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                WhatsApp text preview
              </h3>
              <button
                onClick={() => { navigator.clipboard.writeText(parsedData.text || ''); alert('Copied!'); }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors border border-white/10"
              >
                Copy text
              </button>
            </div>
            <div className="bg-[#f0fdf4] p-5 rounded-xl border border-emerald-100 text-sm font-sans whitespace-pre-wrap text-[#166534] overflow-auto max-h-[600px] custom-scrollbar shadow-inner">
              {parsedData.text}
            </div>
            <div className="mt-4 text-xs text-slate-500 text-right">
              Selected {parsedData.selectedRows} units out of {parsedData.totalRows} parsed.
            </div>

            {/* ── WA BROADCAST ── */}
            <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">📤 Рассылка по группам</span>
                <span className="text-xs text-slate-500">{WA_GROUPS.filter(g => enabledGroups[g.id]).length} из {WA_GROUPS.length}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {WA_GROUPS.map(g => {
                  const on = !!enabledGroups[g.id];
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      disabled={broadcasting || broadcastQueued}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all select-none
                        ${on
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                          : 'bg-slate-950/50 border-white/8 text-slate-500 hover:text-slate-300'}`}
                    >
                      {on ? '✓' : '○'} {g.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">⏰ Время старта (Дубай):</span>
                <input
                  type="datetime-local"
                  value={broadcastTime}
                  onChange={e => { setBroadcastTime(e.target.value); setBroadcastQueued(false); }}
                  className="px-2 py-1.5 bg-slate-950/50 border border-white/10 rounded-lg text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500/50 [color-scheme:dark]"
                />
              </div>

              {broadcastError && (
                <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  {broadcastError}
                </div>
              )}

              {broadcastQueued && (
                <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                  ✓ Добавлено в очередь. Группы получат сообщения начиная с {broadcastTime.replace('T', ' ')} с интервалом 2 мин. Смотри на странице <a href="/scheduled" className="underline">WA Schedule</a>.
                </div>
              )}

              <button
                onClick={sendBroadcast}
                disabled={broadcasting || broadcastQueued || !broadcastTime || WA_GROUPS.filter(g => enabledGroups[g.id]).length === 0}
                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
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
    </div>
  );
}
