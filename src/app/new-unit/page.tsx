"use client";

import { useState, useEffect, useCallback } from 'react';
import { toNumber, formatNumberLikeSheet } from '@/lib/posts/formatters';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FormState {
  projectName: string; unit: string; code: string;
  type: string; parkingSpace: string; view: string; floor: string; furnished: string;
  originalPrice: string; sellingPrice: string;
  areaM2: string; grossAreaM2: string; plotAreaM2: string;
  specification: string; finishes: string; pod: string; rowType: string; unitPosition: string;
  paymentPlan: string;
  handoverDate: string; handoverAed: string;
  payment2Date: string; payment2Aed: string;
  payment3Date: string; payment3Aed: string;
  payment4Date: string; payment4Aed: string;
  payment5Date: string; payment5Aed: string;
  payment6Date: string; payment6Aed: string;
  manager: string;
}

interface SaveResult {
  ok: boolean;
  text: string;
  folderUrl?: string;
  paymentSheetUrl?: string;
  paymentError?: string;
}

interface HandoverOption {
  building: string;
  date: string;
  isReadyToMove: boolean;
}

interface Options {
  projects: string[];
  objectKindByProject: Record<string, string>;
  buildingsByProject: Record<string, string[]>;
  floors: string[]; types: string[]; paymentPlans: string[];
  furnishedOptions: string[]; specificationOptions: string[]; finishesOptions: string[];
  rowOptions: string[]; unitPositionOptions: string[];
  statusOptions: string[]; mortgageOptions: string[]; podOptions: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY: FormState = {
  projectName: '', unit: '', code: '',
  type: '', parkingSpace: '1', view: '', floor: '', furnished: '',
  originalPrice: '', sellingPrice: '',
  areaM2: '', grossAreaM2: '', plotAreaM2: '',
  specification: '', finishes: '', pod: '', rowType: '', unitPosition: '',
  paymentPlan: '',
  handoverDate: '', handoverAed: '',
  payment2Date: '', payment2Aed: '',
  payment3Date: '', payment3Aed: '',
  payment4Date: '', payment4Aed: '',
  payment5Date: '', payment5Aed: '',
  payment6Date: '', payment6Aed: '',
  manager: '',
};

// ─── Russian → English keyboard transliteration ──────────────────────────────

const RU_EN: Record<string, string> = {
  'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p','х':'[','ъ':']',
  'ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k','д':'l','ж':';','э':"'",
  'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m','б':',','ю':'.',
  'Й':'Q','Ц':'W','У':'E','К':'R','Е':'T','Н':'Y','Г':'U','Ш':'I','Щ':'O','З':'P','Х':'{','Ъ':'}',
  'Ф':'A','Ы':'S','В':'D','А':'F','П':'G','Р':'H','О':'J','Л':'K','Д':'L','Ж':':','Э':'"',
  'Я':'Z','Ч':'X','С':'C','М':'V','И':'B','Т':'N','Ь':'M','Б':'<','Ю':'>',
};

function transliterateRuEn(s: string): string {
  return s.split('').map(c => RU_EN[c] ?? c).join('');
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseAedPreview(value: string): string {
  const s = value.trim().replace(/\s/g, '');
  if (!s) return '';

  const mMatch = s.match(/^([\d.,]+)[Mm]$/);
  if (mMatch) {
    const n = toNumber(mMatch[1]);
    if (n === '') return '';
    return formatNumberLikeSheet(Number(n) * 1_000_000) + ' AED';
  }
  const kMatch = s.match(/^([\d.,]+)[Kk]$/);
  if (kMatch) {
    const n = toNumber(kMatch[1]);
    if (n === '') return '';
    return formatNumberLikeSheet(Number(n) * 1_000) + ' AED';
  }

  const n = toNumber(s);
  if (n === '') return '';
  return formatNumberLikeSheet(n) + ' AED';
}

function parseDateHint(value: string): string {
  const s = value.trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2}|\d{4})$/);
  if (!m) return '';
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (month < 1 || month > 12) return '';
  return `${months[month - 1]} ${year}`;
}

