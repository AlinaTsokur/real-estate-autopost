"use client";

import { useState, useEffect } from 'react';

export default function ManualPostPage() {
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState('');
  const [postType, setPostType] = useState('NEW');
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Fetch projects from Google Sheets on page load
  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
          setProject(data.projects[0]); // Select first by default
        }
      })
      .catch(err => console.error('Failed to load projects:', err))
      .finally(() => setProjectsLoading(false));
  }, []);

  const handleParse = async () => {
    if (!project || !rawText) return alert('Select project and paste text');
    setLoading(true);
    try {
      const res = await fetch('/api/parse-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, projectName: project })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsedData(data.parsed);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!parsedData) return;
    setSending(true);
    try {
      const payload = { ...parsedData, postType, project };
      const res = await fetch('/api/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert('Sent to Review Group!');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Manual Post Builder</h1>
        <p className="text-slate-400">Parse a single row and prepare it for Telegram.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Input Form */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Project</label>
              {projectsLoading ? (
                <div className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-slate-500 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  Loading projects...
                </div>
              ) : projects.length > 0 ? (
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white appearance-none cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                  Failed to load projects. Check Google Sheets connection.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Post Type</label>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white appearance-none cursor-pointer"
              >
                <option value="NEW">🔥 NEW</option>
                <option value="HOT_PRICE">🔥 HOT PRICE</option>
                <option value="DISTRESS">⚡ QUICK SALE</option>
                <option value="NEW_PRICE">🔥 NEW PRICE</option>
                <option value="READY_TO_MOVE">❗️ READY TO MOVE</option>
                <option value="REDUCED">❗️ REDUCED</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Paste Row (from Canva/Sheets)</label>
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-500 font-mono text-sm"
                placeholder="Paste TSV row here..."
              />
            </div>

            <button
              onClick={handleParse}
              disabled={loading || !project}
              className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Parsing...' : 'Parse Data'}
            </button>
          </div>
        </div>

        {/* Preview & Edit Panel */}
        {parsedData && (
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 backdrop-blur-md space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Parsed Data Review
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Unit/Code</label>
                <input type="text" value={parsedData.code || parsedData.unit} onChange={(e) => setParsedData({...parsedData, code: e.target.value})} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Selling Price</label>
                <input type="text" value={parsedData.sellingPrice} onChange={(e) => setParsedData({...parsedData, sellingPrice: e.target.value})} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type</label>
                <input type="text" value={parsedData.type} onChange={(e) => setParsedData({...parsedData, type: e.target.value})} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Handover</label>
                <input type="text" value={parsedData.handover} onChange={(e) => setParsedData({...parsedData, handover: e.target.value})} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <label className="block text-sm font-medium text-slate-300 mb-2">Slide Image</label>
              <input type="text" placeholder="data:image/jpeg;base64,..." value={parsedData.slideDataUrl || ''} onChange={(e) => setParsedData({...parsedData, slideDataUrl: e.target.value})} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {sending ? 'Sending to Review Group...' : 'Send to Telegram'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
