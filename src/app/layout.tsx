import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: 'Real Estate AutoPost',
  description: 'Automated real estate publishing',
};

const navItems = [
  { href: '/new-unit', label: 'New Unit', icon: '➕' },
  { href: '/manual-post', label: 'Manual Post Builder', icon: '✏️' },
  { href: '/budget', label: 'Budget Builder', icon: '💰' },
  { href: '/catalog', label: 'Catalog Builder', icon: '📄' },
  { href: '/quick-sales', label: 'Quick Sales', icon: '⚡' },
  { href: '/drive-audit', label: 'Drive Audit', icon: '📂' },
  { href: '/wa-monitor', label: 'WA Monitor', icon: '📌' },
  { href: '/project-emoji', label: 'Смайлики проектов', icon: '🎨' },
  { href: '/no-posts', label: 'Юниты без постов', icon: '📝' },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <div className="flex h-screen w-full overflow-hidden bg-slate-950 relative">
          {/* Ambient Background Glow */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-white/5 bg-slate-900/60 backdrop-blur-xl flex flex-col z-20">
            {/* Logo */}
            <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-600/20 text-sm">
                ✨
              </div>
              <span className="font-semibold text-white tracking-tight text-[15px]">AutoPost Pro</span>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-all duration-200"
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}

              <div className="pt-6 pb-2 px-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Automations</span>
              </div>
              <Link
                href="/scheduled"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-green-300 hover:text-green-200 hover:bg-green-600/10 transition-all duration-200"
              >
                <span className="text-base">💬</span>
                <span>WA Schedule</span>
              </Link>
            </nav>
          </aside>

          {/* Main */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10">
            <header className="h-16 shrink-0 border-b border-white/5 bg-slate-900/40 backdrop-blur-md" />
            <main className="flex-1 overflow-auto overflow-x-hidden p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
