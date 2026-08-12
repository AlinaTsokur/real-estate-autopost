'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* Кадрирование планировок под пост: две картинки рядом, каждая обрезается
   под 520×728 и скачивается отдельным файлом в двойном размере (1040×1456).
   Плюс чистка фона: заливка от краёв, пипетка и две кисти — стереть и вернуть. */

const FRAME_W = 520;
const FRAME_H = 728;
const EXPORT_SCALE = 2;

// Ширина рамки на экране подстраивается под окно, чтобы обе стояли в два
// столбца. На результат не влияет: кадр считается в координатах 520×728.
const VIEW_MAX = FRAME_W;
const VIEW_MIN = 220;
const GAP = 24;       // расстояние между карточками (gap-6)
const CARD_PAD = 32;  // внутренние поля карточки (p-4)

const JPEG_QUALITY = 0.92;
const MIN_OVERLAP = 60;   // сколько картинки обязано остаться в рамке
const DEFAULT_TOL = 24;   // допуск по цвету фона, 0…100
const DEFAULT_BRUSH = 40; // диаметр кисти в экранных px

const CHECKER = 'repeating-conic-gradient(#e6edf2 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px';

type Format = 'jpg' | 'png';
type Tool = 'move' | 'pick' | 'erase' | 'restore' | 'lasso';

/** Что именно считаем фоном. Правки применяются всегда к оригиналу. */
interface BgSpec {
  auto: boolean;                          // заливка от краёв картинки
  picks: { x: number; y: number }[];      // точки, ткнутые пипеткой
  tol: number;                            // допуск 0…100
}

interface Shot {
  orig: HTMLImageElement;             // исходник, его не трогаем
  origSrc: string;
  base: string;                       // имя файла без расширения
  nw: number;                         // натуральный размер
  nh: number;
  s: number;                          // масштаб: 1 = натуральный размер в координатах рамки
  tx: number;                         // левый верхний угол неповёрнутой картинки
  ty: number;
  rot: number;                        // поворот вокруг центра картинки, градусы
  bg: BgSpec | null;
  bgCanvas: HTMLCanvasElement | null; // результат удаления фона
  eraseMask: HTMLCanvasElement | null;// где прошлись ластиком
  keepMask: HTMLCanvasElement | null; // где вернули исходник кистью
  composed: HTMLCanvasElement;        // итог: из него рисуем превью и экспорт
  format: Format;
  busy: boolean;
  rev: number;                        // счётчик правок — холсты мутабельные
}

type Updater = (s: Shot) => Shot;

const coverScale = (nw: number, nh: number) => Math.max(FRAME_W / nw, FRAME_H / nh);
const containScale = (nw: number, nh: number) => Math.min(FRAME_W / nw, FRAME_H / nh);

/** Центр картинки в координатах рамки — вокруг него идёт поворот. */
const centerOf = (shot: Shot): Pt => ({
  x: shot.tx + (shot.nw * shot.s) / 2,
  y: shot.ty + (shot.nh * shot.s) / 2,
});

