import Link from 'next/link';

// Карточки повторяют разделы меню. Описания намеренно короткие и по факту —
// прежний текст остался от ранней версии и врал: обещал расчёт первого взноса
// и плана 1% в месяц, чего рассылка никогда не делала.
const tools = [
  {
    href: '/manual-post',
    icon: '✏️',
    title: 'Посты',
    text: 'Собрать пост по юниту из базы или из C3 и отправить на проверку в Telegram.',
    tint: 'bb-tint-accent bb-accent',
  },
  {
    href: '/budget',
    icon: '💰',
    title: 'Рассылки',
    text: 'Подборка по проекту — самый дешёвый юнит каждого типа — и Quick Sales. Уходит в группы WhatsApp.',
    tint: 'bb-tint-ok bb-ok',
  },
  {
    href: '/broker-check',
    icon: '🤝',
    title: 'Сверка брокеров',
    text: 'Еженедельный опрос: актуальны ли цены и доступны ли юниты. Видно, кто ответил.',
    tint: 'bb-tint-accent bb-accent',
  },
  {
    href: '/no-posts',
    icon: '📝',
    title: 'Юниты без постов',
    text: 'Что ещё ни разу не публиковали. Клик по юниту открывает готовый пост.',
    tint: 'bb-tint-warn bb-warn',
  },
  {
    href: '/catalog',
    icon: '📄',
    title: 'Каталог',
    text: 'Карточки для каталога WhatsApp в Meta и таблица с текстами для ручного ввода.',
    tint: 'bb-tint-ok bb-ok',
  },
  {
    href: '/project-emoji',
    icon: '🎨',
    title: 'Проекты',
    text: 'Смайлик проекта и папка с фотографиями — из них собираются посты и каталог.',
    tint: 'bb-tint-accent bb-accent',
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto w-full py-10">
      <div className="text-center space-y-3 mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: 'var(--ink-900)' }}>
          AutoPost
        </h1>
        <p className="text-lg bb-ink-3 max-w-xl mx-auto leading-relaxed">
          Посты, рассылки и каталог по юнитам Абу-Даби — из базы, без ручного переписывания.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
        {tools.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className="group relative p-6 rounded-2xl bb-surface border bb-edge bb-card-hover transition-all flex flex-col gap-3"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border bb-edge text-lg ${t.tint}`}>
              {t.icon}
            </div>
            <h3 className="text-lg font-semibold bb-ink">{t.title}</h3>
            <p className="text-sm bb-ink-3">{t.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
