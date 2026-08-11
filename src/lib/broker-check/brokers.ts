// Брокеры для еженедельной сверки листингов — читаем ТОЛЬКО из базы IT-команды.
// Раньше это делал Apps Script по листу «Abu Dhabi»; здесь тот же смысл, но
// источник — база, и группировка идёт по номеру, а не по имени (одного брокера
// заводят с разными написаниями имени и с разным форматом номера).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.UNITS_DB_URL!);

async function readOnly<T = any>(queries: any[]): Promise<T[][]> {
  return (await sql.transaction(queries, { readOnly: true })) as T[][];
}

export interface BrokerUnit {
  code: string;
  unitNumber: string;
  project: string;
  price: string;
}

export interface Broker {
  phone: string;          // только цифры — он же ключ группировки
  phoneRaw: string;       // как записано в базе, чтобы было видно исходник
  name: string;
  language: 'RU' | 'EN';
  assistant: string;      // кто ведёт листинг (assistant_name)
  manager: string;        // старший менеджер (contacted_by)
  units: BrokerUnit[];
}

/**
 * Одного человека заводят по-разному: «Даша» и «Daria», «Наташа» и «Natalia».
 * Приводим к одному имени, иначе один и тот же ассистент разъезжается на два
 * пункта в фильтре и часть юнитов теряется.
 */
const PERSON_ALIASES: Record<string, string> = {
  'даша': 'Daria', 'дарья': 'Daria', 'daria': 'Daria', 'dasha': 'Daria',
  'наташа': 'Natalia', 'наталия': 'Natalia', 'наталья': 'Natalia', 'natalia': 'Natalia',
  'эвелина': 'Evelina', 'evelina': 'Evelina',
  'миша': 'Misha', 'михаил': 'Misha', 'mikhail': 'Misha', 'misha': 'Misha',
};

export function normalizePerson(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return PERSON_ALIASES[s.toLowerCase()] ?? s;
}

export const NO_PERSON = '—';   // значение фильтра «не задан»

/** Оставляет одни цифры. Номера в базе идут и с плюсом, и с пробелами, и с невидимыми символами. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // Локальный номер ОАЭ: 0501234567 → 971501234567, 501234567 → 971501234567
  if (digits.startsWith('0') && digits.length >= 9) return '971' + digits.slice(1);
  if (digits.length === 9) return '971' + digits;
  return digits;
}

/** 4400000 → «4.400.000 AED», как в старом скрипте. */
export function formatPrice(value: string | number | null): string {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return '—';
  return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' AED';
}

export interface LoadBrokersResult {
  brokers: Broker[];
  /** Юниты, по которым написать некому — номер пустой или мусорный («-»). */
  withoutPhone: { code: string; unitNumber: string; project: string; name: string; phoneRaw: string }[];
}

/**
 * Доступные юниты Абу-Даби, сгруппированные по телефону брокера.
 * @param assistant кто ведёт листинг (assistant_name); пусто — все, NO_PERSON — не задан
 * @param manager   старший менеджер (contacted_by); пусто — все
 */
export async function loadBrokers(assistant?: string, manager?: string): Promise<LoadBrokersResult> {
  const [rows] = await readOnly([
    sql`
      SELECT u.code, u.unit_number, u.selling_price_aed, u.manager1_name, u.manager1_phone,
             u.mailing_language::text AS lang, u.contacted_by, u.assistant_name, p.name AS project
      FROM units u
      JOIN projects p ON p.id = u.project_id
      WHERE u.emirate::text = 'Abu Dhabi'
        AND u.status::text = 'available'
      ORDER BY p.name, u.code
    `,
  ]);

  const byPhone = new Map<string, Broker>();
  const withoutPhone: LoadBrokersResult['withoutPhone'] = [];

  // Фильтруем в коде, а не в SQL: «Даша» и «Daria» — один человек, и свести их
  // в запросе значило бы прятать список синонимов внутрь SQL.
  const matches = (value: string, want?: string) => {
    if (!want) return true;
    return want === NO_PERSON ? value === '' : value === want;
  };

  for (const r of rows as any[]) {
    const asst = normalizePerson(r.assistant_name);
    const mgr = normalizePerson(r.contacted_by);
    if (!matches(asst, assistant) || !matches(mgr, manager)) continue;

    const name = String(r.manager1_name ?? '').trim();
    const phoneRaw = String(r.manager1_phone ?? '').trim();
    const phone = normalizePhone(phoneRaw);
    const unit: BrokerUnit = {
      code: String(r.code ?? ''),
      unitNumber: String(r.unit_number ?? ''),
      project: String(r.project ?? ''),
      price: formatPrice(r.selling_price_aed),
    };

    // Номер короче 10 цифр — не телефон (в базе встречается «-» и обрывки).
    if (!phone || phone.length < 10) {
      withoutPhone.push({ ...unit, name, phoneRaw });
      continue;
    }

    let b = byPhone.get(phone);
    if (!b) {
      b = {
        phone,
        phoneRaw,
        name,
        language: r.lang === 'EN' ? 'EN' : 'RU',   // язык не задан → пишем по-русски
        assistant: asst,
        manager: mgr,
        units: [],
      };
      byPhone.set(phone, b);
    }
    // Имя берём первое непустое — в части строк оно не заполнено.
    if (!b.name && name) b.name = name;
    b.units.push(unit);
  }

  const brokers = [...byPhone.values()].sort((a, b) => b.units.length - a.units.length);
  return { brokers, withoutPhone };
}

/** Ассистенты и менеджеры со счётчиками — для выпадающих списков на странице. */
export async function listPeople(): Promise<{
  assistants: { name: string; units: number }[];
  managers: { name: string; units: number }[];
}> {
  const [rows] = await readOnly([
    sql`
      SELECT assistant_name, contacted_by FROM units
      WHERE emirate::text = 'Abu Dhabi' AND status::text = 'available'
    `,
  ]);

  const count = (pick: (r: any) => string) => {
    const m = new Map<string, number>();
    for (const r of rows as any[]) {
      const key = normalizePerson(pick(r)) || NO_PERSON;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units);
  };

  return {
    assistants: count(r => r.assistant_name),
    managers: count(r => r.contacted_by),
  };
}
