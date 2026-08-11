"use client";

import { useEffect, useRef, useState } from 'react';

interface Unit { code: string; unitNumber: string; project: string; price: string }
interface Last {
  sentAt: string; status: string; error: string | null;
  unitsCount: number; repliedAt: string | null; replyText: string | null;
}
interface Item {
  phone: string; phoneRaw: string; name: string; language: 'RU' | 'EN';
  units: Unit[]; message: string; excluded: boolean; last: Last | null;
}
interface Settings {
  sendingEnabled: boolean; dailyLimit: number; throttleSeconds: number;
  instanceId: string; contactedBy: string; cooldownDays: number;
  templateRu: string; templateEn: string;
  questionRuOne: string; questionRuMany: string;
  questionEnOne: string; questionEnMany: string;
}

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const whenLabel = (iso: string) => {
  const d = daysAgo(iso);
  if (d === 0) return 'сегодня';
  if (d === 1) return 'вчера';
  return `${d} дн. назад`;
};

export default function BrokerCheckPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [withoutPhone, setWithoutPhone] = useState<any[]>([]);
  const [owners, setOwners] = useState<{ name: string; units: number }[]>([]);
  const [instances, setInstances] = useState<{ id: string; name: string }[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sentToday, setSentToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  // Именно ref: цикл отправки держит замыкание, и обычное состояние в нём не обновится —
  // кнопка «Стоп» тогда бы не работала.
  const stopRef = useRef(false);

  const load = async (contactedBy?: string) => {
    const q = contactedBy !== undefined ? `?contactedBy=${encodeURIComponent(contactedBy)}` : '';
    const d = await fetch(`/api/broker-check${q}`).then(r => r.json());
    if (d.error) { setMsg({ ok: false, text: d.error }); return; }
    setItems(d.items || []);
    setWithoutPhone(d.withoutPhone || []);
    setOwners(d.owners || []);
    setInstances(d.instances || []);
    setSettings(d.settings);
    setSentToday(d.sentToday || 0);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const patchSettings = async (patch: Partial<Settings>) => {
    const d = await fetch('/api/broker-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', settings: patch }),
    }).then(r => r.json());
    if (d.error) return setMsg({ ok: false, text: d.error });
    setSettings(d.settings);
    setMsg({ ok: true, text: 'Настройки сохранены' });
    if (patch.contactedBy !== undefined || patch.templateRu !== undefined || patch.templateEn !== undefined
      || patch.questionRuOne !== undefined || patch.questionRuMany !== undefined
      || patch.questionEnOne !== undefined || patch.questionEnMany !== undefined) {
      setDrafts({});
      await load(d.settings.contactedBy);
    }
  };

  const toggleExcluded = async (it: Item) => {
    const excluded = !it.excluded;
    setItems(prev => prev.map(x => x.phone === it.phone ? { ...x, excluded } : x));
    if (excluded) setPicked(p => ({ ...p, [it.phone]: false }));
    const d = await fetch('/api/broker-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'optout', phone: it.phone, name: it.name, excluded }),
    }).then(r => r.json());
    if (d.error) setMsg({ ok: false, text: d.error });
  };

  // Кому имеет смысл писать: не исключён и не писали недавно.
  const isFresh = (it: Item) =>
    !it.excluded && (!it.last || daysAgo(it.last.sentAt) >= (settings?.cooldownDays ?? 7));

  const selected = items.filter(i => picked[i.phone] && !i.excluded);
  const limitLeft = Math.max(0, (settings?.dailyLimit ?? 0) - sentToday);

  const sendSelected = async () => {
    if (!settings?.sendingEnabled) {
      setMsg({ ok: false, text: 'Рассылка выключена — включи её в настройках. Пока ни одно сообщение не уйдёт.' });
      return;
    }
    setSending(true);
    stopRef.current = false;
    setMsg(null);

    const queue = [...selected];
    let done = 0, ok = 0;
    const errors: string[] = [];

    for (const it of queue) {
      if (stopRef.current) break;
      setProgress({ done, total: queue.length, current: it.name || it.phone });
      const message = drafts[it.phone] ?? it.message;
      try {
        const d = await fetch('/api/broker-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send',
            targets: [{ phone: it.phone, name: it.name, message, unitsCount: it.units.length }],
          }),
        }).then(r => r.json());

        if (d.error) { errors.push(`${it.name}: ${d.error}`); break; }   // лимит/статус — дальше нет смысла
        const r0 = d.results?.[0];
        if (r0?.ok) { ok++; setPicked(p => ({ ...p, [it.phone]: false })); }
        else errors.push(`${it.name}: ${r0?.error || 'не отправлено'}`);
      } catch (e: any) {
        errors.push(`${it.name}: ${e.message}`);
      }
      done++;
      setProgress({ done, total: queue.length, current: '' });

      // Пауза между сообщениями, чтобы это не выглядело массовой рассылкой.
      const wait = settings.throttleSeconds ?? 60;
      if (done < queue.length && wait > 0 && !stopRef.current) {
        await new Promise(r => setTimeout(r, wait * 1000));
      }
    }

    setSending(false);
    setProgress(null);
    setMsg(errors.length
      ? { ok: false, text: `Отправлено ${ok}. Не ушло: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` и ещё ${errors.length - 3}` : ''}` }
      : { ok: true, text: `Отправлено ${ok}.` });
    await load();
  };

  if (loading) return <div className="bb-ink-4 text-sm p-4">Загрузка…</div>;

  return (
    <div className="max-w-4xl mx-auto w-full pb-16">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--ink-900)' }}>🤝 Сверка брокеров</h1>
        <button
          onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}
          className="ml-auto bb-surface-soft bb-ink text-xs py-1 px-2.5 rounded-lg border bb-edge"
        >🔄</button>
        <button
          onClick={() => setShowSettings(v => !v)}
          className="bb-surface-soft bb-ink text-xs py-1 px-2.5 rounded-lg border bb-edge"
        >⚙️ Настройки</button>
      </div>
      <p className="bb-ink-3 text-xs mb-4">
        Доступные юниты Абу-Даби из базы, сгруппированные по номеру брокера. Отметь галочками, кому писать.
      </p>

      {/* Рубильник */}
      {!settings?.sendingEnabled && (
        <div className="mb-4 p-3 rounded-xl bb-tint-warn border bb-edge text-xs bb-warn">
          ⚠️ Рассылка выключена — ни одно сообщение не уйдёт. Включается в настройках, вручную.
        </div>
      )}

      {msg && (
        <div className={`mb-4 p-3 rounded-xl border bb-edge text-xs ${msg.ok ? 'bb-tint-ok bb-ok' : 'bb-tint-bad bb-bad'}`}>
          {msg.text}
        </div>
      )}

      {/* Настройки */}
      {showSettings && settings && (
        <div className="mb-5 p-4 rounded-2xl bb-surface border bb-edge space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs bb-ink-2 block mb-1">Чьи листинги</span>
              <select
                value={settings.contactedBy}
                onChange={e => patchSettings({ contactedBy: e.target.value })}
                className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-sm outline-none"
              >
                <option value="">Все</option>
                {owners.map(o => <option key={o.name} value={o.name}>{o.name} ({o.units})</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-xs bb-ink-2 block mb-1">Писать с номера</span>
              <select
                value={settings.instanceId}
                onChange={e => patchSettings({ instanceId: e.target.value })}
                className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-sm outline-none"
              >
                <option value="">— выбери —</option>
                {instances.map(i => <option key={i.id} value={i.id}>{i.name} ({i.id})</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-xs bb-ink-2 block mb-1">Лимит в сутки</span>
              <input
                type="number" min={1} max={500} defaultValue={settings.dailyLimit}
                onBlur={e => patchSettings({ dailyLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs bb-ink-2 block mb-1">Пауза между сообщениями, сек</span>
              <input
                type="number" min={0} max={600} defaultValue={settings.throttleSeconds}
                onBlur={e => patchSettings({ throttleSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs bb-ink-2 block mb-1">Не писать повторно, дней</span>
              <input
                type="number" min={0} max={90} defaultValue={settings.cooldownDays}
                onBlur={e => patchSettings({ cooldownDays: Number(e.target.value) })}
                className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-sm outline-none"
              />
            </label>

            <label className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={settings.sendingEnabled}
                onChange={e => patchSettings({ sendingEnabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-xs bb-ink-2">Разрешить отправку с WhatsApp</span>
            </label>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer bb-ink-3 select-none">Тексты сообщений</summary>
            <div className="mt-3 space-y-3">
              {([
                ['templateRu', 'Шаблон RU — {name}, {question}, {list}'],
                ['questionRuOne', 'Вопрос RU, один юнит'],
                ['questionRuMany', 'Вопрос RU, несколько юнитов'],
                ['templateEn', 'Шаблон EN — {name}, {question}, {list}'],
                ['questionEnOne', 'Вопрос EN, один юнит'],
                ['questionEnMany', 'Вопрос EN, несколько юнитов'],
              ] as [keyof Settings, string][]).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[11px] bb-ink-3 block mb-1">{label}</span>
                  <textarea
                    defaultValue={String(settings[key])}
                    onBlur={e => patchSettings({ [key]: e.target.value } as Partial<Settings>)}
                    rows={String(settings[key]).split('\n').length + 1}
                    className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-xs outline-none font-mono"
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Панель выбора */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <button onClick={() => setPicked(Object.fromEntries(items.filter(isFresh).map(i => [i.phone, true])))}
          className="px-3 py-1.5 bb-surface-soft border bb-edge rounded-lg bb-ink-2">
          Выбрать всех, кому пора ({items.filter(isFresh).length})
        </button>
        <button onClick={() => setPicked({})} className="px-3 py-1.5 bb-surface-soft border bb-edge rounded-lg bb-ink-3">
          Снять выбор
        </button>
        <span className="bb-ink-4">
          выбрано {selected.length} · сегодня ушло {sentToday} из {settings?.dailyLimit ?? 0} · остаток {limitLeft}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {sending && (
            <button onClick={() => { stopRef.current = true; }} className="px-3 py-1.5 bb-tint-bad border bb-edge bb-bad rounded-lg">
              Стоп
            </button>
          )}
          <button
            onClick={sendSelected}
            disabled={sending || !selected.length}
            className="px-4 py-1.5 bb-fill-accent text-white rounded-lg font-medium disabled:opacity-40"
          >
            {sending
              ? `Отправляю ${progress?.done ?? 0}/${progress?.total ?? 0}…`
              : `Отправить выбранным (${selected.length})`}
          </button>
        </div>
      </div>

      {sending && progress?.current && (
        <div className="mb-3 text-xs bb-ink-3">Сейчас: {progress.current}. Пауза между сообщениями {settings?.throttleSeconds}с — не закрывай вкладку.</div>
      )}

      {/* Список брокеров */}
      <div className="space-y-2">
        {items.map(it => {
          const draft = drafts[it.phone] ?? it.message;
          const open = openPhone === it.phone;
          const fresh = isFresh(it);
          return (
            <div key={it.phone} className={`rounded-2xl border bb-edge bb-surface p-3 ${it.excluded ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!picked[it.phone] && !it.excluded}
                  disabled={it.excluded}
                  onChange={e => setPicked(p => ({ ...p, [it.phone]: e.target.checked }))}
                  className="w-4 h-4 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium bb-ink">{it.name || '(без имени)'}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bb-tint-accent bb-accent">{it.language}</span>
                    <span className="text-[11px] bb-ink-4 font-mono">+{it.phone}</span>
                    <span className="text-[11px] bb-ink-4">· {it.units.length} юнит(ов)</span>
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {it.last ? (
                      it.last.repliedAt ? (
                        <span className="bb-ok">✓ ответил {whenLabel(it.last.repliedAt)}</span>
                      ) : it.last.status === 'failed' ? (
                        <span className="bb-bad">⚠️ не ушло {whenLabel(it.last.sentAt)}: {it.last.error?.slice(0, 60)}</span>
                      ) : (
                        <span className="bb-ink-3">отправлено {whenLabel(it.last.sentAt)} · ответа нет</span>
                      )
                    ) : (
                      <span className="bb-ink-4">ещё не писали</span>
                    )}
                    {!fresh && !it.excluded && it.last && !it.last.repliedAt && (
                      <span className="bb-ink-4"> · в паузе</span>
                    )}
                  </div>
                </div>

                <button onClick={() => setOpenPhone(open ? null : it.phone)} className="text-xs bb-accent shrink-0">
                  текст {open ? '▲' : '▼'}
                </button>
                <button
                  onClick={() => toggleExcluded(it)}
                  title={it.excluded ? 'Вернуть в рассылку' : 'Исключить из рассылки'}
                  className="text-xs bb-ink-4 hover:bb-bad shrink-0"
                >
                  {it.excluded ? '↩︎ вернуть' : '🚫 исключить'}
                </button>
              </div>

              {open && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] bb-ink-4">
                    {it.units.map(u => `${u.unitNumber || u.code} — ${u.price} (${u.project})`).join(' · ')}
                  </div>
                  <textarea
                    value={draft}
                    onChange={e => setDrafts(d => ({ ...d, [it.phone]: e.target.value }))}
                    rows={draft.split('\n').length + 1}
                    className="w-full px-3 py-2 bb-surface-soft border bb-edge rounded-lg text-xs outline-none"
                  />
                  <div className="flex items-center gap-2">
                    {drafts[it.phone] !== undefined && (
                      <button
                        onClick={() => setDrafts(d => { const n = { ...d }; delete n[it.phone]; return n; })}
                        className="text-[11px] bb-ink-4"
                      >
                        вернуть шаблонный текст
                      </button>
                    )}
                    <a
                      href={`https://wa.me/${it.phone}?text=${encodeURIComponent(draft)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="ml-auto text-[11px] bb-accent"
                    >
                      открыть в WhatsApp вручную ↗
                    </a>
                  </div>
                  {it.last?.replyText && (
                    <div className="text-[11px] bb-ink-3 p-2 rounded-lg bb-surface-soft">
                      Ответ: {it.last.replyText.slice(0, 300)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="p-8 rounded-2xl border bb-edge bb-surface text-center bb-ink-4 text-sm">
          Нет доступных юнитов с этим фильтром.
        </div>
      )}

      {/* Юниты без телефона — чтобы никто не потерялся молча */}
      {withoutPhone.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowSkipped(v => !v)} className="text-xs bb-ink-3">
            ⚠️ Пропущено {withoutPhone.length} юнит(ов) без нормального телефона {showSkipped ? '▲' : '▼'}
          </button>
          {showSkipped && (
            <div className="mt-2 p-3 rounded-2xl border bb-edge bb-surface space-y-1">
              {withoutPhone.map((u, i) => (
                <div key={i} className="text-[11px] bb-ink-3 flex gap-2">
                  <span className="font-mono bb-accent">{u.code}</span>
                  <span className="truncate">{u.unitNumber}</span>
                  <span className="bb-ink-4 truncate">{u.name || '(без имени)'}</span>
                  <span className="ml-auto bb-ink-4">{u.phoneRaw ? `«${u.phoneRaw}»` : 'нет номера'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
