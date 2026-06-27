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
  const [saving, setSaving] = useState(false);
  const [sendDate, setSendDate] = useState('');
  const [sendTime, setSendTime] = useState('');
  const [chatId, setChatId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tomorrowDubai = () => {
    // Dubai = UTC+4
    const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    fetch('/api/wa-schedule')
      .then(r => r.json())
      .then(data => {
        setConfig(data.config);
        setItems(data.items || []);

        if (data.config.scheduled_at) {
          const [d, t] = data.config.scheduled_at.split(' ');
          setSendDate(d || tomorrowDubai());
          setSendTime(t || '10:00');
        } else {
          setSendDate(tomorrowDubai());
          setSendTime('10:00');
        }
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

  const saveConfig = async () => {
    if (!sendDate || !sendTime) return alert('Укажи дату и время');
    setSaving(true);
    try {
      const scheduledAt = `${sendDate} ${sendTime}`;
      const res = await fetch('/api/wa-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'config',
          configRowIndex: config.configRowIndex,
          scheduledAt,
          waChatId: chatId,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setConfig(prev => ({ ...prev, scheduled_at: scheduledAt, wa_chatid: chatId }));
      alert(`Запланировано: ${sendDate} в ${sendTime} по Дубаю`);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const waiting = items.filter(i => i.status === 'WAITING');
  const sent = items.filter(i => i.status === 'SENT');
  const markedCount = waiting.filter(i => i.marked).length;

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

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
        <p className="text-slate-400 text-sm">Посты ждут отправки в WhatsApp. Отметь нужные и задай время по Дубаю.</p>
      </div>

      {/* Settings panel */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">⚙️ Настройки отправки</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Дата (по Дубаю)</label>
            <input
              type="date"
              value={sendDate}
              onChange={e => setSendDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Время (по Дубаю, UTC+4)</label>
            <input
              type="time"
              value={sendTime}
              onChange={e => setSendTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">WhatsApp Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="37257957905@c.us или 120363...@g.us"
            className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
          />
          <p className="text-[10px] text-slate-500 mt-1">Личный чат: номер@c.us · Группа: id@g.us</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-5 rounded-xl transition-all text-sm disabled:opacity-50"
          >
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Сохраняю...</> : '📅 Сохранить расписание'}
          </button>

          {config.scheduled_at && (
            <span className="text-xs text-emerald-400">
              Запланировано: <strong>{config.scheduled_at}</strong> (Дубай)
            </span>
          )}
        </div>
      </div>

      {/* Waiting queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            📋 Очередь ({waiting.length})
          </h2>
          {markedCount > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {markedCount} отмечено к отправке
            </span>
          )}
        </div>

        {waiting.length === 0 ? (
          <div className="p-8 rounded-2xl border border-white/5 bg-slate-900/30 text-center text-slate-500 text-sm">
            Очередь пуста. Посты появятся здесь после нажатия «Send to Telegram».
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
                    {item.marked && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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
