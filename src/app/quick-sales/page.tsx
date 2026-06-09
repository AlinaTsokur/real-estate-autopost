"use client";

import { useState, useEffect } from 'react';

interface QuickSaleItem {
  unit: string;
  code: string;
  bedrooms: string;
  originalPrice: string;
  sellingPrice: string;
}

export default function QuickSalesPage() {
  const [items, setItems] = useState<QuickSaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchQuickSales = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/quick-sales');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuickSales();
  }, []);

  const copyToClipboard = () => {
    if (!items.length) return;
    
    let text = '⚡ Quick Sales List:\n\n';
    items.forEach(item => {
      text += `Unit: ${item.unit || '-'} | Code: ${item.code || '-'}\n`;
      text += `Type: ${item.bedrooms || '-'}\n`;
      text += `Original Price: ${item.originalPrice || '-'} AED\n`;
      text += `Selling Price: ${item.sellingPrice || '-'} AED\n\n`;
    });

    navigator.clipboard.writeText(text.trim());
    alert('Copied to clipboard!');
  };

  return (
    <div className="max-w-6xl mx-auto w-full">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">⚡ Quick Sales</h1>
            {!loading && items.length > 0 && (
              <span className="bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-full border border-indigo-500/30">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <p className="text-slate-400">View and copy properties marked as "Quick Sale" from Abu Dhabi sheet.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchQuickSales}
            disabled={loading}
            className="bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 px-5 rounded-xl transition-colors border border-white/10 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              '🔄 Refresh'
            )}
          </button>
          
          <button
            onClick={copyToClipboard}
            disabled={items.length === 0}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 px-5 rounded-xl transition-colors shadow-lg shadow-indigo-500/25 disabled:opacity-50"
          >
            📋 Copy List
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          {error}
        </div>
      )}

      <div className="bg-slate-900/60 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50 border-b border-white/5 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4 font-medium">Unit / Code</th>
                <th className="px-6 py-4 font-medium">Bedrooms</th>
                <th className="px-6 py-4 font-medium">Original Price (AED)</th>
                <th className="px-6 py-4 font-medium">Selling Price (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      Loading Quick Sales...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No properties marked as "Quick Sale" found.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{item.code || '-'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.unit || 'No unit specified'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {item.bedrooms || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-sm">
                      {item.originalPrice || '-'}
                    </td>
                    <td className="px-6 py-4 text-emerald-400 font-medium font-mono text-sm">
                      {item.sellingPrice || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
