"use client";

import { useState } from 'react';

export default function BudgetPage() {
  const [project, setProject] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Budget Builder</h1>
        <p className="text-slate-400">Paste your raw TSV table data to generate a budget plan.</p>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all text-white placeholder-slate-500"
              placeholder="e.g. Sobha Orbis"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Paste Full Table (TSV)</label>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all text-white placeholder-slate-500 font-mono text-sm"
              placeholder="Paste table data here..."
            />
          </div>

          <button
            onClick={handleParse}
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Calculating...' : 'Generate Budget'}
          </button>
        </div>
      </div>

      {parsedData && (
        <div className="mt-8 p-6 rounded-2xl bg-slate-900/40 border border-white/5 backdrop-blur-md">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Result ({parsedData.selectedRows} units)
          </h3>
          <div className="bg-slate-950/50 p-6 rounded-xl border border-white/5 text-sm font-mono whitespace-pre-wrap text-slate-300 overflow-auto max-h-96">
            {JSON.stringify(parsedData.selected, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
