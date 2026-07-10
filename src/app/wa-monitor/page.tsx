"use client";

import { useEffect, useState } from 'react';

interface Instance {
  id: string;
  token: string;
  name: string;
}

export default function WaMonitorPage() {
  const [triggers, setTriggers] = useState<string[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTrigger, setNewTrigger] = useState('');
  const [newInstance, setNewInstance] = useState<Instance>({ id: '', token: '', name: '' });
  const [remindDelayMinutes, setRemindDelayMinutes] = useState(2880);

  useEffect(() => {
    fetch('/api/wa-monitor/config')
      .then(r => r.json())
      .then(d => {
        setTriggers(d.triggers || []);
        setInstances(d.instances || []);
        if (typeof d.remindDelayMinutes === 'number') setRemindDelayMinutes(d.remindDelayMinutes);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);

    // Pick up a word typed in the box but not yet added via "Добавить"
    const pendingTrigger = newTrigger.trim().toLowerCase();
    const triggersToSave = pendingTrigger && !triggers.includes(pendingTrigger)
      ? [...triggers, pendingTrigger]
      : triggers;
    // Pick up an instance typed but not yet added
    const instancesToSave = newInstance.id.trim()
      ? [...instances, { ...newInstance }]
      : instances;

    if (triggersToSave !== triggers) setTriggers(triggersToSave);
    if (instancesToSave !== instances) { setInstances(instancesToSave); setNewInstance({ id: '', token: '', name: '' }); }
    setNewTrigger('');

    await fetch('/api/wa-monitor/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggers: triggersToSave, instances: instancesToSave, remindDelayMinutes })
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addTrigger = () => {
    const t = newTrigger.trim().toLowerCase();
    if (t && !triggers.includes(t)) setTriggers([...triggers, t]);
    setNewTrigger('');
  };

  const removeTrigger = (i: number) => setTriggers(triggers.filter((_, idx) => idx !== i));

  const addInstance = () => {
    if (newInstance.id.trim()) {
      setInstances([...instances, { ...newInstance }]);
      setNewInstance({ id: '', token: '', name: '' });
    }
  };

  const removeInstance = (i: number) => setInstances(instances.filter((_, idx) => idx !== i));

  if (loading) return <div className="p-8 text-white">Загрузка...</div>;

  return (
    <div className="min-h-screen bg-[#111] text-white p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">WA Monitor — настройки</h1>

      {/* Trigger words */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Триггерные слова</h2>
        <p className="text-sm text-gray-400 mb-4">
          Когда ты делаешь Reply на сообщение брокера и пишешь одно из этих слов — запрос сохраняется.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {triggers.map((t, i) => (
            <span key={i} className="flex items-center gap-1 bg-[#222] border border-[#333] rounded-full px-3 py-1 text-sm">
              {t}
              <button onClick={() => removeTrigger(i)} className="text-gray-500 hover:text-red-400 ml-1 leading-none">×</button>
            </span>
          ))}
          {triggers.length === 0 && <span className="text-gray-500 text-sm">Нет триггеров</span>}
        </div>

        <div className="flex gap-2">
          <input
            value={newTrigger}
            onChange={e => setNewTrigger(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTrigger()}
            placeholder="Новое слово..."
            className="bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm flex-1 focus:outline-none focus:border-[#555]"
          />
          <button onClick={addTrigger} className="bg-[#333] hover:bg-[#444] px-4 py-2 rounded text-sm">
            Добавить
          </button>
        </div>
      </section>

      {/* Reminder delay */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Через сколько напоминать</h2>
        <p className="text-sm text-gray-400 mb-4">
          Сколько ждать после запроса брокера, прежде чем прислать напоминание в Telegram.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '5 минут (тест)', value: 5 },
            { label: '1 день', value: 1440 },
            { label: '2 дня', value: 2880 },
            { label: '3 дня', value: 4320 },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setRemindDelayMinutes(opt.value)}
              className={`px-4 py-2 rounded text-sm border ${
                remindDelayMinutes === opt.value
                  ? 'bg-white text-black border-white'
                  : 'bg-[#1a1a1a] border-[#333] text-gray-300 hover:border-[#555]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Instances */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Green API инстансы</h2>
        <p className="text-sm text-gray-400 mb-4">
          Каждый инстанс = один WhatsApp номер. Добавь свой и коллеги.
        </p>

        <div className="space-y-2 mb-4">
          {instances.map((inst, i) => (
            <div key={i} className="flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{inst.name || 'Без имени'}</div>
                <div className="text-xs text-gray-500">ID: {inst.id} · Token: {inst.token.slice(0, 8)}...</div>
              </div>
              <button onClick={() => removeInstance(i)} className="text-gray-500 hover:text-red-400 text-sm shrink-0">
                Удалить
              </button>
            </div>
          ))}
          {instances.length === 0 && <p className="text-gray-500 text-sm">Нет инстансов</p>}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <input
            value={newInstance.name}
            onChange={e => setNewInstance({ ...newInstance, name: e.target.value })}
            placeholder="Имя (Алина)"
            className="bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#555]"
          />
          <input
            value={newInstance.id}
            onChange={e => setNewInstance({ ...newInstance, id: e.target.value })}
            placeholder="Instance ID"
            className="bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#555]"
          />
          <input
            value={newInstance.token}
            onChange={e => setNewInstance({ ...newInstance, token: e.target.value })}
            placeholder="API Token"
            className="bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#555]"
          />
        </div>
        <button onClick={addInstance} className="bg-[#333] hover:bg-[#444] px-4 py-2 rounded text-sm w-full">
          Добавить инстанс
        </button>

        <p className="text-xs text-gray-500 mt-3">
          После добавления инстанса нужно поставить вебхук в Green API консоли:<br />
          <span className="font-mono text-gray-400">https://real-estate-autopost.vercel.app/api/wa-monitor/webhook</span>
        </p>
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-white text-black font-semibold py-3 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}
      </button>
    </div>
  );
}
