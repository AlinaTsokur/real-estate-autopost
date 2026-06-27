"use client";

import { useEffect, useState } from 'react';

interface WaItem {
  rowIndex: number;
  id: string;
  created_at: string;
  label: string;
  wa_text: string;
  drive_file_id: string;
  marked: boolean;
  status: string;
}

interface WaConfig {
  scheduled_at: string;
  wa_chatid: string;
  configRowIndex: number;
}

export default function ScheduledPage() {
  const [items, setItems] = useState<WaItem[]>([]);
  const [config, setConfig] = useState<WaConfig>({ scheduled_at: '', wa_chatid: '', configRowIndex: -1 });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatId, setChatId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/wa-schedule')
      .then(r => r.json())
      .then(data => {
        setConfig(data.config);
        setItems(data.items || []);
        setChatId(data.config.wa_chatid || '37257957905@c.us');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleMark = async (item: WaItem) => {
    const newVal = !item.marked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, marked: newVal } : i));
    await fetch('/api/wa-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', rowIndex: item.rowIndex, marked: newVal }),
    });
  };

  const saveChatId = async () => {
    if (!chatId.trim()) return alert('Введи Chat ID');
    setSavingConfig(true);
    try {
      const res = await fetch('/api/wa-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'config',
          configRowIndex: config.configRowIndex,
          scheduledAt: config.scheduled_at,
          waChatId: chatId.trim(),
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setConfig(prev => ({ ...prev, wa_chatid: chatId.trim() }));
      alert('Сохранено');
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const sendNow = async () => {
    if (markedCount === 0) return alert('Сначала отметь посты галочками');
    if (!confirm(`Отправить ${markedCount} пост(а) прямо сейчас в WhatsApp?`)) return;

    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/wa-schedule/send-now', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Refresh list
      const fresh = await fetch('/api/wa-schedule').then(r => r.json());
      setItems(fresh.items || []);
      setSendResult(`Отправлено: ${data.sent} из ${markedCount}`);
    } catch (e: any) {
      setSendResult('Ошибка: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const waiting = items.filter(i => i.status === 'WAITING');
  const sent = items.filter(i => i.status === 'SENT');
  const markedCount = waiting.filter(i => i.marked).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">WA Schedule</h1>
        <p className="text-slate-400 text-sm">
          Посты автоматически появляются здесь после «Send to Telegram». Отметь нужные и отправь.
        </p>
      </div>

      {/* Settings */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">⚙️ WhatsApp Chat ID</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="37257957905@c.us или 120363...@g.us"
            className="flex-1 px-3 py-2 bg-slate-950/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
          />
          <button
            onClick={saveChatId}
            disabled={savingConfig}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {savingConfig ? '...' : 'Сохранить'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Личный чат: <code className="text-slate-400">номер@c.us</code> · Группа: <code className="text-slate-400">id@g.us</code><br/>
          Автоматически отправляется каждый день в <strong className="text-slate-300">10:00 по Дубаю</strong> (если есть отмеченные посты)
        </p>
      </div>

      {/* Send Now + counter */}
      <div className="flex items-center gap-4">
        <button
          onClick={sendNow}
          disabled={sending || markedCount === 0}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-green-600/20 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {sending
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Отправляю...</>
            : '📤 Отправить сейчас'}
        </button>

        {markedCount > 0 && (
          <span className="text-sm text-emerald-400 font-medium">{markedCount} пост(а) отмечено</span>
        )}

        {sendResult && (
          <span className={`text-sm font-medium ${sendResult.startsWith('Ошибка') ? 'text-rose-400' : 'text-emerald-400'}`}>
            {sendResult}
          </span>
        )}
      </div>

      {/* Queue */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          📋 Очередь ({waiting.length})
        </h2>

        {waiting.length === 0 ? (
          <div className="p-8 rounded-2xl border border-white/5 bg-slate-900/30 text-center text-slate-500 text-sm">
            Очередь пуста. Посты появятся здесь после нажатия «Send to Telegram» на странице Manual Post.
          </div>
        ) : (
          <div className="space-y-2">
            {waiting.map(item => (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all ${item.marked ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-slate-900/40'}`}
              >
                <div className="flex items-start gap-3 p-4">
                  <button
                    onClick={() => toggleMark(item)}
                    className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 transition-all flex items-center justify-center ${item.marked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600 hover:border-slate-400'}`}
                  >
                    {item.marked && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-white truncate">{item.label}</span>
                      {item.drive_file_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 shrink-0">📷 фото</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">{formatDate(item.created_at)}</span>

                    <button
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 mt-1 block"
                    >
                      {expandedId === item.id ? 'скрыть текст ▲' : 'показать текст ▼'}
                    </button>

                    {expandedId === item.id && (
                      <pre className="mt-2 text-[11px] text-slate-300 whitespace-pre-wrap font-sans bg-slate-950/50 p-3 rounded-xl border border-white/5 max-h-48 overflow-y-auto">
                        {item.wa_text}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent history */}
      {sent.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">✅ Отправлено ({sent.length})</h2>
          <div className="space-y-1.5">
            {sent.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/5 bg-slate-900/20 opacity-60">
                <span className="text-emerald-500 text-sm">✓</span>
                <span className="text-sm text-slate-400 truncate">{item.label}</span>
                <span className="text-[11px] text-slate-600 ml-auto shrink-0">{formatDate(item.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
