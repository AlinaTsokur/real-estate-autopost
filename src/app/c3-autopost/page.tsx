'use client';

import React, { useState, useEffect } from 'react';

export default function C3AutopostPage() {
  const [units, setUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [loadingUnits, setLoadingUnits] = useState(true);
  
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/c3-autopost')
      .then(res => res.json())
      .then(data => {
        if (data.units) setUnits(data.units);
        setLoadingUnits(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingUnits(false);
      });
  }, []);

  const handlePrepare = async () => {
    if (!selectedUnit) return;
    setPreparing(true);
    setError('');
    setSuccess(false);
    setParsedData(null);
    setPreviewHtml('');

    try {
      const res = await fetch('/api/c3-autopost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: selectedUnit })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to prepare post');
      }

      setParsedData(data.parsed);
      setPreviewHtml(data.preview);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  };

  const handleSend = async () => {
    if (!parsedData) return;
    setSending(true);
    setError('');

    try {
      const payload = { ...parsedData, project: 'C3 Garden Residence' };
      const res = await fetch('/api/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send post');

      setSuccess(true);
      // Optional: reset selection after a few seconds
      setTimeout(() => {
        setSuccess(false);
        setParsedData(null);
        setPreviewHtml('');
        setSelectedUnit('');
      }, 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold  tracking-tight" style={{ color: 'var(--ink-900)' }}>🏢 C3 Autopost</h1>
      </div>
      
      <p className="text-slate-400">Automated post builder for C3 Garden Residence. Select a unit to automatically fetch data and Google Drive slide image.</p>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6">
        <div className="max-w-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Select Unit</label>
            {loadingUnits ? (
              <div className="text-slate-500 text-sm animate-pulse">Loading units from Google Sheets...</div>
            ) : (
              <select 
                value={selectedUnit}
                onChange={e => setSelectedUnit(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="">-- Choose Unit --</option>
                {units.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={handlePrepare}
            disabled={!selectedUnit || preparing || loadingUnits}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg shadow-indigo-500/20"
          >
            {preparing ? 'Fetching Data & Image...' : 'Prepare Post'}
          </button>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {parsedData && previewHtml && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6">
            <h2 className="text-lg font-medium text-white mb-4">Preview Slide</h2>
            {parsedData.slideDataUrl ? (
              <img src={parsedData.slideDataUrl} alt="Slide" className="rounded-lg shadow-lg border border-white/10 w-full" />
            ) : (
              <div className="text-slate-500 text-sm">No slide image available.</div>
            )}
          </div>

          <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6 flex flex-col">
            <h2 className="text-lg font-medium text-white mb-4">Telegram Post Preview</h2>
            
            <div className="flex-1 bg-slate-950 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-slate-300 border border-white/5 overflow-y-auto max-h-96 custom-scrollbar mb-4"
                 dangerouslySetInnerHTML={{ __html: previewHtml }}>
            </div>

            {success ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center font-medium animate-pulse">
                ✅ Post Sent Successfully!
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-emerald-500/20"
              >
                {sending ? 'Sending to Telegram...' : 'Send to Telegram'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
