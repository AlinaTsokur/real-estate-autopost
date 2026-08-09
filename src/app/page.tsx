import { ArrowRight, Calculator, FileText, PenTool, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col h-full items-center justify-center relative -mt-16 min-h-[calc(100vh-4rem)]">
      
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-2xl px-4 relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bb-tint-accent border bb-edge bb-accent text-sm font-medium mb-4">
          <Sparkles className="w-4 h-4" />
          <span>Real Estate Automation Engine</span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bb-fill-accent from-white">
          Supercharge your <br /> Property Postings
        </h1>
        
        <p className="text-lg bb-ink-3 max-w-xl mx-auto leading-relaxed">
          Select a tool below to automatically generate perfectly formatted posts, calculate budgets, and keep your Telegram channels updated in seconds.
        </p>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8 text-left">
          <Link href="/manual-post" className="group relative p-6 rounded-2xl bb-surface hover:bb-surface-soft border bb-edge hover:bb-edge transition-all duration-300 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-lg bb-tint-accent flex items-center justify-center border bb-edge bb-accent group-hover:scale-110 transition-transform">
              <PenTool className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold bb-ink">Manual Post</h3>
            <p className="text-sm bb-ink-3">Generate a full real estate post from a unit code.</p>
            <ArrowRight className="w-4 h-4 bb-accent absolute bottom-6 right-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>

          <Link href="/budget" className="group relative p-6 rounded-2xl bb-surface hover:bb-surface-soft border bb-edge hover:bb-edge transition-all duration-300 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-lg bb-tint-ok flex items-center justify-center border bb-edge bb-ok group-hover:scale-110 transition-transform">
              <Calculator className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold bb-ink">Budget Builder</h3>
            <p className="text-sm bb-ink-3">Calculate downpayments and 1% monthly plans.</p>
            <ArrowRight className="w-4 h-4 bb-ok absolute bottom-6 right-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>

          <Link href="/reduced-price" className="group relative p-6 rounded-2xl bb-surface hover:bb-surface-soft border bb-edge hover:bb-edge transition-all duration-300 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-lg bb-tint-bad flex items-center justify-center border bb-edge bb-bad group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold bb-ink">Reduced Price</h3>
            <p className="text-sm bb-ink-3">Strikeout old prices and link to previous messages.</p>
            <ArrowRight className="w-4 h-4 bb-bad absolute bottom-6 right-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>
        </div>
      </div>
    </div>
  );
}
