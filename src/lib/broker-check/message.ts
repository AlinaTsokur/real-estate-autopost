// Тексты сверки. Шаблоны редактируются на странице и лежат в нашей базе —
// формулировки принадлежат Даше, а не коду.
import { Broker } from './brokers';

export const DEFAULT_TEMPLATE_RU = `Здравствуйте, {name}🙂

{question}

{list}

Спасибо!`;

export const DEFAULT_TEMPLATE_EN = `Hello, {name}🙂

{question}

{list}

Thank you, and I look forward to your update!`;

export const DEFAULT_QUESTION_RU_ONE =
  'Провожу еженедельную сверку листинга. Подскажите, пожалуйста, этот юнит ещё доступен и цена актуальна?';
export const DEFAULT_QUESTION_RU_MANY =
  'Провожу еженедельную сверку листинга. Подскажите, пожалуйста, эти юниты ещё доступны и цены актуальны?';
export const DEFAULT_QUESTION_EN_ONE =
  'I’m doing a quick weekly listing check. Could you please confirm whether this unit is still available and advise if there have been any changes to the pricing?';
export const DEFAULT_QUESTION_EN_MANY =
  'I’m doing a quick weekly listing check. Could you please confirm whether these units are still available and advise if there have been any changes to the pricing?';

export interface Templates {
  templateRu: string;
  templateEn: string;
  questionRuOne: string;
  questionRuMany: string;
  questionEnOne: string;
  questionEnMany: string;
}

export const DEFAULT_TEMPLATES: Templates = {
  templateRu: DEFAULT_TEMPLATE_RU,
  templateEn: DEFAULT_TEMPLATE_EN,
  questionRuOne: DEFAULT_QUESTION_RU_ONE,
  questionRuMany: DEFAULT_QUESTION_RU_MANY,
  questionEnOne: DEFAULT_QUESTION_EN_ONE,
  questionEnMany: DEFAULT_QUESTION_EN_MANY,
};

/** Первое слово имени: «Ирина Мейдман» → «Ирина». */
export function firstName(fullName: string): string {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

export function buildMessage(broker: Broker, t: Templates = DEFAULT_TEMPLATES): string {
  const one = broker.units.length === 1;
  const list = broker.units
    .map((u, i) => `${i + 1}. ${u.unitNumber || u.code} – ${u.price}`)
    .join('\n');

  const [tpl, question] =
    broker.language === 'EN'
      ? [t.templateEn, one ? t.questionEnOne : t.questionEnMany]
      : [t.templateRu, one ? t.questionRuOne : t.questionRuMany];

  return tpl
    .replace(/\{name\}/g, firstName(broker.name))
    .replace(/\{question\}/g, question)
    .replace(/\{list\}/g, list)
    .replace(/\{count\}/g, String(broker.units.length));
}
