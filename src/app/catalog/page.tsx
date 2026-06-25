"use client";

import { useState, useEffect, useCallback } from 'react';

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

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1VufwiqgAPjX1LhmWYuiBDUgFY4SobjV3gnBiLNYKmkw/edit#gid=0';

type CatalogItem = {
  'home_listing_id': string;
  'name': string;
  'description': string;
  'price': string;
  'image[0].url': string;
  'image[1].url': string;
  'property_type': string;
  'num_beds': string;
  'area_size': string;
  'address.addr1': string;
};

export default function CatalogPage() {
  const [tab, setTab] = useState<'add' | 'manage'>('add');

  // Add tab state
  const [projects, setProjects] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [project, setProject] = useState('');
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedRows, setSavedRows] = useState<any[]>([]);
  const [coverInputs, setCoverInputs] = useState<Record<string, string>>({});
  const [coverSaving, setCoverSaving] = useState<Record<string, boolean>>({});
  const [coverSaved, setCoverSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  // Manage tab state
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [manageCovers, setManageCovers] = useState<Record<string, string>>({});
  const [manageSaving, setManageSaving] = useState<Record<string, boolean>>({});
  const [manageSaved, setManageSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { if (d.projects?.length) setProjects(d.projects); })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await fetch('/api/catalog-items');
      const data = await res.json();
      setItems(data.rows || []);
    } catch {} finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'manage') loadItems();
  }, [tab, loadItems]);

  const handleSave = async () => {
    if (!project || !rawText) return;
    setSaving(true);
    setError('');
    setSavedRows([]);
    try {
      const res = await fetch('/api/catalog-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, projectName: project }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedRows(data.rows || []);
      setRawText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveCover = async (id: string, url: string, source: 'add' | 'manage') => {
    if (!url.trim()) return;
    const setSavingFn = source === 'add' ? setCoverSaving : setManageSaving;
    const setSavedFn = source === 'add' ? setCoverSaved : setManageSaved;
    setSavingFn(p => ({ ...p, [id]: true }));
    try {
      await fetch('/api/catalog-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, imageUrl: url }),
      });
      setSavedFn(p => ({ ...p, [id]: true }));
      setTimeout(() => setSavedFn(p => ({ ...p, [id]: false })), 2000);
    } catch {} finally {
      setSavingFn(p => ({ ...p, [id]: false }));
    }
  };

  const filteredProjects = projects.filter(p =>
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const typeColor = (pt: string) => {
    const t = (pt || '').toLowerCase();
    if (t === 'apartment') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    if (t === 'house') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (t === 'townhouse') return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Catalog Builder</h1>
        <p className="text-slate-400 text-sm">Build your WhatsApp catalog for Meta Commerce Manager.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-900/60 border border-white/5 rounded-xl w-fit">
        {(['add', 'manage'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
            {t === 'add' ? '+ Add Units' : '📋 Manage Catalog'}
          </button>
        ))}
        <a href={SHEET_URL} target="_blank" rel="noopener noreferrer"
          className="ml-2 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 transition-all flex items-center gap-1.5">
          Open CATALOG Sheet ↗
        </a>
      </div>

      {/* ── ADD TAB ── */}
      {tab === 'add' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
            <div className="space-y-6">
              {/* Project selector */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
                {projectsLoading ? (
                  <div className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-slate-500 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    Loading projects...
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" value={projectSearch}
                      onChange={e => { setProjectSearch(convertRuToEn(e.target.value)); setIsDropdownOpen(true); }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                      placeholder="Search project..."
                      className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-500"
                    />
                    {isDropdownOpen && (
                      <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-white/10 rounded-xl shadow-xl shadow-black/50 max-h-60 overflow-y-auto p-1">
                        {filteredProjects.length > 0 ? filteredProjects.map(p => (
                          <div key={p} onClick={() => { setProject(p); setProjectSearch(p); setIsDropdownOpen(false); }}
                            className={`px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${project === p ? 'bg-indigo-500/20 text-indigo-300 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                            {p}
                          </div>
                        )) : <div className="px-4 py-3 text-sm text-slate-500 text-center">No projects found</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Table paste */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Paste Full Table (TSV)</label>
                <textarea rows={8} value={rawText} onChange={e => setRawText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-500 font-mono text-sm"
                  placeholder="Paste table data here (all unit types at once)..." />
              </div>

              {error && (
                <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">{error}</div>
              )}

              <button onClick={handleSave} disabled={saving || !project || !rawText}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                {saving ? 'Parsing & Saving...' : 'Parse & Save to CATALOG'}
              </button>
            </div>
          </div>

          {/* Preview */}
          {savedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold text-white">{savedRows.length} units saved to CATALOG</span>
                <span className="text-xs text-slate-500">Add cover image URLs below</span>
              </div>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {savedRows.map((row: any) => (
                  <div key={row.home_listing_id} className="p-4 rounded-xl bg-slate-900/60 border border-white/5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-slate-500">{row.home_listing_id}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor(row.property_type)}`}>
                            {row.property_type}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white leading-tight">{row.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{row.description}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400 whitespace-nowrap">{row.price}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <input type="text" placeholder="Cover image URL (image[0].url)"
                        value={coverInputs[row.home_listing_id] || ''}
                        onChange={e => setCoverInputs(p => ({ ...p, [row.home_listing_id]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 bg-slate-950/50 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500/50"
                      />
                      <button
                        onClick={() => saveCover(row.home_listing_id, coverInputs[row.home_listing_id] || '', 'add')}
                        disabled={coverSaving[row.home_listing_id] || !coverInputs[row.home_listing_id]}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${coverSaved[row.home_listing_id] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-indigo-600/80 hover:bg-indigo-500 text-white disabled:opacity-40'}`}>
                        {coverSaved[row.home_listing_id] ? '✓' : coverSaving[row.home_listing_id] ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MANAGE TAB ── */}
      {tab === 'manage' && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
          {itemsLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              Loading catalog...
            </div>
          ) : items.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No items in catalog yet. Add units first.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-white">{items.length} units in CATALOG</span>
                <button onClick={loadItems} className="text-xs text-slate-400 hover:text-white transition-colors">↻ Refresh</button>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {items.map(item => (
                  <div key={item['home_listing_id']} className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                    <div className="flex items-start gap-3">
                      {item['image[0].url'] ? (
                        <img src={item['image[0].url']} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-white/10" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-800 border border-white/5 flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-600 text-xs">no img</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-slate-500">{item['home_listing_id']}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor(item['property_type'])}`}>
                            {item['property_type']}
                          </span>
                          <span className="text-xs text-slate-500">{item['address.addr1']}</span>
                        </div>
                        <p className="text-sm font-medium text-white leading-tight truncate">{item['name']}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">{item['price']}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <input type="text" placeholder="Cover image URL"
                        defaultValue={item['image[0].url']}
                        onChange={e => setManageCovers(p => ({ ...p, [item['home_listing_id']]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 bg-slate-950/50 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500/50"
                      />
                      <button
                        onClick={() => saveCover(item['home_listing_id'], manageCovers[item['home_listing_id']] ?? item['image[0].url'], 'manage')}
                        disabled={manageSaving[item['home_listing_id']]}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${manageSaved[item['home_listing_id']] ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-indigo-600/80 hover:bg-indigo-500 text-white disabled:opacity-40'}`}>
                        {manageSaved[item['home_listing_id']] ? '✓' : manageSaving[item['home_listing_id']] ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
