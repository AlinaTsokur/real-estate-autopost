"use client";

import { useLayoutEffect, useRef, useState } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
};

type Props<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Растянуть на всю ширину контейнера — для форм. По умолчанию по содержимому. */
  full?: boolean;
  className?: string;
};

/**
 * Один переключатель на всё приложение: белая плашка физически переезжает
 * к выбранному пункту. Позицию считаем по реальным размерам кнопок, потому
 * что подписи разной длины — равные доли по 1/n съезжают.
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  full = false,
  className = '',
}: Props<T>) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = Math.max(0, options.findIndex(o => o.value === value));

  useLayoutEffect(() => {
    const measure = () => {
      const el = itemRefs.current[activeIndex];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();

    // Ширина меняется от шрифта и от размера окна — пересчитываем на оба события.
    const ro = new ResizeObserver(measure);
    itemRefs.current.forEach(el => el && ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeIndex, options.length]);

  return (
    <div
      role="tablist"
      className={`relative inline-flex p-1.5 rounded-full shrink-0 ${full ? 'w-full' : ''} ${className}`}
      style={{ background: 'var(--sky-100)' }}
    >
      {/* Едущая плашка. Прячем до первого замера, чтобы не прыгала из угла. */}
      <span
        aria-hidden
        className="absolute top-1.5 bottom-1.5 rounded-full pointer-events-none"
        style={{
          left: thumb?.left ?? 0,
          width: thumb?.width ?? 0,
          background: '#fff',
          boxShadow: 'var(--lift-2)',
          opacity: thumb ? 1 : 0,
          transition: 'left .38s var(--spring), width .38s var(--spring), opacity .2s',
        }}
      />

      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={el => { itemRefs.current[i] = el; }}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 flex items-center justify-center gap-2 px-5 py-2.5 rounded-full
              text-sm font-bold whitespace-nowrap cursor-pointer
              transition-[color,transform] duration-200 active:scale-[.96]
              ${full ? 'flex-1' : ''}`}
            style={{ color: active ? 'var(--aqua-600)' : 'var(--ink-500)' }}
          >
            {opt.icon && <span className="text-base leading-none">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