function calcDealTag(orig: string, sell: string): { label: string; color: 'red' | 'amber' } | null {
  const o = toNumber(orig.replace(/[MmKk].*$/, ''));
  const s = toNumber(sell.replace(/[MmKk].*$/, ''));
  if (o === '' || s === '' || Number(o) === 0) return null;
  if (Number(s) <= Number(o)) return { label: 'Quick Sale', color: 'red' };
  if ((Number(s) - Number(o)) / Number(o) <= 0.10) return { label: 'Hot Price', color: 'amber' };
  return null;
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const BASE_INPUT = 'w-full px-3 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder-slate-500';
const SELECT_INPUT = BASE_INPUT + ' appearance-none cursor-pointer';
const LABEL = 'block text-xs font-medium text-slate-400 mb-1.5';

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({ title, dot, children }: { title: string; dot: string; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-sm font-semibold text-slate-200">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

function PriceInput({ label, value, onChange, accent }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  accent?: boolean;
}) {
  const preview = parseAedPreview(value);
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder="1 500 000 / 1,500,000 / 1.5M"
        className={BASE_INPUT + (accent ? ' text-emerald-400 font-medium' : '')}
      />
      {preview && (
        <p className="mt-1 text-[11px] text-slate-500">
          → <span className="text-slate-300 font-medium">{preview}</span>
        </p>
      )}
    </div>
  );
}

function DateInput({ label, value, onChange }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const hint = parseDateHint(value);
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder="30/06/2026 или Ready to move"
        className={BASE_INPUT}
      />
      {hint && (
        <p className="mt-1 text-[11px] text-slate-500">
          → <span className="text-slate-300">{hint}</span>
        </p>
      )}
    </div>
  );
}

