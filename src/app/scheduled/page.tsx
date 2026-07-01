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
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [state, setState] = useState<string>('');
  const [refreshingState, setRefreshingState] = useState(false);

  const load = async () => {
    const data = await fetch('/api/wa-schedule').then(r => r.json());
    setConfig(data.config);
    setItems(data.items || []);
    setState(data.state || 'unknown');
    setChatId(data.config?.wa_chatid || '37257957905@c.us');
  };

  const refreshState = async () => {
    setRefreshingState(true);
    try {
      const data = await fetch('/api/wa-schedule').then(r => r.json());
      setState(data.state || 'unknown');
    } finally {
      setRefreshingState(false);
    }
  };

  const isReady = state === 'authorized';

  const stateInfo: Record<string, { dot: string; label: string; cls: string }> = {
    authorized: { dot: '🟢', label: 'Авторизован — можно отправлять', cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
    yellowCard: { dot: '🟡', label: 'Жёлтая карточка — WhatsApp ограничил номер, отправка заблокирована', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
    blocked: { dot: '🔴', label: 'Заблокирован — номер забанен', cls: 'bg-rose-500/10 border-rose-500/30 text-rose-300' },
    notAuthorized: { dot: '🔴', label: 'Не авторизован — переподключи WhatsApp в Green API', cls: 'bg-rose-500/10 border-rose-500/30 text-rose-300' },
    sleepMode: { dot: '🟡', label: 'Спящий режим — телефон офлайн', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
    starting: { dot: '⚪', label: 'Запускается...', cls: 'bg-slate-500/10 border-slate-500/30 text-slate-300' },
    unknown: { dot: '⚪', label: 'Статус неизвестен', cls: 'bg-slate-500/10 border-slate-500/30 text-slate-400' },
  };
  const si = stateInfo[state] || stateInfo.unknown;

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
    setConfirmSendId(null);
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
      setErrorMsg('Ошибка отправки: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteOne = async (item: WaItem) => {
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
      setErrorMsg('Ошибка удаления: ' + e.message);
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

      {/* WhatsApp status */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${si.cls}`}>
        <span className="text-lg leading-none">{si.dot}</span>
        <span className="text-sm font-medium flex-1">{si.label}</span>
        <button
          onClick={refreshState}
          disabled={refreshingState}
          className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
        >
          {refreshingState ? '...' : '↻ Обновить'}
        </button>
      </div>

      {!isReady && (
        <div className="px-4 py-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-amber-200/90 text-xs leading-relaxed">
          ⚠️ Пока WhatsApp не в статусе 🟢 «Авторизован», отправка заблокирована (и ручная, и автоматическая) — чтобы не усугублять блокировку. Переждите ограничение и не шлите тесты.
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-lg leading-none">×</button>
        </div>
      )}

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

                  <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                    {busyId === item.id ? (
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        Обработка...
                      </div>
                    ) : confirmSendId === item.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-amber-300">Отправить сейчас?</span>
                        <button onClick={() => sendOne(item)} className="text-xs px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-all">Да</button>
                        <button onClick={() => setConfirmSendId(null)} className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all">Нет</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmSendId(item.id)}
                          disabled={!isReady}
                          title={!isReady ? 'Отправка заблокирована: WhatsApp не авторизован' : ''}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          📤 Отправить
                        </button>
                        <button
                          onClick={() => deleteOne(item)}
                          disabled={busyId !== null}
                          className="flex items-center gap-1.5 bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all disabled:opacity-50"
                        >
                          🗑 Удалить
                        </button>
                      </>
                    )}
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
