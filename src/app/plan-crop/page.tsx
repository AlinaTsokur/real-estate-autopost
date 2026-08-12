'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* Кадрирование планировок под пост: две картинки рядом, каждая обрезается
   под 520×728, скачивается отдельным JPG в двойном размере (1040×1456). */

const FRAME_W = 520;
const FRAME_H = 728;
const EXPORT_SCALE = 2;

// Рамка на экране — ровно половина целевого размера, пропорции те же.
const VIEW_W = 300;
const VIEW_H = (VIEW_W * FRAME_H) / FRAME_W; // 420
const D = VIEW_W / FRAME_W;                  // экранные px → координаты рамки

const JPEG_QUALITY = 0.92;
const MIN_OVERLAP = 60; // сколько картинки обязано остаться в рамке

interface Shot {
  img: HTMLImageElement;
  src: string;
  base: string;   // имя файла без расширения
  nw: number;     // натуральный размер
  nh: number;
  s: number;      // масштаб: 1 = натуральный размер в координатах рамки
  tx: number;     // левый верхний угол картинки в координатах рамки
  ty: number;
}

type Updater = (s: Shot) => Shot;

const coverScale = (nw: number, nh: number) => Math.max(FRAME_W / nw, FRAME_H / nh);
const containScale = (nw: number, nh: number) => Math.min(FRAME_W / nw, FRAME_H / nh);

/** Ставит картинку по центру рамки с заданным масштабом. */
function centered(shot: Shot, s: number): Shot {
  return {
    ...shot,
    s,
    tx: (FRAME_W - shot.nw * s) / 2,
    ty: (FRAME_H - shot.nh * s) / 2,
  };
}

/** Не даём утащить картинку целиком за пределы рамки. */
function clampPos(shot: Shot): Shot {
  const w = shot.nw * shot.s;
  const h = shot.nh * shot.s;
  return {
    ...shot,
    tx: Math.min(FRAME_W - MIN_OVERLAP, Math.max(MIN_OVERLAP - w, shot.tx)),
    ty: Math.min(FRAME_H - MIN_OVERLAP, Math.max(MIN_OVERLAP - h, shot.ty)),
  };
}

function clampScale(shot: Shot, s: number): number {
  const cover = coverScale(shot.nw, shot.nh);
  return Math.min(cover * 8, Math.max(cover * 0.15, s));
}

async function loadFile(file: File): Promise<Shot | null> {
  if (!file.type.startsWith('image/')) return null;
  const src = URL.createObjectURL(file);
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(src);
    return null;
  }
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const base = file.name.replace(/\.[^.]+$/, '') || 'plan';
  const shot: Shot = { img, src, base, nw, nh, s: 1, tx: 0, ty: 0 };
  return centered(shot, coverScale(nw, nh)); // по умолчанию — заполнить рамку
}

/** Пошаговое уменьшение вдвое: одношаговый drawImage при сильном сжатии мылит. */
function downscaled(img: HTMLImageElement, targetScale: number): CanvasImageSource {
  let src: CanvasImageSource = img;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  let scale = targetScale;
  while (scale < 0.5 && w > 2 && h > 2) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 2));
    c.height = Math.max(1, Math.round(h / 2));
    const ctx = c.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    src = c;
    w = c.width;
    h = c.height;
    scale *= 2;
  }
  return src;
}

function exportShot(shot: Shot, filename: string) {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * EXPORT_SCALE;
  canvas.height = FRAME_H * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // JPG без альфы — под картинкой должен быть белый фон, а не чёрный.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const k = EXPORT_SCALE;
  const source = downscaled(shot.img, shot.s * k);
  ctx.drawImage(source, shot.tx * k, shot.ty * k, shot.nw * shot.s * k, shot.nh * shot.s * k);

  canvas.toBlob(
    blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    'image/jpeg',
    JPEG_QUALITY,
  );
}