function SelOrInput({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  options?: string[];
  placeholder?: string;
}) {
  if (options && options.length > 0) {
    return (
      <select value={value} onChange={onChange as (e: React.ChangeEvent<HTMLSelectElement>) => void} className={SELECT_INPUT}>
        <option value="">— выбрать —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input value={value} onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
      placeholder={placeholder} className={BASE_INPUT} />
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function NewUnitPage() {
  const [options, setOptions] = useState<Options | null>(null);
  const [optLoading, setOptLoading] = useState(true);
  const [optError, setOptError] = useState('');

  const [form, setForm] = useState<FormState>(EMPTY);

  const [loadCode, setLoadCode] = useState('');
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');

  const handleLoadRow = async () => {
    if (!loadCode.trim()) return;
    setLoadStatus('loading');
    try {
      const res = await fetch(`/api/new-unit/load-row?code=${encodeURIComponent(loadCode.trim())}`);
      const d = await res.json();
      if (!d.found) { setLoadStatus('notfound'); return; }
      const newCode = loadCode.trim().startsWith('#') ? loadCode.trim() : '#' + loadCode.trim();
      setForm(prev => ({
        ...prev,
        code:          newCode,
        projectName:   d.projectName   || prev.projectName,
        unit:          d.unit          || prev.unit,
        originalPrice: d.originalPrice || prev.originalPrice,
        sellingPrice:  d.sellingPrice  || prev.sellingPrice,
        manager:       d.manager       || prev.manager,
      }));
      if (d.projectName) setProjectSearch(d.projectName);
      setLoadStatus('found');
    } catch {
      setLoadStatus('notfound');
    }
  };

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [showPayments, setShowPayments] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [handoverAuto, setHandoverAuto] = useState(false);
  const [handoverOptions, setHandoverOptions] = useState<HandoverOption[]>([]);
  const [handoverReadyToMove, setHandoverReadyToMove] = useState(false);
  const [selectedHandoverBuilding, setSelectedHandoverBuilding] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/new-unit/options')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setOptions(d); })
      .catch(e => setOptError(e.message))
      .finally(() => setOptLoading(false));
  }, []);

  const up = useCallback(
    (field: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value })),
    []
  );

  const isVilla = options?.objectKindByProject[form.projectName] === 'Villa';
  const dealTag = calcDealTag(form.originalPrice, form.sellingPrice);

  // Auto-fill Handover Date from CONFIG2 when code has 4+ digits
  useEffect(() => {
    const prefix = form.code.replace(/\D/g, '').slice(0, 4);
    if (!form.projectName || prefix.length < 4) {
      setHandoverOptions([]);
      setHandoverReadyToMove(false);
      return;
    }

    fetch(`/api/new-unit/handover?project=${encodeURIComponent(form.projectName)}&code=${encodeURIComponent(form.code)}`)
      .then(r => r.json())
      .then(d => {
        const opts: HandoverOption[] = d.options ?? [];
        setHandoverOptions(opts);

        // All options are "Ready to move" — show badge, don't fill date
        if (opts.length > 0 && opts.every(o => o.isReadyToMove)) {
          setHandoverReadyToMove(true);
          return;
        }
        setHandoverReadyToMove(false);

        // Single non-RTM option → auto-fill
        const nonRtm = opts.filter(o => !o.isReadyToMove);
        if (nonRtm.length === 1) {
          setForm(prev => ({ ...prev, handoverDate: nonRtm[0].date }));
          setHandoverAuto(true);
        }
        // Multiple → show picker (handled in JSX)
      })
      .catch(() => {});
  }, [form.code, form.projectName]);

  // Auto-fill Payment 2-6 + Handover AED from OBJECTS when code has 4+ digits
  useEffect(() => {
    const prefix = form.code.replace(/\D/g, '').slice(0, 4);
    if (prefix.length < 4) return;

    fetch(`/api/new-unit/payments?project=${encodeURIComponent(form.projectName)}&code=${encodeURIComponent(form.code)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.found) return;
        setForm(prev => ({
          ...prev,
          ...(d.handoverAed   && !prev.handoverAed   ? { handoverAed:   d.handoverAed   } : {}),
          ...(d.payment2Date  && !prev.payment2Date  ? { payment2Date:  d.payment2Date  } : {}),
          ...(d.payment2Aed   && !prev.payment2Aed   ? { payment2Aed:   d.payment2Aed   } : {}),
          ...(d.payment3Date  && !prev.payment3Date  ? { payment3Date:  d.payment3Date  } : {}),
          ...(d.payment3Aed   && !prev.payment3Aed   ? { payment3Aed:   d.payment3Aed   } : {}),
          ...(d.payment4Date  && !prev.payment4Date  ? { payment4Date:  d.payment4Date  } : {}),
          ...(d.payment4Aed   && !prev.payment4Aed   ? { payment4Aed:   d.payment4Aed   } : {}),
          ...(d.payment5Date  && !prev.payment5Date  ? { payment5Date:  d.payment5Date  } : {}),
          ...(d.payment5Aed   && !prev.payment5Aed   ? { payment5Aed:   d.payment5Aed   } : {}),
          ...(d.payment6Date  && !prev.payment6Date  ? { payment6Date:  d.payment6Date  } : {}),
          ...(d.payment6Aed   && !prev.payment6Aed   ? { payment6Aed:   d.payment6Aed   } : {}),
        }));
        if (d.payment2Date || d.payment3Date || d.payment4Date || d.payment5Date || d.payment6Date) {
          setShowPayments(true);
        }
      })
      .catch(() => {});
  }, [form.code, form.projectName]);

  // Project search with Ru→En transliteration
  const handleProjectSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const converted = transliterateRuEn(raw);
    setProjectSearch(converted);
    setDropdownOpen(true);
  };

  const filteredProjects = (options?.projects ?? []).filter(p =>
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const selectProject = (p: string) => {
    setForm(prev => ({ ...prev, projectName: p, floor: '', furnished: '' }));
    setProjectSearch(p);
    setDropdownOpen(false);
  };

  const clearForm = () => {
    setForm(EMPTY);
    setProjectSearch('');
    setSaveResult(null);
    setShowPayments(false);
    setHandoverAuto(false);
    setHandoverOptions([]);
    setHandoverReadyToMove(false);
    setSelectedHandoverBuilding(null);
  };

  const validate = (): string => {
    if (!form.projectName)  return 'Выбери Project';
    if (!form.code)         return 'Заполни Код объекта';
    if (!form.unit)         return 'Заполни Номер юнита';
    if (!isVilla && !form.view) return 'Заполни Вид';
    if (!isVilla && !form.areaM2) return 'Заполни Площадь (Area, m²)';
    if (!form.sellingPrice) return 'Заполни Selling Price';
    if (!form.manager)      return 'Заполни Менеджера';
    return '';
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setSaveResult({ ok: false, text: err }); return; }

    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/new-unit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaveResult({
        ok: true,
        text: `Юнит сохранён! ${data.updatedRange ? `(${data.updatedRange})` : ''}`,
        folderUrl: data.folderUrl,
        paymentSheetUrl: data.paymentSheetUrl,
        paymentError: data.paymentError,
      });
      setForm(EMPTY);
      setProjectSearch('');
    } catch (e: any) {
      setSaveResult({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">New Unit</h1>
          <p className="text-slate-400 text-sm">
            Заполни поля — цены и площади принимаются в любом формате.
            Черновик сохраняется автоматически.
          </p>
        </div>
        <button
          type="button"
          onClick={clearForm}
          className="shrink-0 mt-1 px-4 py-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
        >
          Сбросить форму
        </button>
      </div>

      {/* ── Загрузить из рабочей таблицы ── */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 mb-6 flex gap-3 items-center">
        <input
          type="text"
          value={loadCode}
          onChange={e => { setLoadCode(e.target.value); setLoadStatus('idle'); }}
          onKeyDown={e => e.key === 'Enter' && handleLoadRow()}
          placeholder="Введи код (#010511) — подтянет данные из таблицы"
          className={BASE_INPUT + ' flex-1'}
        />
        <button
          type="button"
          onClick={handleLoadRow}
          disabled={loadStatus === 'loading'}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loadStatus === 'loading' ? '...' : 'Загрузить'}
        </button>
        {loadStatus === 'found' && <span className="text-emerald-400 text-sm shrink-0">✓ Данные подтянуты</span>}
        {loadStatus === 'notfound' && <span className="text-rose-400 text-sm shrink-0">Не найдено</span>}
      </div>

      {optLoading && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/60 border border-white/5 mb-6 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
          Загружаю справочники...
        </div>
      )}
      {optError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-6">
          Ошибка загрузки справочников: {optError}
        </div>
      )}

      {/* Save status */}
      {saveResult && (
        <div className={`p-4 rounded-xl border text-sm mb-6 ${
          saveResult.ok
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          <div className="flex items-start gap-2">
            {saveResult.ok
              ? <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              : <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            }
            <span>{saveResult.text}</span>
          </div>
          {saveResult.ok && (saveResult.folderUrl || saveResult.paymentSheetUrl) && (
            <div className="mt-3 flex flex-col gap-1.5 pl-7">
              {saveResult.folderUrl && (
                <a
                  href={saveResult.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
                  Открыть папку в Drive
                </a>
              )}
              {saveResult.paymentSheetUrl && (
                <a
                  href={saveResult.paymentSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H9L5 8v10a2 2 0 002 2z"/></svg>
                  Открыть Payment Plan
                </a>
              )}
            </div>
          )}
          {saveResult.paymentError && (
            <div className="mt-2 pl-7 text-xs text-amber-400">
              Внимание: ошибка создания Payment Plan — {saveResult.paymentError}
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">

        {/* ── Section 1: Объект ── */}
        <SectionCard title="Объект" dot="bg-indigo-500">

          {/* Project — full width */}
          <div className="col-span-2">
            <label className={LABEL}>Проект *</label>
            <div className="relative">
              <input
                type="text"
                value={projectSearch}
                onChange={handleProjectSearch}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="Начни вводить (можно русскими буквами)..."
                className={BASE_INPUT}
              />
              {dropdownOpen && filteredProjects.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-white/10 rounded-xl shadow-2xl shadow-black/60 max-h-52 overflow-y-auto p-1">
                  {filteredProjects.map(p => (
                    <div
                      key={p}
                      onMouseDown={() => selectProject(p)}
                      className={`px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                        form.projectName === p
                          ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >{p}</div>
                  ))}
                </div>
              )}
            </div>
            {isVilla && (
              <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                <span>🏡</span> Villa / Townhouse проект — дополнительные поля показаны ниже
              </p>
            )}
          </div>

          {/* Unit */}
          <div>
            <label className={LABEL}>Номер юнита *</label>
            <input value={form.unit} onChange={up('unit')} placeholder="101" className={BASE_INPUT} />
          </div>

          {/* Code */}
          <div>
            <label className={LABEL}>Код объекта *</label>
            <input
              value={form.code}
              onChange={e => {
                const v = e.target.value;
                const clean = v.startsWith('#') ? v : '#' + v.replace(/^#+/, '');
                setForm(prev => ({ ...prev, code: clean }));
              }}
              placeholder="#1001-01"
              className={BASE_INPUT}
            />
          </div>

          {/* Type */}
          <div>
            <label className={LABEL}>Тип</label>
            <SelOrInput value={form.type} onChange={up('type')} options={options?.types} placeholder="Studio, 1BR, 2BR..." />
          </div>

          {/* Parking */}
          <div>
            <label className={LABEL}>Парковочных мест</label>
            <input value={form.parkingSpace} onChange={up('parkingSpace')} placeholder="1" className={BASE_INPUT} />
          </div>

          {/* View */}
          {!isVilla && (
            <div>
              <label className={LABEL}>Вид *</label>
              <input value={form.view} onChange={up('view')} placeholder="Sea view, Garden view..." className={BASE_INPUT} />
            </div>
          )}

          {/* Floor */}
          {!isVilla && (
            <div>
              <label className={LABEL}>Этаж</label>
              <SelOrInput value={form.floor} onChange={up('floor')} options={options?.floors} placeholder="High Floor..." />
            </div>
          )}

          {/* Furnished */}
          <div className="col-span-2">
            <label className={LABEL}>Мебель</label>
            <SelOrInput value={form.furnished} onChange={up('furnished')} options={options?.furnishedOptions} placeholder="Furnished / Unfurnished" />
          </div>

        </SectionCard>

        {/* ── Section 2: Villa fields (conditional) ── */}
        {isVilla && (
          <SectionCard title="Villa — площадь и характеристики" dot="bg-amber-500">
            <div>
              <label className={LABEL}>Gross Area, m²</label>
              <input value={form.grossAreaM2} onChange={up('grossAreaM2')} placeholder="350.50" className={BASE_INPUT} />
            </div>
            <div>
              <label className={LABEL}>Plot Area, m²</label>
              <input value={form.plotAreaM2} onChange={up('plotAreaM2')} placeholder="500" className={BASE_INPUT} />
            </div>
            <div>
              <label className={LABEL}>Specification</label>
              <SelOrInput value={form.specification} onChange={up('specification')} options={options?.specificationOptions} placeholder="Standard..." />
            </div>
            <div>
              <label className={LABEL}>Finishes</label>
              <SelOrInput value={form.finishes} onChange={up('finishes')} options={options?.finishesOptions} placeholder="Premium..." />
            </div>
            <div>
              <label className={LABEL}>POD</label>
              <SelOrInput value={form.pod} onChange={up('pod')} options={options?.podOptions} placeholder="Yes / No" />
            </div>
            <div>
              <label className={LABEL}>Row</label>
              <SelOrInput value={form.rowType} onChange={up('rowType')} options={options?.rowOptions} placeholder="Front row..." />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Unit Position</label>
              <SelOrInput value={form.unitPosition} onChange={up('unitPosition')} options={options?.unitPositionOptions} placeholder="Corner, Middle, End..." />
            </div>
          </SectionCard>
        )}

        {/* ── Section 3: Цены ── */}
        <SectionCard title="Цены" dot="bg-emerald-500">
          <PriceInput label="Original Price, AED" value={form.originalPrice} onChange={up('originalPrice')} />

          <div>
            <PriceInput label="Selling Price, AED *" value={form.sellingPrice} onChange={up('sellingPrice')} accent />
            {dealTag && (
              <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                dealTag.color === 'red'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
              }`}>
                {dealTag.color === 'red' ? '⚡' : '🔥'} {dealTag.label}
              </div>
            )}
          </div>

          {!isVilla && (
            <div>
              <label className={LABEL}>Area, m² *</label>
              <input value={form.areaM2} onChange={up('areaM2')} placeholder="85.50" className={BASE_INPUT} />
            </div>
          )}
        </SectionCard>

        {/* ── Section 4: Сделка ── */}
        <SectionCard title="Сделка" dot="bg-blue-400">
          <div className="col-span-2">
            <label className={LABEL}>Payment Plan</label>
            <SelOrInput value={form.paymentPlan} onChange={up('paymentPlan')} options={options?.paymentPlans} placeholder="30/70, 50/50..." />
          </div>
        </SectionCard>

        {/* ── Section 5: График платежей (collapsible) ── */}
        <div className="rounded-2xl bg-slate-900/60 border border-white/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPayments(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-sm font-semibold text-slate-200">График платежей</span>
              <span className="text-xs text-slate-500 ml-1">Handover + Payment 6 → 2</span>
            </div>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showPayments ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPayments && (
            <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
              {/* Handover first */}
              <div>
                <p className="text-xs font-semibold text-purple-300 mb-3 uppercase tracking-wide">Handover</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className={LABEL.replace('mb-1.5', '')}>Handover Date</label>
                      {handoverAuto && !handoverReadyToMove && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-medium">авто</span>
                      )}
                      {handoverReadyToMove && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">Ready to move</span>
                      )}
                    </div>

                    {/* Multiple options picker */}
                    {handoverOptions.filter(o => !o.isReadyToMove).length > 1 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {handoverOptions.filter(o => !o.isReadyToMove).map(o => (
                          <button
                            key={o.building + o.date}
                            type="button"
                            onClick={() => { setForm(prev => ({ ...prev, handoverDate: o.date })); setHandoverAuto(true); setSelectedHandoverBuilding(o.building + o.date); }}
                            className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                              selectedHandoverBuilding === o.building + o.date
                                ? 'bg-indigo-500/25 border-indigo-500/50 text-indigo-300'
                                : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            {o.building ? `${o.building} — ` : ''}{o.date}
                          </button>
                        ))}
                      </div>
                    )}

                    <input
                      type="text"
                      value={form.handoverDate}
                      onChange={e => { setHandoverAuto(false); setSelectedHandoverBuilding(null); up('handoverDate')(e); }}
                      placeholder="31/12/2026"
                      className={BASE_INPUT}
                    />
                  </div>
                  <PriceInput label="Handover AED" value={form.handoverAed} onChange={up('handoverAed')} />
                </div>
              </div>
              {/* Payment 6 → 2 descending */}
              {([6, 5, 4, 3, 2] as const).map(n => (
                <div key={n} className="grid grid-cols-2 gap-4">
                  <DateInput
                    label={`Payment ${n} Date`}
                    value={(form as any)[`payment${n}Date`]}
                    onChange={up(`payment${n}Date` as keyof FormState)}
                  />
                  <PriceInput
                    label={`Payment ${n} AED`}
                    value={(form as any)[`payment${n}Aed`]}
                    onChange={up(`payment${n}Aed` as keyof FormState)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 6: Прочее ── */}
        <SectionCard title="Прочее" dot="bg-slate-400">
          <div className="col-span-2">
            <label className={LABEL}>Менеджер *</label>
            <input value={form.manager} onChange={up('manager')} placeholder="Nataly" className={BASE_INPUT} />
          </div>
        </SectionCard>

        {/* ── Actions ── */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={handleSave}
            disabled={saving || optLoading}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Сохраняю...
              </>
            ) : '💾 Сохранить в OBJECTS'}
          </button>
          <button
            type="button"
            onClick={clearForm}
            className="px-5 py-3.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-sm font-medium shrink-0"
          >
            Очистить
          </button>
        </div>

      </div>
    </div>
  );
}
