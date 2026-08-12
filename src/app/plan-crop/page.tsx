'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* Кадрирование планировок под пост: две картинки рядом, каждая обрезается
   под 520×728, скачивается отдельным файлом в двойном размере (1040×1456).
   Плюс удаление однотонного фона — заливкой от краёв или пипеткой. */

const FRAME_W = 520;
const FRAME_H = 728;
const EXPORT_SCALE = 2;

// Рамка на экране — один к одному, 520×728. Файл пишется в 2× от неё.
const VIEW_W = FRAME_W;
const VIEW_H = FRAME_H;
const D = VIEW_W / FRAME_W;                  // экранные px → координаты рамки

const JPEG_QUALITY = 0.92;
const MIN_OVERLAP = 60;   // сколько картинки обязано остаться в рамке
const DEFAULT_TOL = 24;   // допуск по цвету фона, 0…100

const CHECKER = 'repeating-conic-gradient(#e6edf2 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px';

type Format = 'jpg' | 'png';

/** Что именно считаем фоном. Правки применяются всегда к оригиналу. */
interface BgSpec {
  auto: boolean;                          // заливка от краёв картинки
  picks: { x: number; y: number }[];      // точки, ткнутые пипеткой
  tol: number;                            // допуск 0…100
}

interface Shot {
  orig: HTMLImageElement;   // исходник, его не трогаем
  origSrc: string;
  img: HTMLImageElement;    // что показываем и экспортируем
  src: string;
  base: string;             // имя файла без расширения
  nw: number;               // натуральный размер
  nh: number;
  s: number;                // масштаб: 1 = натуральный размер в координатах рамки
  tx: number;               // левый верхний угол картинки в координатах рамки
  ty: number;
  bg: BgSpec | null;
  format: Format;
  busy: boolean;
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
  const shot: Shot = {
    orig: img,
    origSrc: src,
    img,
    src,
    base,
    nw,
    nh,
    s: 1,
    tx: 0,
    ty: 0,
    bg: null,
    format: 'jpg',
    busy: false,
  };
  return centered(shot, coverScale(nw, nh)); // по умолчанию — заполнить рамку
}

/* ── Удаление фона ─────────────────────────────────────────────────────── */

