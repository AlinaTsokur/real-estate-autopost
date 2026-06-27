"use client";

import { useEffect, useState } from 'react';

interface WaItem {
  rowIndex: number;
  id: string;
  created_at: string;
  label: string;
  wa_text: string;
  drive_file_id: string;
  scheduled_at: string;
  status: string;
}

interface WaConfig {
  wa_chatid: string;
  configRowIndex: number;
}

export default function ScheduledPage() {
  const [items, setItems] = useState<WaItem[]>([]);
  const [config, setConfig] = useState<WaConfig>({ wa_chatid: '', configRowIndex: -1 });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [chatId, setChatId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const data = await fetch('/api/wa-schedule').then(r => r.json());
    setConfig(data.config);
    setItems(data.items || []);
    setChatId(data.config?.wa_chatid || '37257957905@c.us');
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  // Convert stored "YYYY-MM-DD HH:MM" <-> datetime-local "YYYY-MM-DDTHH:MM"
  const toInput = (s: string) => (s ? s.replace(' ', 'T').slice(0, 16) : '');
  const fromInput = (s: string) => (s ? s.replace('T', ' ').slice(0, 16) : '');

  const setSchedule = async (item: WaItem, inputVal: string) => {
    const scheduledAt = fromInput(inputVal);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, scheduled_at: scheduledAt } : i));
    await fetch('/api/wa-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'schedule', rowIndex: item.rowIndex, scheduledAt }),
    });
  };

  const sendOne = async (item: WaItem) => {
    if (!confirm(`Отправить пост «${item.label}» в WhatsApp прямо сейчас?`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch('/api/wa-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-one', rowIndex: item.rowIndex }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await load();
    } catch (e: any) {
      alert('Ошибка отправки: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteOne = async (item: WaItem) => {
    if (!confirm(`Удалить пост «${item.label}» из очереди?`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch('/api/wa-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', rowIndex: item.rowIndex }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await load();
    } catch (e: any) {
      alert('Ошибка удаления: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveChatId = async () => {
    if (!chatId.trim()) return alert('Введи Chat ID');
    setSavingConfig(true);
    try {
      const res = await fetch('/api/wa-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', configRowIndex: config.configRowIndex, waChatId: chatId.trim() }),
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

  const formatCreated = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const waiting = items.filter(i => i.status === 'WAITING');

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
          Посты попадают сюда после «Send to Telegram». Задай время по Дубаю — пост уйдёт сам. Или отправь/удали вручную.
        </p>
      </div>

      {/* Chat ID */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
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
          Личный чат: <code className="text-slate-400">номер@c.us</code> · Группа: <code className="text-slate-400">id@g.us</code>
        </p>
      </div>

      {/* Queue */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">📋 Очередь ({waiting.length})</h2>

        {waiting.length === 0 ? (
          <div className="p-8 rounded-2xl border border-white/5 bg-slate-900/30 text-center text-slate-500 text-sm">
            Очередь пуста. Посты появятся здесь после нажатия «Send to Telegram» на странице Manual Post.
          </div>
        ) : (
          <div className="space-y-3">
            {waiting.map(item => (
              <div key={item.id} className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-white truncate">{item.label}</span>
                      {item.drive_file_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 shrink-0">📷 фото</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">создан {formatCreated(item.created_at)}</span>
                  </div>

                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 shrink-0"
                  >
                    {expandedId === item.id ? 'скрыть ▲' : 'текст ▼'}
                  </button>
                </div>

                {expandedId === item.id && (
                  <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-sans bg-slate-950/50 p-3 rounded-xl border border-white/5 max-h-48 overflow-y-auto">
                    {item.wa_text}
                  </pre>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">⏰ Время (Дубай):</span>
                    <input
                      type="datetime-local"
                      value={toInput(item.scheduled_at)}
                      onChange={e => setSchedule(item, e.target.value)}
                      className="px-2 py-1.5 bg-slate-950/50 border border-white/10 rounded-lg text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500/50 [color-scheme:dark]"
                    />
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => sendOne(item)}
                      disabled={busyId === item.id}
                      className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all disabled:opacity-50"
                    >
                      {busyId === item.id
                        ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />...</>
                        : '📤 Отправить'}
                    </button>
                    <button
                      onClick={() => deleteOne(item)}
                      disabled={busyId === item.id}
                      className="flex items-center gap-1.5 bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all disabled:opacity-50"
                    >
                      🗑 Удалить
                    </button>
                  </div>
                </div>

                {item.scheduled_at && (
                  <p className="text-[10px] text-emerald-400/80">
                    Уйдёт автоматически: <strong>{item.scheduled_at}</strong> (по Дубаю)
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
