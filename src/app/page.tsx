import { ArrowRight, Calculator, FileText, PenTool, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col h-full items-center justify-center relative -mt-16 min-h-[calc(100vh-4rem)]">
      
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-2xl px-4 relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-4 backdrop-blur-md">
          <Sparkles className="w-4 h-4" />
          <span>Real Estate Automation Engine</span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
          Supercharge your <br /> Property Postings
        </h1>
        
        <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
          Select a tool below to automatically generate perfectly formatted posts, calculate budgets, and keep your Telegram channels updated in seconds.
        </p>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8 text-left">
          <Link href="/manual-post" className="group relative p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800/50 border border-white/5 hover:border-indigo-500/30 transition-all duration-300 backdrop-blur-sm flex flex-col gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
              <PenTool className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Manual Post</h3>
            <p className="text-sm text-slate-400">Generate a full real estate post from a unit code.</p>
            <ArrowRight className="w-4 h-4 text-indigo-400 absolute bottom-6 right-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>

          <Link href="/budget" className="group relative p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800/50 border border-white/5 hover:border-emerald-500/30 transition-all duration-300 backdrop-blur-sm flex flex-col gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
              <Calculator className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Budget Builder</h3>
            <p className="text-sm text-slate-400">Calculate downpayments and 1% monthly plans.</p>
            <ArrowRight className="w-4 h-4 text-emerald-400 absolute bottom-6 right-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>

          <Link href="/reduced-price" className="group relative p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800/50 border border-white/5 hover:border-rose-500/30 transition-all duration-300 backdrop-blur-sm flex flex-col gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-400 group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Reduced Price</h3>
            <p className="text-sm text-slate-400">Strikeout old prices and link to previous messages.</p>
            <ArrowRight className="w-4 h-4 text-rose-400 absolute bottom-6 right-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>
        </div>
      </div>
    </div>
  );
}