/** Самый частый цвет по периметру — им обычно и залит фон скриншота. */
function borderColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (p: number) => {
    const r = data[p * 4];
    const g = data[p * 4 + 1];
    const b = data[p * 4 + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    cur.n++;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  buckets.forEach(v => {
    if (v.n > best.n) best = v;
  });
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

/**
 * Заливка от семян: всё связное и похожее на опорный цвет становится
 * прозрачным. У границы допуска альфа гасится плавно — иначе рваный край.
 */
function floodClear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seeds: number[],
  ref: [number, number, number],
  hard: number,
  mark: Int32Array,
  queue: Int32Array,
  id: number,
) {
  const outer = hard * 1.6 + 10;
  const hard2 = hard * hard;
  const outer2 = outer * outer;
  const [rr, rg, rb] = ref;

  const dist2 = (p: number) => {
    const dr = data[p * 4] - rr;
    const dg = data[p * 4 + 1] - rg;
    const db = data[p * 4 + 2] - rb;
    return dr * dr + dg * dg + db * db;
  };

  let head = 0;
  let tail = 0;
  for (const p of seeds) {
    if (mark[p] === id || dist2(p) > outer2) continue;
    mark[p] = id;
    queue[tail++] = p;
  }

  while (head < tail) {
    const p = queue[head++];
    const d2 = dist2(p);
    if (d2 <= hard2) {
      data[p * 4 + 3] = 0;
    } else {
      // Плавный переход от прозрачного к непрозрачному по краю допуска.
      const t = (Math.sqrt(d2) - hard) / (outer - hard);
      const a = Math.round(Math.min(1, Math.max(0, t)) * 255);
      if (a < data[p * 4 + 3]) data[p * 4 + 3] = a;
    }

    const x = p % w;
    const y = (p - x) / w;
    if (x > 0 && mark[p - 1] !== id && dist2(p - 1) <= outer2) { mark[p - 1] = id; queue[tail++] = p - 1; }
    if (x < w - 1 && mark[p + 1] !== id && dist2(p + 1) <= outer2) { mark[p + 1] = id; queue[tail++] = p + 1; }
    if (y > 0 && mark[p - w] !== id && dist2(p - w) <= outer2) { mark[p - w] = id; queue[tail++] = p - w; }
    if (y < h - 1 && mark[p + w] !== id && dist2(p + w) <= outer2) { mark[p + w] = id; queue[tail++] = p + w; }
  }
}

/** Гоняет заливки по спецификации и отдаёт готовую картинку (PNG с альфой). */
async function processBackground(
  orig: HTMLImageElement,
  spec: BgSpec,
): Promise<{ img: HTMLImageElement; src: string } | null> {
  const w = orig.naturalWidth;
  const h = orig.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(orig, 0, 0);

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const mark = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  const hard = spec.tol * 2.2;
  let id = 0;

  if (spec.auto) {
    const seeds: number[] = [];
    for (let x = 0; x < w; x++) {
      seeds.push(x, (h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      seeds.push(y * w, y * w + w - 1);
    }
    floodClear(data, w, h, seeds, borderColor(data, w, h), hard, mark, queue, ++id);
  }

  for (const pick of spec.picks) {
    const x = Math.min(w - 1, Math.max(0, Math.round(pick.x)));
    const y = Math.min(h - 1, Math.max(0, Math.round(pick.y)));
    const p = y * w + x;
    const ref: [number, number, number] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
    floodClear(data, w, h, [p], ref, hard, mark, queue, ++id);
  }

  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const src = URL.createObjectURL(blob);
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(src);
    return null;
  }
  return { img, src };
}

/* ── Экспорт ───────────────────────────────────────────────────────────── */

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

  // В JPG нет альфы — под картинку кладём белый фон. В PNG оставляем прозрачность.
  if (shot.format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
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
    shot.format === 'jpg' ? 'image/jpeg' : 'image/png',
    shot.format === 'jpg' ? JPEG_QUALITY : undefined,
  );
}

/* ── Страница ──────────────────────────────────────────────────────────── */

export default function PlanCropPage() {
  const [shots, setShots] = useState<(Shot | null)[]>([null, null]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  // Метка последнего запуска обработки фона: ползунок допуска гоняет её часто.
  const bgToken = useRef<number[]>([0, 0]);

  /** Кладёт загруженные файлы по слотам, освобождая старые object URL. */
  const place = useCallback((loaded: (Shot | null)[], targets: number[]) => {
    setShots(prev => {
      const next = [...prev];
      loaded.forEach((shot, k) => {
        const i = targets[k];
        if (!shot || i === undefined) return;
        const old = next[i];
        if (old) {
          URL.revokeObjectURL(old.origSrc);
          if (old.src !== old.origSrc) URL.revokeObjectURL(old.src);
          bgToken.current[i]++;
        }
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
    bgToken.current[i]++;
    setShots(prev =>
      prev.map((s, j) => {
        if (j !== i) return s;
        if (s) {
          URL.revokeObjectURL(s.origSrc);
          if (s.src !== s.origSrc) URL.revokeObjectURL(s.src);
        }
        return null;
      }),
    );
  }, []);

  /** Пересчитывает фон по новой спецификации (null — вернуть исходник). */
  const applyBg = useCallback(async (i: number, spec: BgSpec | null) => {
    const shot = shotsRef.current[i];
    if (!shot) return;
    const token = ++bgToken.current[i];

    if (!spec) {
      setShots(prev =>
        prev.map((s, j) => {
          if (j !== i || !s) return s;
          if (s.src !== s.origSrc) URL.revokeObjectURL(s.src);
          return { ...s, img: s.orig, src: s.origSrc, bg: null, busy: false };
        }),
      );
      return;
    }

    setShots(prev => prev.map((s, j) => (j === i && s ? { ...s, bg: spec, busy: true } : s)));
    // Даём кадру отрисовать «Обрабатываю…» до тяжёлого прохода по пикселям.
    await new Promise(r => requestAnimationFrame(() => r(null)));
    const res = await processBackground(shot.orig, spec);

    if (bgToken.current[i] !== token) {
      if (res) URL.revokeObjectURL(res.src); // пришёл поздно, уже посчитали заново
      return;
    }
    setShots(prev =>
      prev.map((s, j) => {
        if (j !== i || !s) return s;
        if (!res) return { ...s, busy: false };
        if (s.src !== s.origSrc) URL.revokeObjectURL(s.src);
        return { ...s, img: res.img, src: res.src, busy: false };
      }),
    );
  }, []);

  /** Одинаковые имена файлов (например, оба из буфера) разводим суффиксом. */
  const filename = (i: number) => {
    const shot = shots[i];
    if (!shot) return '';
    const other = shots[1 - i];
    const suffix = other && other.base === shot.base ? `-${i + 1}` : '';
    return `${shot.base}${suffix}.${shot.format}`;
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
    <div className="max-w-[1160px] mx-auto space-y-6 bb-rise">
      <div className="bb-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="bb-title text-2xl">Кадрирование планировок</h1>
          <p className="bb-sub text-sm mt-1">
            Перетащите скрин в рамку или вставьте из буфера (Ctrl+V). Тяните мышкой, крутите колесо
            для масштаба — лишнее обрежется. Рамка {FRAME_W}×{FRAME_H}, файл сохраняется в{' '}
            {EXPORT_SCALE}× — {FRAME_W * EXPORT_SCALE}×{FRAME_H * EXPORT_SCALE}.
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
            onBg={applyBg}
            filename={filename(i)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Один кадр ─────────────────────────────────────────────────────────── */

interface FrameProps {
  index: number;
  shot: Shot | null;
  onFiles: (files: FileList | File[] | null, from: number | null) => void;
  onChange: (i: number, updater: Updater) => void;
  onRemove: (i: number) => void;
  onDownload: (i: number) => void;
  onBg: (i: number, spec: BgSpec | null) => void;
  filename: string;
}

function Frame({ index, shot, onFiles, onChange, onRemove, onDownload, onBg, filename }: FrameProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const tolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [over, setOver] = useState(false);
  const [picking, setPicking] = useState(false);
  const [tol, setTol] = useState(DEFAULT_TOL);

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

  useEffect(() => {
    if (shot?.bg) setTol(shot.bg.tol);
  }, [shot?.bg]);

  useEffect(() => () => {
    if (tolTimer.current) clearTimeout(tolTimer.current);
  }, []);

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

  const bgSpec = (patch: Partial<BgSpec>): BgSpec => ({
    auto: shot?.bg?.auto ?? false,
    picks: shot?.bg?.picks ?? [],
    tol: shot?.bg?.tol ?? tol,
    ...patch,
  });

  /** Клик пипеткой: экран → координаты рамки → пиксель исходной картинки. */
  const pickAt = (clientX: number, clientY: number) => {
    if (!shot || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const fx = (clientX - r.left) / D;
    const fy = (clientY - r.top) / D;
    const x = (fx - shot.tx) / shot.s;
    const y = (fy - shot.ty) / shot.s;
    if (x < 0 || y < 0 || x >= shot.nw || y >= shot.nh) return;
    setPicking(false);
    onBg(index, bgSpec({ picks: [...(shot.bg?.picks ?? []), { x, y }] }));
  };

  const changeTol = (v: number) => {
    setTol(v);
    if (!shot?.bg) return;
    if (tolTimer.current) clearTimeout(tolTimer.current);
    tolTimer.current = setTimeout(() => onBg(index, bgSpec({ tol: v })), 250);
  };

  const bgOn = !!shot?.bg;

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
          if (!shot || picking) return;
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
        onDoubleClick={() => shot && !picking && fit('cover')}
        onClick={e => {
          if (!shot) fileRef.current?.click();
          else if (picking) pickAt(e.clientX, e.clientY);
        }}
        className="relative overflow-hidden select-none touch-none"
        style={{
          width: VIEW_W,
          height: VIEW_H,
          borderRadius: 18,
          // Превью честно показывает, что будет в файле: белое для JPG, шашка для PNG.
          background: shot?.format === 'png' ? CHECKER : '#fff',
          border: `2px ${shot ? 'solid' : 'dashed'} ${
            over || picking ? 'var(--aqua-400)' : shot ? 'transparent' : 'var(--sky-200)'
          }`,
          boxShadow: 'var(--lift-2)',
          cursor: !shot ? 'pointer' : picking ? 'crosshair' : 'grab',
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

        {shot?.busy && (
          <div
            className="absolute inset-0 flex items-center justify-center bb-label"
            style={{ background: 'rgba(255,255,255,.7)' }}
          >
            Обрабатываю…
          </div>
        )}

        {picking && !shot?.busy && (
          <div
            className="absolute left-0 right-0 bottom-0 text-center py-2 bb-label"
            style={{ background: 'rgba(255,255,255,.85)' }}
          >
            Кликните по фону
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

      {/* ── Фон ── */}
      <div className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--sky-50)' }}>
        <div className="flex items-center justify-between">
          <span className="bb-label">Фон</span>
          {bgOn && (
            <button
              className="bb-sub text-[11px] underline"
              disabled={shot?.busy}
              onClick={() => onBg(index, null)}
            >
              вернуть
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={`bb-btn text-xs ${shot?.bg?.auto ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
            disabled={!shot || shot.busy}
            onClick={() => onBg(index, bgSpec({ auto: !shot?.bg?.auto, tol }))}
            title="Заливка от краёв картинки"
          >
            ✨ Убрать фон
          </button>
          <button
            className={`bb-btn text-xs ${picking ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
            disabled={!shot || shot.busy}
            onClick={() => setPicking(p => !p)}
            title="Кликнуть по цвету, который считать фоном"
          >
            💧 Пипетка{shot?.bg?.picks.length ? ` (${shot.bg.picks.length})` : ''}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="bb-sub text-[11px] w-12">Допуск</span>
          <input
            type="range"
            min={2}
            max={100}
            step={1}
            value={tol}
            disabled={!shot || !bgOn}
            onChange={e => changeTol(Number(e.target.value))}
            className="flex-1 accent-teal-400 disabled:opacity-40"
          />
          <span className="bb-sub text-[11px] tabular-nums w-8 text-right">{tol}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="bb-sub text-[11px] w-12">Формат</span>
          {(['jpg', 'png'] as Format[]).map(f => (
            <button
              key={f}
              className={`bb-btn text-xs ${shot?.format === f ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
              disabled={!shot}
              onClick={() => onChange(index, s => ({ ...s, format: f }))}
            >
              {f.toUpperCase()}
            </button>
          ))}
          <span className="bb-sub text-[10px] flex-1 text-right leading-tight">
            {shot?.format === 'png' ? 'с прозрачностью' : 'фон станет белым'}
          </span>
        </div>
      </div>

      <button
        className="bb-btn bb-btn-ink w-full"
        disabled={!shot || shot.busy}
        onClick={() => onDownload(index)}
      >
        ⬇ Скачать {(shot?.format ?? 'jpg').toUpperCase()} {FRAME_W * EXPORT_SCALE}×
        {FRAME_H * EXPORT_SCALE}
      </button>
    </div>
  );
}