export default function PlanCropPage() {
  const [shots, setShots] = useState<(Shot | null)[]>([null, null]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  /** Кладёт загруженные файлы по слотам, освобождая старые object URL. */
  const place = useCallback((loaded: (Shot | null)[], targets: number[]) => {
    setShots(prev => {
      const next = [...prev];
      loaded.forEach((shot, k) => {
        const i = targets[k];
        if (!shot || i === undefined) return;
        if (next[i]) URL.revokeObjectURL(next[i]!.src);
        next[i] = shot;
      });
      return next;
    });
  }, []);

  /** Файлы, брошенные на слот `from` (или в пустые, если from = null). */
  const accept = useCallback(
    async (fileList: FileList | File[] | null, from: number | null) => {
      const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/')).slice(0, 2);
      if (!files.length) return;

      let targets: number[];
      if (from === null) {
        const free = shotsRef.current.map((s, i) => (s ? -1 : i)).filter(i => i >= 0);
        targets = files.map((_, k) => free[k] ?? k % 2);
      } else {
        targets = files.map((_, k) => (from + k) % 2);
      }

      const loaded = await Promise.all(files.map(loadFile));
      place(loaded, targets);
    },
    [place],
  );

  // Ctrl+V — самый частый сценарий: скрин из буфера сразу в свободный слот.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void accept(files, null);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [accept]);

  // Браузер по умолчанию открывает брошенный файл — гасим это на всей странице.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const update = useCallback((i: number, updater: Updater) => {
    setShots(prev => prev.map((s, j) => (j === i && s ? updater(s) : s)));
  }, []);

  const remove = useCallback((i: number) => {
    setShots(prev =>
      prev.map((s, j) => {
        if (j !== i) return s;
        if (s) URL.revokeObjectURL(s.src);
        return null;
      }),
    );
  }, []);

  /** Одинаковые имена файлов (например, оба из буфера) разводим суффиксом. */
  const filename = (i: number) => {
    const shot = shots[i];
    if (!shot) return '';
    const other = shots[1 - i];
    return other && other.base === shot.base ? `${shot.base}-${i + 1}.jpg` : `${shot.base}.jpg`;
  };

  const download = (i: number) => {
    const shot = shots[i];
    if (shot) exportShot(shot, filename(i));
  };

  const downloadAll = () => {
    shots.forEach((shot, i) => {
      if (shot) setTimeout(() => exportShot(shot, filename(i)), i * 250);
    });
  };

  const ready = shots.filter(Boolean).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 bb-rise">
      <div className="bb-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="bb-title text-2xl">Кадрирование планировок</h1>
          <p className="bb-sub text-sm mt-1">
            Перетащите скрин в рамку или вставьте из буфера (Ctrl+V). Тяните мышкой, крутите колесо
            для масштаба — лишнее обрежется. Рамка {FRAME_W}×{FRAME_H}, файл сохраняется в{' '}
            {EXPORT_SCALE}× — {FRAME_W * EXPORT_SCALE}×{FRAME_H * EXPORT_SCALE} JPG.
          </p>
        </div>
        <button className="bb-btn bb-btn-primary" onClick={downloadAll} disabled={!ready}>
          ⬇ Скачать {ready === 2 ? 'обе' : 'картинку'}
        </button>
      </div>

      <div className="flex flex-wrap gap-6 justify-center">
        {[0, 1].map(i => (
          <Frame
            key={i}
            index={i}
            shot={shots[i]}
            onFiles={accept}
            onChange={update}
            onRemove={remove}
            onDownload={download}
            filename={filename(i)}
          />
        ))}
      </div>
    </div>
  );
}

interface FrameProps {
  index: number;
  shot: Shot | null;
  onFiles: (files: FileList | File[] | null, from: number | null) => void;
  onChange: (i: number, updater: Updater) => void;
  onRemove: (i: number) => void;
  onDownload: (i: number) => void;
  filename: string;
}

