"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

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

type PreviewRow = {
  home_listing_id: string;
  name: string;
  description: string;
  price: string;
  image0: string;
  property_type: string;
  num_beds: string;
  area_size: string;
  address_addr1: string;
  construction_status: string;
  [key: string]: string;
};

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

function CoverDropZone({ listingId, existingUrl, onUploaded }: {
  listingId: string;
  existingUrl?: string;
  onUploaded: (url: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(existingUrl || '');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('listingId', listingId);
    try {
      const res = await fetch('/api/catalog-cover-upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreview(data.url);
      onUploaded(data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) upload(file);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative mt-3 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden
        ${dragging ? 'border-indigo-400 bg-indigo-500/10' : preview ? 'border-white/10 bg-slate-950/30' : 'border-white/10 hover:border-indigo-500/40 bg-slate-950/30 hover:bg-indigo-500/5'}`}
      style={{ height: preview ? 80 : 52 }}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />

      {uploading ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-400">
          <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Uploading...
        </div>
      ) : preview ? (
        <div className="absolute inset-0 flex items-center gap-3 px-3">
          <img src={preview} alt="cover" className="h-14 w-14 object-cover rounded-lg border border-white/10 flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-400 font-medium">Cover uploaded ✓</p>
            <p className="text-[10px] text-slate-500">Drag new image to replace</p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-500">
          <span className="text-base">🖼</span>
          Drag cover image here or click to upload
        </div>
      )}

      {error && (
        <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-rose-500/20 text-rose-400 text-[10px] text-center">{error}</div>
      )}
    </div>
  );
}

const typeColor = (pt: string) => {
  const t = (pt || '').toLowerCase();
  if (t === 'apartment') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (t === 'house') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (t === 'townhouse') return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
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

  // Step: 'input' → 'preview' → 'saved'
  const [step, setStep] = useState<'input' | 'preview' | 'saved'>('input');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [savedRows, setSavedRows] = useState<PreviewRow[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  // Manage tab state
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [manageCovers, setManageCovers] = useState<Record<string, string>>({});

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
      const rows = data.rows || [];
      setItems(rows);
      const covers: Record<string, string> = {};
      rows.forEach((r: CatalogItem) => { if (r['image[0].url']) covers[r['home_listing_id']] = r['image[0].url']; });
      setManageCovers(covers);
    } catch {} finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'manage') loadItems();
  }, [tab, loadItems]);

  const handleParse = async () => {
    if (!project || !rawText) return;
    setParsing(true);
    setError('');
    try {
      const res = await fetch('/api/catalog-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, projectName: project }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreviewRows(data.rows || []);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/catalog-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: previewRows }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedRows(previewRows);
      setStep('saved');
      setRawText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );

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
        <div className="space-y-6">

          {/* STEP 1: Input */}
          {step === 'input' && (
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden max-w-2xl">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              <div className="space-y-6">
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

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Paste Full Table (TSV)</label>
                  <textarea rows={8} value={rawText} onChange={e => setRawText(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-500 font-mono text-sm"
                    placeholder="Paste table data here (all unit types at once)..." />
                </div>

                {error && (
                  <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">{error}</div>
                )}

                <button onClick={handleParse} disabled={parsing || !project || !rawText}
                  className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                  {parsing ? 'Parsing...' : 'Parse →'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Preview & Edit */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setStep('input'); setError(''); }}
                    className="text-sm text-slate-400 hover:text-white transition-colors">← Back</button>
                  <span className="text-sm font-semibold text-white">{previewRows.length} types found — edit if needed</span>
                </div>
                <button onClick={handleSave} disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-all disabled:opacity-50">
                  {saving ? 'Saving...' : '✓ Save to CATALOG'}
                </button>
              </div>

              {error && (
                <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">{error}</div>
              )}

              <div className="space-y-4">
                {previewRows.map((row, idx) => (
                  <div key={row.home_listing_id} className="p-5 rounded-2xl bg-slate-900/60 border border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor(row.property_type)}`}>
                        {row.property_type}
                      </span>
                      <span className="text-xs font-mono text-slate-500">{row.home_listing_id}</span>
                      <span className="text-xs text-emerald-400 ml-auto">{row.price}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                        <input
                          value={row.name}
                          onChange={e => setPreviewRows(rows => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                          className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                        <textarea
                          rows={7}
                          value={row.description}
                          onChange={e => setPreviewRows(rows => rows.map((r, i) => i === idx ? { ...r, description: e.target.value } : r))}
                          className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 font-mono resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleSave} disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-xl transition-all disabled:opacity-50">
                  {saving ? 'Saving...' : '✓ Save to CATALOG'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Saved — add covers */}
          {step === 'saved' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-semibold text-white">{savedRows.length} types saved</span>
                  <span className="text-xs text-slate-500">Add cover images below</span>
                </div>
                <button onClick={() => { setStep('input'); setSavedRows([]); setCoverUrls({}); setProject(''); setProjectSearch(''); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors">+ Add another project</button>
              </div>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {savedRows.map((row) => (
                  <div key={row.home_listing_id} className="p-4 rounded-xl bg-slate-900/60 border border-white/5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor(row.property_type)}`}>
                            {row.property_type}
                          </span>
                          <span className="text-xs font-mono text-slate-500">{row.home_listing_id}</span>
                        </div>
                        <p className="text-sm font-medium text-white leading-tight">{row.name}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400 whitespace-nowrap">{row.price}</span>
                    </div>
                    <CoverDropZone
                      listingId={row.home_listing_id}
                      existingUrl={coverUrls[row.home_listing_id]}
                      onUploaded={url => setCoverUrls(p => ({ ...p, [row.home_listing_id]: url }))}
                    />
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
            <p className="text-slate-500 text-sm py-8 text-center">No items in catalog yet.</p>
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
                      {(manageCovers[item['home_listing_id']] || item['image[0].url']) ? (
                        <img src={manageCovers[item['home_listing_id']] || item['image[0].url']} alt=""
                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-white/10"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-800 border border-white/5 flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-600 text-xs">no img</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor(item['property_type'])}`}>
                            {item['property_type']}
                          </span>
                          <span className="text-xs text-slate-500">{item['address.addr1']}</span>
                        </div>
                        <p className="text-sm font-medium text-white leading-tight truncate">{item['name']}</p>
                        <p className="text-xs text-emerald-400 mt-0.5">{item['price']}</p>
                      </div>
                    </div>
                    <CoverDropZone
                      listingId={item['home_listing_id']}
                      existingUrl={manageCovers[item['home_listing_id']] || item['image[0].url']}
                      onUploaded={url => setManageCovers(p => ({ ...p, [item['home_listing_id']]: url }))}
                    />
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
