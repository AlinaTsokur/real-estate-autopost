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
    <div className="max-w-3xl mx-auto w-full">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--ink-900)' }}>⚡ Quick Sales</h1>
            {!loading && items.length > 0 && (
              <span className="bb-tint-accent bb-accent text-xs font-semibold px-2 py-0.5 rounded-full border bb-edge">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <p className="bb-ink-3 text-sm">Properties marked as "Quick Sale" from Abu Dhabi sheet.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchQuickSales}
            disabled={loading}
            className="bb-surface-soft hover:bb-surface-soft bb-ink text-sm font-medium py-2 px-3.5 rounded-lg transition-colors border bb-edge disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 bb-spin rounded-full animate-spin" />
            ) : (
              '🔄 Refresh'
            )}
          </button>

          <button
            onClick={copyToClipboard}
            disabled={items.length === 0}
            className="bb-fill-accent hover:bb-fill-accent text-white text-sm font-medium py-2 px-3.5 rounded-lg transition-colors shadow-lg bb-lift disabled:opacity-50"
          >
            📋 Copy List
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bb-tint-bad border bb-edge bb-bad text-sm">
          {error}
        </div>
      )}

      <div className="bb-surface border bb-edge rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bb-surface-soft border-b bb-edge text-[11px] uppercase tracking-wider bb-ink-3">
                <th className="px-4 py-2.5 font-medium">Unit / Code</th>
                <th className="px-3 py-2.5 font-medium">Bedrooms</th>
                <th className="px-3 py-2.5 font-medium text-right">Original</th>
                <th className="px-4 py-2.5 font-medium text-right">Selling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center bb-ink-4">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 bb-spin rounded-full animate-spin" />
                      Loading Quick Sales...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center bb-ink-4">
                    No properties marked as "Quick Sale" found.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={idx} className="hover:bb-surface-soft transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-medium bb-ink">{item.code || '-'}</div>
                      <div className="text-xs bb-ink-3">{item.unit || 'No unit'}</div>
                    </td>
                    <td className="px-3 py-2.5 bb-ink-2 whitespace-nowrap">
                      {item.bedrooms || '-'}
                    </td>
                    <td className="px-3 py-2.5 bb-ink-3 font-mono text-xs text-right whitespace-nowrap">
                      {item.originalPrice || '-'}
                    </td>
                    <td className="px-4 py-2.5 bb-ok font-semibold font-mono text-xs text-right whitespace-nowrap">
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