function Frame({ index, shot, onFiles, onChange, onRemove, onDownload, filename }: FrameProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [over, setOver] = useState(false);

  /** Зум вокруг точки (cx, cy) в координатах рамки — точка остаётся на месте. */
  const zoomAt = useCallback(
    (cx: number, cy: number, k: number) => {
      onChange(index, s => {
        const ns = clampScale(s, s.s * k);
        const f = ns / s.s;
        return clampPos({ ...s, s: ns, tx: cx - (cx - s.tx) * f, ty: cy - (cy - s.ty) * f });
      });
    },
    [index, onChange],
  );

  // React вешает onWheel пассивно, preventDefault там не работает — только нативно.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt((e.clientX - r.left) / D, (e.clientY - r.top) / D, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const cover = shot ? coverScale(shot.nw, shot.nh) : 1;
  const zoom = shot ? shot.s / cover : 1;

  const setZoom = (z: number) => {
    if (!shot) return;
    zoomAt(FRAME_W / 2, FRAME_H / 2, (cover * z) / shot.s);
  };

  const fit = (mode: 'cover' | 'contain') => {
    onChange(index, s =>
      centered(s, mode === 'cover' ? coverScale(s.nw, s.nh) : containScale(s.nw, s.nh)),
    );
  };

  return (
    <div className="bb-card p-4 space-y-3" style={{ width: VIEW_W + 32 }}>
      <div className="flex items-center justify-between gap-2 h-6">
        <span className="bb-label truncate">{shot ? filename : `Картинка ${index + 1}`}</span>
        {shot && (
          <span className="bb-sub text-[11px] shrink-0">
            {shot.nw}×{shot.nh}
          </span>
        )}
      </div>

      <div
        ref={boxRef}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          onFiles(e.dataTransfer.files, index);
        }}
        onPointerDown={e => {
          if (!shot) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={e => {
          if (!drag.current) return;
          const dx = (e.clientX - drag.current.x) / D;
          const dy = (e.clientY - drag.current.y) / D;
          drag.current = { x: e.clientX, y: e.clientY };
          onChange(index, s => clampPos({ ...s, tx: s.tx + dx, ty: s.ty + dy }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={() => shot && fit('cover')}
        onClick={() => !shot && fileRef.current?.click()}
        className="relative overflow-hidden select-none touch-none"
        style={{
          width: VIEW_W,
          height: VIEW_H,
          borderRadius: 18,
          background: '#fff',
          border: `2px ${shot ? 'solid' : 'dashed'} ${
            over ? 'var(--aqua-400)' : shot ? 'transparent' : 'var(--sky-200)'
          }`,
          boxShadow: 'var(--lift-2)',
          cursor: shot ? 'grab' : 'pointer',
        }}
      >
        {shot ? (
          // Object URL из буфера/диска — next/image здесь не к месту.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: shot.tx * D,
              top: shot.ty * D,
              width: shot.nw * shot.s * D,
              height: shot.nh * shot.s * D,
              maxWidth: 'none',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <span className="text-3xl">🖼️</span>
            <span className="bb-label">Перетащите скрин сюда</span>
            <span className="bb-sub text-xs">или Ctrl+V, или кликните, чтобы выбрать файл</span>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          onFiles(e.target.files, index);
          e.target.value = '';
        }}
      />

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0.15}
          max={8}
          step={0.01}
          value={zoom}
          disabled={!shot}
          onChange={e => setZoom(Number(e.target.value))}
          className="flex-1 accent-teal-400 disabled:opacity-40"
        />
        <span className="bb-sub text-[11px] tabular-nums w-12 text-right">
          {shot ? `${Math.round(shot.s * 100)}%` : '—'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bb-btn bb-btn-ghost text-xs" disabled={!shot} onClick={() => fit('cover')}>
          Заполнить
        </button>
        <button className="bb-btn bb-btn-ghost text-xs" disabled={!shot} onClick={() => fit('contain')}>
          Вписать
        </button>
        <button className="bb-btn bb-btn-ghost text-xs" onClick={() => fileRef.current?.click()}>
          {shot ? 'Заменить' : 'Выбрать'}
        </button>
        {shot && (
          <button className="bb-btn bb-btn-ghost text-xs bb-bad" onClick={() => onRemove(index)}>
            Удалить
          </button>
        )}
      </div>

      <button
        className="bb-btn bb-btn-ink w-full"
        disabled={!shot}
        onClick={() => onDownload(index)}
      >
        ⬇ Скачать JPG {FRAME_W * EXPORT_SCALE}×{FRAME_H * EXPORT_SCALE}
      </button>
    </div>
  );
}