/** Общий приём отрисовки: и превью, и экспорт кладут картинку одинаково. */
function drawShot(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  source: CanvasImageSource,
  k: number, // множитель координат рамки: превью — D, экспорт — 2
) {
  const c = centerOf(shot);
  const w = shot.nw * shot.s * k;
  const h = shot.nh * shot.s * k;
  ctx.save();
  ctx.translate(c.x * k, c.y * k);
  ctx.rotate((shot.rot * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const ctx2d = (c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings) =>
  c.getContext('2d', opts) as CanvasRenderingContext2D;

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

/** Собирает итоговую картинку: фон → возвращённые куски → стёртое ластиком. */
function recompose(shot: Shot) {
  const ctx = ctx2d(shot.composed);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, shot.nw, shot.nh);
  ctx.drawImage(shot.bgCanvas ?? shot.orig, 0, 0);

  if (shot.keepMask) {
    const tmp = makeCanvas(shot.nw, shot.nh);
    const t = ctx2d(tmp);
    t.drawImage(shot.orig, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(shot.keepMask, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }

  if (shot.eraseMask) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(shot.eraseMask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
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
    base,
    nw,
    nh,
    s: 1,
    tx: 0,
    ty: 0,
    rot: 0,
    bg: null,
    bgCanvas: null,
    eraseMask: null,
    keepMask: null,
    composed: makeCanvas(nw, nh),
    format: 'jpg',
    busy: false,
    rev: 0,
  };
  recompose(shot);
  return centered(shot, coverScale(nw, nh)); // по умолчанию — заполнить рамку
}

/* ── Кисти ─────────────────────────────────────────────────────────────── */

interface Pt {
  x: number;
  y: number;
}

/** Мазок от точки к точке: линия с круглыми концами плюс кружки по краям
    (нулевой отрезок сам по себе в canvas не рисуется). */
function paintSegment(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, r: number) {
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Прямоугольник, который задел мазок, — чтобы не перерисовывать всё полотно. */
function segmentBox(a: Pt, b: Pt, r: number, w: number, h: number) {
  const pad = r + 2;
  const x = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad));
  const y = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad));
  const x2 = Math.min(w, Math.ceil(Math.max(a.x, b.x) + pad));
  const y2 = Math.min(h, Math.ceil(Math.max(a.y, b.y) + pad));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Ластик: убирает пиксели и из итога, и из масок. */
function eraseStroke(shot: Shot, a: Pt, b: Pt, r: number) {
  if (!shot.eraseMask) shot.eraseMask = makeCanvas(shot.nw, shot.nh);
  paintSegment(ctx2d(shot.eraseMask), a, b, r);

  if (shot.keepMask) {
    const k = ctx2d(shot.keepMask);
    k.globalCompositeOperation = 'destination-out';
    paintSegment(k, a, b, r);
    k.globalCompositeOperation = 'source-over';
  }

  const ctx = ctx2d(shot.composed);
  ctx.globalCompositeOperation = 'destination-out';
  paintSegment(ctx, a, b, r);
  ctx.globalCompositeOperation = 'source-over';
}

/** Обратная кисть: возвращает пиксели исходника (и отменяет ластик). */
function restoreStroke(shot: Shot, a: Pt, b: Pt, r: number) {
  if (!shot.keepMask) shot.keepMask = makeCanvas(shot.nw, shot.nh);
  paintSegment(ctx2d(shot.keepMask), a, b, r);

  if (shot.eraseMask) {
    const e = ctx2d(shot.eraseMask);
    e.globalCompositeOperation = 'destination-out';
    paintSegment(e, a, b, r);
    e.globalCompositeOperation = 'source-over';
  }

  const box = segmentBox(a, b, r, shot.nw, shot.nh);
  if (box.w <= 0 || box.h <= 0) return;

  // Кусок исходника, обрезанный по форме мазка, кладём поверх итога.
  const tmp = makeCanvas(box.w, box.h);
  const t = ctx2d(tmp);
  t.drawImage(shot.orig, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  t.globalCompositeOperation = 'destination-in';
  paintSegment(t, { x: a.x - box.x, y: a.y - box.y }, { x: b.x - box.x, y: b.y - box.y }, r);
  ctx2d(shot.composed).drawImage(tmp, box.x, box.y);
}

/** Путь обводки; для «снаружи» добавляем рамку во всю картинку и режем evenodd. */
function lassoPath(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  outside: boolean,
  w: number,
  h: number,
) {
  ctx.beginPath();
  if (outside) ctx.rect(0, 0, w, h);
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

/** Стирает всё внутри обводки — или, наоборот, всё за её пределами. */
function lassoErase(shot: Shot, pts: Pt[], outside: boolean) {
  if (pts.length < 3) return;
  const rule: CanvasFillRule = outside ? 'evenodd' : 'nonzero';

  if (!shot.eraseMask) shot.eraseMask = makeCanvas(shot.nw, shot.nh);
  const e = ctx2d(shot.eraseMask);
  e.fillStyle = '#000';
  lassoPath(e, pts, outside, shot.nw, shot.nh);
  e.fill(rule);

  if (shot.keepMask) {
    const k = ctx2d(shot.keepMask);
    k.globalCompositeOperation = 'destination-out';
    lassoPath(k, pts, outside, shot.nw, shot.nh);
    k.fill(rule);
    k.globalCompositeOperation = 'source-over';
  }

  recompose(shot);
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
 * прозрачным.
 *
 * Расползаться заливка может только по «ядру» — пикселям в пределах допуска.
 * Те, что попали в узкую полосу за ним, лишь смягчают край и дальше не пускают:
 * иначе на плавных переходах (тени, градиенты) заливка утекает внутрь плана.
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
  const outer = hard + Math.max(8, hard * 0.35);
  const hard2 = hard * hard;
  const outer2 = outer * outer;
  const [rr, rg, rb] = ref;

  const dist2 = (p: number) => {
    const dr = data[p * 4] - rr;
    const dg = data[p * 4 + 1] - rg;
    const db = data[p * 4 + 2] - rb;
    return dr * dr + dg * dg + db * db;
  };

  /** Край: гасим альфу пропорционально удалению от опорного цвета. */
  const feather = (p: number, d2: number) => {
    const t = (Math.sqrt(d2) - hard) / (outer - hard);
    const a = Math.round(Math.min(1, Math.max(0, t)) * 255);
    if (a < data[p * 4 + 3]) data[p * 4 + 3] = a;
  };

  let head = 0;
  let tail = 0;
  for (const p of seeds) {
    if (mark[p] === id) continue;
    const d2 = dist2(p);
    if (d2 <= hard2) {
      mark[p] = id;
      queue[tail++] = p;
    } else if (d2 <= outer2) {
      mark[p] = id;
      feather(p, d2);
    }
  }

  const visit = (q: number) => {
    if (mark[q] === id) return;
    const d2 = dist2(q);
    if (d2 <= hard2) {
      mark[q] = id;
      queue[tail++] = q;
    } else if (d2 <= outer2) {
      mark[q] = id;
      feather(q, d2);
    }
  };

  while (head < tail) {
    const p = queue[head++];
    data[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (y > 0) visit(p - w);
    if (y < h - 1) visit(p + w);
  }
}

/** Гоняет заливки по спецификации и отдаёт полотно с прозрачным фоном. */
function processBackground(orig: HTMLImageElement, spec: BgSpec): HTMLCanvasElement | null {
  const w = orig.naturalWidth;
  const h = orig.naturalHeight;
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas, { willReadFrequently: true });
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
  return canvas;
}

/* ── Экспорт ───────────────────────────────────────────────────────────── */

/** Пошаговое уменьшение вдвое: одношаговый drawImage при сильном сжатии мылит. */
function downscaled(
  source: CanvasImageSource,
  w: number,
  h: number,
  targetScale: number,
): CanvasImageSource {
  let src = source;
  let cw = w;
  let ch = h;
  let scale = targetScale;
  while (scale < 0.5 && cw > 2 && ch > 2) {
    const c = makeCanvas(Math.max(1, Math.round(cw / 2)), Math.max(1, Math.round(ch / 2)));
    const ctx = ctx2d(c);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    src = c;
    cw = c.width;
    ch = c.height;
    scale *= 2;
  }
  return src;
}

function exportShot(shot: Shot, filename: string) {
  const canvas = makeCanvas(FRAME_W * EXPORT_SCALE, FRAME_H * EXPORT_SCALE);
  const ctx = ctx2d(canvas);

  // В JPG нет альфы — под картинку кладём белый фон. В PNG оставляем прозрачность.
  if (shot.format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const k = EXPORT_SCALE;
  drawShot(ctx, shot, downscaled(shot.composed, shot.nw, shot.nh, shot.s * k), k);

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
  // Обработчики читают актуальные слоты из ref — они запускаются после отрисовки.
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  // Метка последнего запуска обработки фона: ползунок допуска гоняет её часто.
  const bgToken = useRef<number[]>([0, 0]);

  // Подгоняем размер рамок под окно так, чтобы обе влезли в два столбца.
  const rowRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(VIEW_MAX);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const per = Math.floor((entry.contentRect.width - GAP) / 2) - CARD_PAD;
      setView(Math.max(VIEW_MIN, Math.min(VIEW_MAX, per)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Кладёт загруженные файлы по слотам, освобождая старые object URL. */
  const place = useCallback((loaded: (Shot | null)[], targets: number[]) => {
    setShots(prev => {
      const next = [...prev];
      loaded.forEach((shot, k) => {
        const i = targets[k];
        if (!shot || i === undefined) return;
        if (next[i]) {
          URL.revokeObjectURL(next[i]!.origSrc);
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
        if (s) URL.revokeObjectURL(s.origSrc);
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
      shot.bgCanvas = null;
      recompose(shot);
      setShots(prev =>
        prev.map((s, j) => (j === i && s ? { ...s, bg: null, busy: false, rev: s.rev + 1 } : s)),
      );
      return;
    }

    setShots(prev => prev.map((s, j) => (j === i && s ? { ...s, bg: spec, busy: true } : s)));
    // Даём кадру отрисовать «Обрабатываю…» до тяжёлого прохода по пикселям.
    await new Promise(r => requestAnimationFrame(() => r(null)));
    const canvas = processBackground(shot.orig, spec);
    if (bgToken.current[i] !== token) return; // пришли поздно, уже считаем заново

    if (canvas) {
      shot.bgCanvas = canvas;
      recompose(shot);
    }
    setShots(prev => prev.map((s, j) => (j === i && s ? { ...s, busy: false, rev: s.rev + 1 } : s)));
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

      <div ref={rowRef} className="flex flex-wrap gap-6 justify-center">
        {[0, 1].map(i => (
          <Frame
            key={i}
            index={i}
            view={view}
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
  view: number;         // ширина рамки на экране
  shot: Shot | null;
  onFiles: (files: FileList | File[] | null, from: number | null) => void;
  onChange: (i: number, updater: Updater) => void;
  onRemove: (i: number) => void;
  onDownload: (i: number) => void;
  onBg: (i: number, spec: BgSpec | null) => void;
  filename: string;
}

function Frame({
  index,
  view,
  shot,
  onFiles,
  onChange,
  onRemove,
  onDownload,
  onBg,
  filename,
}: FrameProps) {
  const viewH = (view * FRAME_H) / FRAME_W;
  const D = view / FRAME_W; // экранные px → координаты рамки

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const paint = useRef<Pt | null>(null);
  const tolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [over, setOver] = useState(false);
  const [tool, setTool] = useState<Tool>('move');
  const [tol, setTol] = useState(DEFAULT_TOL);
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [lasso, setLasso] = useState<Pt[]>([]);

  const brushing = tool === 'erase' || tool === 'restore';

  /** Рисует превью кадра из собранного полотна и поверх — обводку. */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(view * dpr)) {
      canvas.width = Math.round(view * dpr);
      canvas.height = Math.round(viewH * dpr);
    }
    const ctx = ctx2d(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view, viewH);
    if (!shot) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawShot(ctx, shot, shot.composed, D);

    if (!lasso.length) return;
    const rad = (shot.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const c = centerOf(shot);
    const sx = (p: Pt) =>
      (c.x + ((p.x - shot.nw / 2) * cos - (p.y - shot.nh / 2) * sin) * shot.s) * D;
    const sy = (p: Pt) =>
      (c.y + ((p.x - shot.nw / 2) * sin + (p.y - shot.nh / 2) * cos) * shot.s) * D;
    ctx.beginPath();
    ctx.moveTo(sx(lasso[0]), sy(lasso[0]));
    for (const p of lasso.slice(1)) ctx.lineTo(sx(p), sy(p));
    if (lasso.length > 2) ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.stroke();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#2dd4bf';
    for (const p of lasso) {
      ctx.beginPath();
      ctx.arc(sx(p), sy(p), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [shot, lasso, view, viewH, D]);

  useEffect(draw, [draw]);

  /** Зум вокруг точки (cx, cy) в координатах рамки — точка остаётся на месте. */
  const zoomAt = useCallback(
    (cx: number, cy: number, k: number) => {
      onChange(index, s => {
        const ns = clampScale(s, s.s * k);
        const f = ns / s.s;
        // Масштабируем положение центра — так формула верна и при повороте.
        const c = centerOf(s);
        const nx = cx + (c.x - cx) * f;
        const ny = cy + (c.y - cy) * f;
        return clampPos({
          ...s,
          s: ns,
          tx: nx - (s.nw * ns) / 2,
          ty: ny - (s.nh * ns) / 2,
        });
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
  }, [zoomAt, D]);

  useEffect(() => () => {
    if (tolTimer.current) clearTimeout(tolTimer.current);
  }, []);

  const cover = shot ? coverScale(shot.nw, shot.nh) : 1;
  const zoom = shot ? shot.s / cover : 1;

  const setZoom = (z: number) => {
    if (!shot) return;
    zoomAt(FRAME_W / 2, FRAME_H / 2, (cover * z) / shot.s);
  };

  // Поворот делим на четверти (кнопки) и мелкую правку завала (ползунок).
  const quarter = shot ? Math.round(shot.rot / 90) * 90 : 0;
  const fine = shot ? shot.rot - quarter : 0;
  const rotate = (deg: number) => onChange(index, s => ({ ...s, rot: s.rot + deg }));

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

  /** Экран → координаты рамки. */
  const toFrame = (clientX: number, clientY: number): Pt => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / D, y: (clientY - r.top) / D };
  };

  /** Экран → пиксель исходной картинки (с обратным поворотом). */
  const toImage = (clientX: number, clientY: number): Pt => {
    const s = shot!;
    const f = toFrame(clientX, clientY);
    const c = centerOf(s);
    const rad = (-s.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = f.x - c.x;
    const dy = f.y - c.y;
    return {
      x: (dx * cos - dy * sin) / s.s + s.nw / 2,
      y: (dx * sin + dy * cos) / s.s + s.nh / 2,
    };
  };

  const pickAt = (clientX: number, clientY: number) => {
    if (!shot) return;
    const p = toImage(clientX, clientY);
    if (p.x < 0 || p.y < 0 || p.x >= shot.nw || p.y >= shot.nh) return;
    setTool('move');
    onBg(index, bgSpec({ picks: [...(shot.bg?.picks ?? []), p] }));
  };

  /** Один сегмент мазка: рисуем прямо в полотно и сразу перерисовываем превью. */
  const strokeTo = (clientX: number, clientY: number) => {
    if (!shot || !paint.current) return;
    const to = toImage(clientX, clientY);
    const r = brush / 2 / D / shot.s; // экранный диаметр → радиус в пикселях картинки
    if (tool === 'erase') eraseStroke(shot, paint.current, to, r);
    else restoreStroke(shot, paint.current, to, r);
    paint.current = to;
    draw();
  };

  /** Переключение инструмента: недорисованную обводку выбрасываем. */
  const chooseTool = (t: Tool) => {
    setTool(prev => {
      const next = prev === t ? 'move' : t;
      if (next !== 'lasso') setLasso([]);
      return next;
    });
  };

  const applyLasso = (outside: boolean) => {
    if (!shot || lasso.length < 3) return;
    const pts = lasso;
    setLasso([]);
    setTool('move');
    onChange(index, s => {
      lassoErase(s, pts, outside);
      return { ...s, rev: s.rev + 1 };
    });
  };

  const changeTol = (v: number) => {
    setTol(v);
    if (!shot?.bg) return;
    if (tolTimer.current) clearTimeout(tolTimer.current);
    tolTimer.current = setTimeout(() => onBg(index, bgSpec({ tol: v })), 250);
  };

  const bgOn = !!shot?.bg;
  const painted = !!(shot?.eraseMask || shot?.keepMask);

  /** Сброс кистей — маски выбрасываем и пересобираем картинку. */
  const clearBrushes = () => {
    if (!shot) return;
    onChange(index, s => {
      s.eraseMask = null;
      s.keepMask = null;
      recompose(s);
      return { ...s, rev: s.rev + 1 };
    });
  };

  return (
    <div className="bb-card p-4 space-y-3" style={{ width: view + CARD_PAD }}>
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
          // Средняя кнопка двигает картинку в любом режиме — удобно при рисовании.
          if (brushing && e.button !== 1) {
            e.currentTarget.setPointerCapture(e.pointerId);
            paint.current = toImage(e.clientX, e.clientY);
            strokeTo(e.clientX, e.clientY);
            return;
          }
          if (tool === 'pick' || tool === 'lasso') return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={e => {
          if (brushing) setCursor(toFrame(e.clientX, e.clientY));
          if (paint.current) {
            strokeTo(e.clientX, e.clientY);
            return;
          }
          if (!drag.current) return;
          const dx = (e.clientX - drag.current.x) / D;
          const dy = (e.clientY - drag.current.y) / D;
          drag.current = { x: e.clientX, y: e.clientY };
          onChange(index, s => clampPos({ ...s, tx: s.tx + dx, ty: s.ty + dy }));
        }}
        onPointerUp={() => {
          drag.current = null;
          if (paint.current) {
            paint.current = null;
            onChange(index, s => ({ ...s, rev: s.rev + 1 }));
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          paint.current = null;
        }}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => shot && tool === 'move' && fit('cover')}
        onClick={e => {
          if (!shot) fileRef.current?.click();
          else if (tool === 'pick') pickAt(e.clientX, e.clientY);
          else if (tool === 'lasso') setLasso(pts => [...pts, toImage(e.clientX, e.clientY)]);
        }}
        className="relative overflow-hidden select-none touch-none"
        style={{
          width: view,
          height: viewH,
          borderRadius: 18,
          // Превью честно показывает, что будет в файле: белое для JPG, шашка для PNG.
          background: shot?.format === 'png' ? CHECKER : '#fff',
          border: `2px ${shot ? 'solid' : 'dashed'} ${
            over || tool !== 'move' ? 'var(--aqua-400)' : shot ? 'transparent' : 'var(--sky-200)'
          }`,
          boxShadow: 'var(--lift-2)',
          cursor: !shot
            ? 'pointer'
            : tool === 'pick' || tool === 'lasso'
              ? 'crosshair'
              : brushing
                ? 'none'
                : 'grab',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: view, height: viewH }}
        />

        {!shot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <span className="text-3xl">🖼️</span>
            <span className="bb-label">Перетащите скрин сюда</span>
            <span className="bb-sub text-xs">или Ctrl+V, или кликните, чтобы выбрать файл</span>
          </div>
        )}

        {brushing && cursor && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: cursor.x * D - brush / 2,
              top: cursor.y * D - brush / 2,
              width: brush,
              height: brush,
              border: '1px solid rgba(15,23,42,.75)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.9)',
            }}
          />
        )}

        {shot?.busy && (
          <div
            className="absolute inset-0 flex items-center justify-center bb-label"
            style={{ background: 'rgba(255,255,255,.7)' }}
          >
            Обрабатываю…
          </div>
        )}

        {(tool === 'pick' || tool === 'lasso') && !shot?.busy && (
          <div
            className="absolute left-0 right-0 bottom-0 text-center py-2 bb-label"
            style={{ background: 'rgba(255,255,255,.85)' }}
          >
            {tool === 'pick'
              ? 'Кликните по фону'
              : `Кликайте по контуру плана — точек: ${lasso.length}`}
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

      {/* Ползунок правит завал в пределах ±20°, четверти оборота — кнопками. */}
      <div className="flex items-center gap-2">
        <button
          className="bb-btn bb-btn-ghost text-xs px-3"
          disabled={!shot}
          onClick={() => rotate(-90)}
          title="Повернуть на 90° влево"
        >
          ⟲
        </button>
        <input
          type="range"
          min={-20}
          max={20}
          step={0.1}
          value={fine}
          disabled={!shot}
          onChange={e => onChange(index, s => ({ ...s, rot: quarter + Number(e.target.value) }))}
          className="flex-1 accent-teal-400 disabled:opacity-40"
        />
        <button
          className="bb-btn bb-btn-ghost text-xs px-3"
          disabled={!shot}
          onClick={() => rotate(90)}
          title="Повернуть на 90° вправо"
        >
          ⟳
        </button>
        <button
          className="bb-sub text-[11px] tabular-nums w-12 text-right underline"
          disabled={!shot}
          onClick={() => onChange(index, s => ({ ...s, rot: 0 }))}
          title="Сбросить поворот"
        >
          {shot ? `${shot.rot.toFixed(1)}°` : '—'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bb-btn bb-btn-ghost text-xs" disabled={!shot} onClick={() => fit('cover')}>
          Заполнить
        </button>
        <button className="bb-btn bb-btn-ghost text-xs" disabled={!shot} onClick={() => fit('contain')}>
          Вписать
        </button>
        {shot && (
          <button className="bb-btn bb-btn-ghost text-xs bb-bad" onClick={() => onRemove(index)}>
            Удалить
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
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
              ✨ Убрать
            </button>
            <button
              className={`bb-btn text-xs ${tool === 'pick' ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
              disabled={!shot || shot.busy}
              onClick={() => chooseTool('pick')}
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
            <span className="bb-sub text-[11px] tabular-nums w-6 text-right">{tol}</span>
          </div>
        </div>

        {/* ── Кисти ── */}
        <div className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--sky-50)' }}>
          <div className="flex items-center justify-between">
            <span className="bb-label">Кисть</span>
            {painted && (
              <button className="bb-sub text-[11px] underline" onClick={clearBrushes}>
                сбросить
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={`bb-btn text-xs ${tool === 'erase' ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
              disabled={!shot || shot.busy}
              onClick={() => chooseTool('erase')}
              title="Стереть в прозрачность"
            >
              🧽 Ластик
            </button>
            <button
              className={`bb-btn text-xs ${tool === 'restore' ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
              disabled={!shot || shot.busy}
              onClick={() => chooseTool('restore')}
              title="Вернуть кистью пиксели исходника"
            >
              ↩︎ Вернуть
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="bb-sub text-[11px] w-12">Размер</span>
            <input
              type="range"
              min={4}
              max={200}
              step={1}
              value={brush}
              disabled={!shot}
              onChange={e => setBrush(Number(e.target.value))}
              className="flex-1 accent-teal-400 disabled:opacity-40"
            />
            <span className="bb-sub text-[11px] tabular-nums w-6 text-right">{brush}</span>
          </div>
        </div>
      </div>

      {/* ── Контур: единственное, что работает на фотореалистичных рендерах ── */}
      <div className="rounded-2xl p-3 flex flex-wrap items-center gap-2" style={{ background: 'var(--sky-50)' }}>
        <span className="bb-label mr-1">Контур</span>
        <button
          className={`bb-btn text-xs ${tool === 'lasso' ? 'bb-btn-primary' : 'bb-btn-ghost'}`}
          disabled={!shot || shot.busy}
          onClick={() => chooseTool('lasso')}
          title="Обвести план кликами по углам"
        >
          ✂️ Обвести
        </button>
        {lasso.length >= 3 && (
          <>
            <button className="bb-btn bb-btn-ghost text-xs" onClick={() => applyLasso(true)}>
              стереть снаружи
            </button>
            <button className="bb-btn bb-btn-ghost text-xs" onClick={() => applyLasso(false)}>
              стереть внутри
            </button>
          </>
        )}
        {lasso.length > 0 && (
          <button
            className="bb-sub text-[11px] underline"
            onClick={() => setLasso(pts => pts.slice(0, -1))}
          >
            назад
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="bb-sub text-[11px]">Формат</span>
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
        <span className="bb-sub text-[11px] flex-1 text-right">
          {shot?.format === 'png' ? 'прозрачность сохранится' : 'прозрачное станет белым'}
        </span>
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
