import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';
import NavLink from '@/components/NavLink';

// Круглый дружелюбный гротеск — на нём держится вся «мультяшность».
const nunito = Nunito({
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Real Estate AutoPost',
  description: 'Automated real estate publishing',
};

const navItems = [
  { href: '/new-unit', label: 'Новый юнит', icon: '➕' },
  { href: '/manual-post', label: 'Посты', icon: '✏️' },
  { href: '/budget', label: 'Рассылки', icon: '💰' },
  { href: '/catalog', label: 'Каталог', icon: '📄' },
  { href: '/drive-audit', label: 'Аудит Drive', icon: '📂' },
  { href: '/wa-monitor', label: 'WA Монитор', icon: '📌' },
  { href: '/plan-crop', label: 'Кадр планировок', icon: '🖼️' },
  { href: '/project-emoji', label: 'Проекты', icon: '🎨' },
  { href: '/no-posts', label: 'Юниты без постов', icon: '📝' },
  { href: '/broker-check', label: 'Сверка брокеров', icon: '🤝' },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${nunito.variable} font-sans antialiased`}
        style={{ background: 'var(--sky-100)', color: 'var(--ink-900)' }}
      >
        <div className="flex h-screen w-full overflow-hidden relative">
          {/* Мягкие цветные пятна — дают глубину, но не отвлекают */}
          <div
            className="absolute -top-[15%] -left-[5%] w-[45%] h-[45%] rounded-full blur-[130px] pointer-events-none"
            style={{ background: 'rgba(45, 212, 191, .30)' }}
          />
          <div
            className="absolute -bottom-[15%] -right-[5%] w-[45%] h-[45%] rounded-full blur-[130px] pointer-events-none"
            style={{ background: 'rgba(253, 205, 211, .38)' }}
          />

          {/* ── Боковое меню ── */}
          <aside className="w-64 shrink-0 flex flex-col z-20 p-3">
            <div className="bb-card flex flex-col h-full overflow-hidden">
              <div className="h-16 flex items-center gap-3 px-5 shrink-0">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-2xl text-base"
                  style={{ background: 'var(--aqua-400)', boxShadow: 'var(--glow-aqua)' }}
                >
                  ✨
                </div>
                <span className="bb-title text-[16px]">AutoPost</span>
              </div>

              <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
                {navItems.map(item => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
                ))}

                <div className="pt-5 pb-1 px-3">
                  <span
                    className="text-[11px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--ink-300)' }}
                  >
                    Автоматизация
                  </span>
                </div>
                <NavLink href="/scheduled" icon="💬" label="Расписание WA" />
              </nav>
            </div>
          </aside>

          {/* ── Основная область ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10">
            <main className="flex-1 overflow-auto overflow-x-hidden p-6 pl-3">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
