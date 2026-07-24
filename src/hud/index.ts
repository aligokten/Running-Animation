import type { Activity, Frame, HudOptions, PacingMode, Split } from '../types';
import type { Palette, Theme } from '../themes';
import type { ScreenLabel } from '../three/scene';
import { withAlpha } from '../lib/color';
import {
  SPORT_LABELS,
  distanceLabel,
  elevationLabel,
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  paceLabel,
} from '../lib/format';
import { Painter, clamp01, easeOutCubic } from './draw';

export interface HudInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  theme: Theme;
  palette: Palette;
  options: HudOptions;
  activity: Activity;
  frame: Frame;
  progress: number;
  /** animation clock in seconds */
  time: number;
  /** total length of the animation in seconds */
  duration: number;
  pacing: PacingMode;
  labels: ScreenLabel[];
}

interface Stat {
  label: string;
  value: string;
  unit?: string;
}

const profileCache = new WeakMap<Activity, Float32Array>();

/** Normalised elevation profile, sampled on a fixed grid. */
function elevationProfile(a: Activity): Float32Array {
  const cached = profileCache.get(a);
  if (cached) return cached;
  const N = 240;
  const out = new Float32Array(N);
  const range = Math.max(1, a.maxEle - a.minEle);
  for (let i = 0; i < N; i++) {
    const target = (i / (N - 1)) * a.totalDistance;
    // cumDist is monotonic, so walk it once per sample with a binary search
    let lo = 0;
    let hi = a.cumDist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (a.cumDist[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = a.cumDist[hi] - a.cumDist[lo];
    const k = span > 0 ? (target - a.cumDist[lo]) / span : 0;
    const ele = a.smoothEle[lo] * (1 - k) + a.smoothEle[hi] * k;
    out[i] = (ele - a.minEle) / range;
  }
  profileCache.set(a, out);
  return out;
}

function splitProgress(split: Split, a: Activity, pacing: PacingMode): number {
  return pacing === 'time'
    ? split.elapsed / Math.max(1, a.totalTime)
    : split.distance / Math.max(1, a.totalDistance);
}

/** The split that was completed most recently, plus how long ago (in seconds). */
function activeSplit(input: HudInput): { split: Split; age: number } | null {
  const { activity, progress, duration, pacing } = input;
  for (let i = activity.splits.length - 1; i >= 0; i--) {
    const sp = splitProgress(activity.splits[i], activity, pacing);
    if (sp <= progress) {
      return { split: activity.splits[i], age: (progress - sp) * duration };
    }
  }
  return null;
}

function buildStats(input: HudInput, max: number): Stat[] {
  const { activity, frame, options } = input;
  const u = options.units;
  const stats: Stat[] = [
    { label: 'SÜRE', value: formatDuration(frame.elapsed) },
    { label: 'TEMPO', value: formatPace(frame.speed, u), unit: paceLabel(u) },
    {
      label: 'YÜKSELİŞ',
      value: formatElevation(frame.elevGain, u),
      unit: elevationLabel(u),
    },
  ];
  if (options.showHeartRate && frame.hr) {
    stats.push({ label: 'NABIZ', value: Math.round(frame.hr).toString(), unit: 'BPM' });
  }
  stats.push({ label: 'RAKIM', value: formatElevation(frame.ele, u), unit: elevationLabel(u) });
  stats.push({
    label: 'ORT. TEMPO',
    value: formatPace(frame.elapsed > 5 ? frame.distance / frame.elapsed : 0, u),
    unit: paceLabel(u),
  });
  if (frame.cad) {
    stats.push({ label: 'ADIM', value: Math.round(frame.cad).toString(), unit: 'SPM' });
  }
  void activity;
  return stats.slice(0, max);
}

// ---------------------------------------------------------------------------
// shared components
// ---------------------------------------------------------------------------

function drawProfile(
  p: Painter,
  input: HudInput,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fillAlpha?: number; showMarker?: boolean; lineWidth?: number } = {},
) {
  const { ctx } = p;
  const { palette, activity, progress, pacing } = input;
  const prof = elevationProfile(activity);
  const N = prof.length;

  // Progress along the profile is measured by distance even in time pacing,
  // because the x axis of the chart is distance.
  const distProgress =
    pacing === 'time'
      ? input.frame.distance / Math.max(1, activity.totalDistance)
      : progress;

  const px = (i: number) => x + (i / (N - 1)) * w;
  const py = (v: number) => y + h - v * h * 0.92 - h * 0.04;

  ctx.save();

  // baseline
  p.line(x, y + h, x + w, y + h, withAlpha(palette.textDim, 0.35), 1.5);

  // full profile outline (dim)
  ctx.beginPath();
  ctx.moveTo(px(0), py(prof[0]));
  for (let i = 1; i < N; i++) ctx.lineTo(px(i), py(prof[i]));
  ctx.strokeStyle = withAlpha(palette.textDim, 0.55);
  ctx.lineWidth = opts.lineWidth ?? 2;
  ctx.stroke();

  // completed portion, filled with the route gradient
  const cut = clamp01(distProgress) * (N - 1);
  const cutIdx = Math.floor(cut);
  ctx.beginPath();
  ctx.moveTo(px(0), y + h);
  for (let i = 0; i <= cutIdx; i++) ctx.lineTo(px(i), py(prof[i]));
  if (cutIdx < N - 1) {
    const k = cut - cutIdx;
    const v = prof[cutIdx] * (1 - k) + prof[cutIdx + 1] * k;
    ctx.lineTo(px(cut), py(v));
    ctx.lineTo(px(cut), y + h);
  } else {
    ctx.lineTo(px(N - 1), y + h);
  }
  ctx.closePath();

  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, withAlpha(palette.route[0], opts.fillAlpha ?? 0.75));
  grad.addColorStop(0.5, withAlpha(palette.route[1], opts.fillAlpha ?? 0.75));
  grad.addColorStop(1, withAlpha(palette.route[2], opts.fillAlpha ?? 0.75));
  ctx.fillStyle = grad;
  ctx.fill();

  if (opts.showMarker !== false) {
    const k = cut - cutIdx;
    const v = prof[Math.min(N - 1, cutIdx)] * (1 - k) + prof[Math.min(N - 1, cutIdx + 1)] * k;
    p.circle(px(cut), py(v), 7, palette.head, 1);
    p.circle(px(cut), py(v), 14, palette.accent, 0.28);
  }

  ctx.restore();
}

function drawProgressBar(
  p: Painter,
  input: HudInput,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const { ctx } = p;
  const { palette, progress } = input;
  p.fillRoundRect(x, y, w, h, h / 2, palette.textDim, 0.22);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, palette.route[0]);
  grad.addColorStop(0.5, palette.route[1]);
  grad.addColorStop(1, palette.route[2]);
  ctx.save();
  p.roundRect(x, y, Math.max(h, w * clamp01(progress)), h, h / 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

function drawWorldLabels(p: Painter, input: HudInput) {
  const { labels, palette, theme, options } = input;
  if (!options.showSplitToasts && !labels.length) return;
  const font = theme.fonts.mono;

  for (const label of labels) {
    // labels arrive in device pixels; convert into design space
    const x = label.x / p.s;
    const y = label.y / p.s;
    if (label.kind === 'km') {
      const r = 17;
      p.circle(x, y, r, withAlpha(palette.bgBottom, 0.7 * label.alpha), 1);
      p.strokeRoundRect(x - r, y - r, r * 2, r * 2, r, palette.accent, 2, label.alpha * 0.9);
      p.text(label.text, x, y + 1, {
        font,
        size: 17,
        weight: 700,
        color: palette.text,
        align: 'center',
        baseline: 'middle',
        alpha: label.alpha,
      });
    } else {
      p.text(label.text, x, y - 22, {
        font,
        size: 15,
        weight: 700,
        color: label.kind === 'finish' ? palette.accent : palette.textDim,
        align: 'center',
        baseline: 'middle',
        alpha: label.alpha,
        tracking: 2,
      });
      p.circle(x, y, 5, label.kind === 'finish' ? palette.accent : palette.textDim, label.alpha);
    }
  }
}

function drawSplitToast(p: Painter, input: HudInput, y: number, style: 'chip' | 'bar') {
  const active = activeSplit(input);
  if (!active || active.age > 2.6) return;
  const { palette, theme, options } = input;
  const { split } = active;

  const appear = easeOutCubic(clamp01(active.age / 0.35));
  const fade = 1 - clamp01((active.age - 2.0) / 0.6);
  const alpha = appear * fade;
  const slide = (1 - appear) * 40;

  const unitName = options.units === 'imperial' ? 'MIL' : 'KM';
  const title = `${split.index}. ${unitName}`;
  const pace = formatPace(1000 / Math.max(1, split.duration), options.units);
  const detail = `${pace}${paceLabel(options.units)}   ${split.elevDelta >= 0 ? '+' : ''}${Math.round(split.elevDelta)}m`;

  if (style === 'bar') {
    const h = 76;
    const w = 560;
    const x = p.W - w - 56 + slide;
    p.fillRoundRect(x, y, w, h, 6, palette.panel, alpha);
    p.fillRoundRect(x, y, 10, h, 0, palette.accent, alpha);
    p.text(title, x + 34, y + h / 2, {
      font: theme.fonts.display,
      size: 40,
      weight: 700,
      color: palette.text,
      baseline: 'middle',
      alpha,
      tracking: 1,
    });
    p.text(detail, x + w - 30, y + h / 2, {
      font: theme.fonts.mono,
      size: 26,
      weight: 500,
      color: palette.textDim,
      align: 'right',
      baseline: 'middle',
      alpha,
    });
    return;
  }

  const label = `${title}   ${pace}${paceLabel(options.units)}`;
  const w = p.measure(label, theme.fonts.mono, 28, 700) + 64;
  const x = (p.W - w) / 2;
  p.fillRoundRect(x, y - slide, w, 58, 29, palette.panel, alpha);
  p.strokeRoundRect(x, y - slide, w, 58, 29, palette.accent, 1.5, alpha * 0.7);
  p.text(label, p.W / 2, y - slide + 30, {
    font: theme.fonts.mono,
    size: 28,
    weight: 700,
    color: palette.text,
    align: 'center',
    baseline: 'middle',
    alpha,
    tracking: 1,
  });
}

function drawWatermark(p: Painter, input: HudInput, y: number) {
  if (!input.options.showWatermark) return;
  const { palette, theme } = input;
  p.text('ONE MORE STEP TO FINISH', p.W / 2, y, {
    font: theme.fonts.body,
    size: 17,
    weight: 600,
    color: palette.textDim,
    align: 'center',
    baseline: 'middle',
    alpha: 0.65,
    tracking: 4,
  });
}

function headerLines(input: HudInput): { title: string; subtitle: string } {
  const { options, activity } = input;
  const title = options.title.trim() || activity.name;
  const subtitle =
    options.subtitle.trim() ||
    [SPORT_LABELS[activity.sport] ?? 'AKTİVİTE', formatDate(activity.startedAt)]
      .filter(Boolean)
      .join('  ·  ');
  return { title, subtitle };
}

// ---------------------------------------------------------------------------
// themes
// ---------------------------------------------------------------------------

function drawPulse(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 64;
  const { title, subtitle } = headerLines(input);
  const intro = easeOutCubic(clamp01(input.time / 0.8));

  if (options.showTitle) {
    p.text(title.toUpperCase(), M, 150, {
      font: theme.fonts.display,
      size: 62,
      weight: 400,
      color: palette.text,
      alpha: intro,
      tracking: 1.5,
    });
    p.text(subtitle, M, 196, {
      font: theme.fonts.body,
      size: 22,
      weight: 500,
      color: palette.textDim,
      alpha: intro * 0.9,
      tracking: 1.5,
    });
    p.line(M, 220, M + 120 * intro, 220, palette.accent, 3, intro);
  }

  const bottom = p.H - 104;

  if (options.showProgressBar) drawProgressBar(p, input, M, bottom, p.W - M * 2, 8);
  drawWatermark(p, input, bottom + 44);

  const stats = options.showStats ? buildStats(input, 4) : [];
  let cursor = bottom - 44;

  if (stats.length) {
    const colW = (p.W - M * 2) / stats.length;
    stats.forEach((stat, i) => {
      const x = M + colW * i;
      p.text(stat.label, x, cursor - 46, {
        font: theme.fonts.body,
        size: 18,
        weight: 700,
        color: palette.textDim,
        tracking: 2,
      });
      p.text(stat.value, x, cursor, {
        font: theme.fonts.display,
        size: 54,
        weight: 400,
        color: palette.text,
      });
      if (stat.unit) {
        const w = p.measure(stat.value, theme.fonts.display, 54);
        p.text(stat.unit, x + w + 8, cursor, {
          font: theme.fonts.body,
          size: 18,
          weight: 700,
          color: palette.textDim,
        });
      }
    });
    cursor -= 100;
  }

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, options.units);
    p.text(value, M - 4, cursor, {
      font: theme.fonts.display,
      size: 168,
      weight: 400,
      color: palette.text,
      glow: 26,
      glowColor: withAlpha(palette.accent, 0.5),
    });
    const w = p.measure(value, theme.fonts.display, 168);
    p.text(distanceLabel(options.units), M + w + 14, cursor, {
      font: theme.fonts.display,
      size: 56,
      weight: 400,
      color: palette.accent,
    });
    cursor -= 150;
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, M, cursor - 108, p.W - M * 2, 108);
  }

  if (options.showSplitToasts) drawSplitToast(p, input, 300, 'chip');
}

function drawMinimal(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 72;
  const { title, subtitle } = headerLines(input);
  const intro = easeOutCubic(clamp01(input.time / 0.8));

  if (options.showTitle) {
    p.text(title, M, 140, {
      font: theme.fonts.body,
      size: 30,
      weight: 600,
      color: palette.text,
      alpha: intro,
    });
    p.text(subtitle, M, 176, {
      font: theme.fonts.body,
      size: 18,
      weight: 400,
      color: palette.textDim,
      alpha: intro * 0.85,
      tracking: 1,
    });
  }

  const bottom = p.H - 130;

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, options.units);
    p.text(value, M, bottom, {
      font: theme.fonts.body,
      size: 96,
      weight: 200,
      color: palette.text,
    });
    const w = p.measure(value, theme.fonts.body, 96, 200);
    p.text(distanceLabel(options.units).toLowerCase(), M + w + 12, bottom, {
      font: theme.fonts.body,
      size: 28,
      weight: 400,
      color: palette.textDim,
    });
  }

  if (options.showStats) {
    const stats = buildStats(input, 3);
    let x = p.W - M;
    for (let i = stats.length - 1; i >= 0; i--) {
      const stat = stats[i];
      const text = stat.value + (stat.unit ? ` ${stat.unit.toLowerCase()}` : '');
      const w = p.measure(text, theme.fonts.body, 30, 300);
      p.text(text, x, bottom, {
        font: theme.fonts.body,
        size: 30,
        weight: 300,
        color: palette.text,
        align: 'right',
      });
      p.text(stat.label.toLowerCase(), x, bottom - 44, {
        font: theme.fonts.body,
        size: 15,
        weight: 400,
        color: palette.textDim,
        align: 'right',
        tracking: 1,
      });
      x -= w + 48;
    }
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, M, bottom + 24, p.W - M * 2, 54, {
      fillAlpha: 0.4,
      showMarker: false,
      lineWidth: 1.5,
    });
  }

  if (options.showProgressBar) {
    p.line(0, p.H - 56, p.W, p.H - 56, palette.textDim, 2, 0.2);
    p.line(0, p.H - 56, p.W * clamp01(input.progress), p.H - 56, palette.accent, 2, 1);
  }

  drawWatermark(p, input, p.H - 28);
  if (options.showSplitToasts) drawSplitToast(p, input, 250, 'chip');
}

function drawTelemetry(p: Painter, input: HudInput) {
  const { palette, theme, options, frame, activity } = input;
  const M = 56;
  const mono = theme.fonts.mono;
  const { title } = headerLines(input);

  // corner ticks
  const tick = 36;
  const corners: [number, number, number, number][] = [
    [M, M, 1, 1],
    [p.W - M, M, -1, 1],
    [M, p.H - M, 1, -1],
    [p.W - M, p.H - M, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    p.line(x, y, x + tick * dx, y, palette.accent, 2, 0.8);
    p.line(x, y, x, y + tick * dy, palette.accent, 2, 0.8);
  }

  if (options.showTitle) {
    p.text(`> ${title.toUpperCase()}`, M + 8, M + 66, {
      font: mono,
      size: 26,
      weight: 700,
      color: palette.text,
      tracking: 1,
    });
    p.text(
      `${SPORT_LABELS[activity.sport] ?? ''} · ${formatDate(activity.startedAt)}`,
      M + 8,
      M + 100,
      { font: mono, size: 16, weight: 400, color: palette.textDim },
    );
  }

  // live data panel
  if (options.showStats) {
    const rows: [string, string][] = [
      ['DIST', `${formatDistance(frame.distance, options.units)} ${distanceLabel(options.units)}`],
      ['TIME', formatDuration(frame.elapsed, true)],
      ['PACE', `${formatPace(frame.speed, options.units)} ${paceLabel(options.units).slice(1)}`],
      ['ELEV', `${formatElevation(frame.ele, options.units)} ${elevationLabel(options.units)}`],
      ['GAIN', `+${formatElevation(frame.elevGain, options.units)} ${elevationLabel(options.units)}`],
      ['GRAD', `${frame.grade >= 0 ? '+' : ''}${frame.grade.toFixed(1)} %`],
    ];
    if (options.showHeartRate && frame.hr) rows.push(['HR', `${Math.round(frame.hr)} BPM`]);
    if (frame.cad) rows.push(['CAD', `${Math.round(frame.cad)} SPM`]);

    const rowH = 46;
    const panelH = rows.length * rowH + 36;
    const panelW = 430;
    const y0 = p.H - 300 - panelH;
    p.fillRoundRect(M, y0, panelW, panelH, 4, palette.panel, 1);
    p.strokeRoundRect(M, y0, panelW, panelH, 4, withAlpha(palette.accent, 0.35), 1.5);

    rows.forEach(([key, value], i) => {
      const y = y0 + 44 + i * rowH;
      p.text(key, M + 24, y, { font: mono, size: 18, weight: 400, color: palette.textDim, tracking: 2 });
      p.text(value, M + panelW - 24, y, {
        font: mono,
        size: 26,
        weight: 700,
        color: palette.text,
        align: 'right',
      });
      if (i < rows.length - 1) {
        p.line(M + 20, y + 14, M + panelW - 20, y + 14, palette.textDim, 1, 0.14);
      }
    });
  }

  if (options.showElevationProfile) {
    const h = 150;
    const y = p.H - 230;
    p.text('ELEVATION', M, y - 14, {
      font: mono,
      size: 15,
      weight: 400,
      color: palette.textDim,
      tracking: 3,
    });
    p.text(
      `${formatElevation(activity.minEle, options.units)}–${formatElevation(activity.maxEle, options.units)} ${elevationLabel(options.units)}`,
      p.W - M,
      y - 14,
      { font: mono, size: 15, weight: 400, color: palette.textDim, align: 'right' },
    );
    drawProfile(p, input, M, y, p.W - M * 2, h, { fillAlpha: 0.6, lineWidth: 1.5 });
  }

  if (options.showProgressBar) {
    const y = p.H - M - 34;
    drawProgressBar(p, input, M, y, p.W - M * 2, 6);
    p.text(`${(input.progress * 100).toFixed(0)}%`, p.W - M, y - 16, {
      font: mono,
      size: 16,
      weight: 700,
      color: palette.accent,
      align: 'right',
    });
  }

  drawWatermark(p, input, p.H - M + 6);
  if (options.showSplitToasts) drawSplitToast(p, input, 300, 'chip');
}

function drawPoster(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 80;
  const { title, subtitle } = headerLines(input);
  const intro = easeOutCubic(clamp01(input.time / 1.0));

  if (options.showTitle) {
    p.text(subtitle.toUpperCase(), p.W / 2, 150, {
      font: theme.fonts.body,
      size: 17,
      weight: 700,
      color: palette.textDim,
      align: 'center',
      alpha: intro,
      tracking: 6,
    });
    p.text(title, p.W / 2, 232, {
      font: theme.fonts.display,
      size: 66,
      weight: 400,
      color: palette.text,
      align: 'center',
      alpha: intro,
    });
    p.line(p.W / 2 - 60 * intro, 268, p.W / 2 + 60 * intro, 268, palette.accent, 2, intro);
  }

  const bottom = p.H - 120;
  const stats = options.showStats ? buildStats(input, 4) : [];
  const gridTop = bottom - 190;

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, options.units);
    p.text(value, p.W / 2, gridTop - 70, {
      font: theme.fonts.display,
      size: 150,
      weight: 400,
      color: palette.text,
      align: 'center',
    });
    p.text(distanceLabel(options.units), p.W / 2, gridTop - 24, {
      font: theme.fonts.body,
      size: 20,
      weight: 700,
      color: palette.accent,
      align: 'center',
      tracking: 8,
    });
  }

  if (stats.length) {
    const colW = (p.W - M * 2) / stats.length;
    p.line(M, gridTop + 20, p.W - M, gridTop + 20, palette.textDim, 1, 0.3);
    stats.forEach((stat, i) => {
      const cx = M + colW * i + colW / 2;
      p.text(stat.label, cx, gridTop + 58, {
        font: theme.fonts.body,
        size: 14,
        weight: 700,
        color: palette.textDim,
        align: 'center',
        tracking: 3,
      });
      p.text(stat.value, cx, gridTop + 108, {
        font: theme.fonts.display,
        size: 44,
        weight: 400,
        color: palette.text,
        align: 'center',
      });
      if (i > 0) {
        p.line(M + colW * i, gridTop + 36, M + colW * i, gridTop + 120, palette.textDim, 1, 0.2);
      }
    });
    p.line(M, gridTop + 140, p.W - M, gridTop + 140, palette.textDim, 1, 0.3);
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, M, bottom - 10, p.W - M * 2, 62, {
      fillAlpha: 0.5,
      showMarker: false,
      lineWidth: 1.5,
    });
  }

  if (options.showProgressBar) {
    p.line(M, p.H - 62, p.W - M, p.H - 62, palette.textDim, 1.5, 0.25);
    p.line(M, p.H - 62, M + (p.W - M * 2) * clamp01(input.progress), p.H - 62, palette.accent, 1.5, 1);
  }

  drawWatermark(p, input, p.H - 34);
  if (options.showSplitToasts) drawSplitToast(p, input, 330, 'chip');
}

function drawBroadcast(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 48;
  const { title, subtitle } = headerLines(input);
  const intro = easeOutCubic(clamp01(input.time / 0.7));

  if (options.showTitle) {
    const w = p.measure(title.toUpperCase(), theme.fonts.display, 40) + 130;
    p.fillRoundRect(M, 110, w * intro, 62, 4, palette.panel, 1);
    p.fillRoundRect(M, 110, 8, 62, 0, palette.accent, intro);
    if (intro > 0.6) {
      p.text(title.toUpperCase(), M + 28, 149, {
        font: theme.fonts.display,
        size: 40,
        weight: 400,
        color: palette.text,
        alpha: (intro - 0.6) / 0.4,
        tracking: 1,
      });
    }
    p.text(subtitle, M + 4, 200, {
      font: theme.fonts.body,
      size: 17,
      weight: 600,
      color: palette.textDim,
      alpha: intro * 0.9,
      tracking: 2,
    });
  }

  // lower third
  const barH = 168;
  const y = p.H - 236;
  p.fillRoundRect(M, y, p.W - M * 2, barH, 6, palette.panel, 1);
  p.fillRoundRect(M, y, 10, barH, 0, palette.accent, 1);

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, options.units);
    p.text(value, M + 40, y + 116, {
      font: theme.fonts.display,
      size: 112,
      weight: 400,
      color: palette.text,
    });
    const w = p.measure(value, theme.fonts.display, 112);
    p.text(distanceLabel(options.units), M + 48 + w, y + 116, {
      font: theme.fonts.display,
      size: 38,
      weight: 400,
      color: palette.accent,
    });
    p.text('MESAFE', M + 42, y + 48, {
      font: theme.fonts.body,
      size: 15,
      weight: 700,
      color: palette.textDim,
      tracking: 3,
    });
  }

  if (options.showStats) {
    const stats = buildStats(input, 3);
    const right = p.W - M - 40;
    const colW = 170;
    stats.slice(0, 3).forEach((stat, i) => {
      const x = right - colW * (2 - i);
      p.text(stat.label, x, y + 48, {
        font: theme.fonts.body,
        size: 14,
        weight: 700,
        color: palette.textDim,
        align: 'right',
        tracking: 2,
      });
      p.text(stat.value, x, y + 104, {
        font: theme.fonts.display,
        size: 48,
        weight: 400,
        color: palette.text,
        align: 'right',
      });
      if (i > 0) p.line(x - colW + 24, y + 34, x - colW + 24, y + 118, palette.textDim, 1, 0.2);
    });
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, M + 30, y + barH - 18, p.W - M * 2 - 60, 44, {
      fillAlpha: 0.5,
      showMarker: false,
      lineWidth: 1.2,
    });
  }

  if (options.showProgressBar) drawProgressBar(p, input, M, p.H - 52, p.W - M * 2, 8);
  drawWatermark(p, input, p.H - 24);
  if (options.showSplitToasts) drawSplitToast(p, input, y - 110, 'bar');
}

function drawZen(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const intro = easeOutCubic(clamp01(input.time / 1.2));
  const bottom = p.H - 200;

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, options.units);
    p.text(value, p.W / 2, bottom, {
      font: theme.fonts.body,
      size: 150,
      weight: 200,
      color: palette.text,
      align: 'center',
      alpha: intro,
    });
    p.text(distanceLabel(options.units).toLowerCase(), p.W / 2, bottom + 46, {
      font: theme.fonts.body,
      size: 24,
      weight: 300,
      color: palette.textDim,
      align: 'center',
      alpha: intro,
      tracking: 8,
    });
  }

  if (options.showStats) {
    p.text(formatDuration(frame.elapsed), p.W / 2, bottom - 190, {
      font: theme.fonts.body,
      size: 36,
      weight: 200,
      color: palette.textDim,
      align: 'center',
      alpha: intro,
      tracking: 4,
    });
  }

  if (options.showTitle) {
    const { title } = headerLines(input);
    p.text(title, p.W / 2, 160, {
      font: theme.fonts.body,
      size: 26,
      weight: 300,
      color: palette.textDim,
      align: 'center',
      alpha: intro * 0.85,
      tracking: 2,
    });
  }

  if (options.showProgressBar) {
    const w = 300;
    p.line((p.W - w) / 2, p.H - 108, (p.W + w) / 2, p.H - 108, palette.textDim, 1, 0.25);
    p.line(
      (p.W - w) / 2,
      p.H - 108,
      (p.W - w) / 2 + w * clamp01(input.progress),
      p.H - 108,
      palette.accent,
      1,
      1,
    );
  }

  drawWatermark(p, input, p.H - 64);
}

function drawChrono(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 64;
  const intro = easeOutCubic(clamp01(input.time / 0.9));
  const { title } = headerLines(input);

  if (options.showTitle) {
    p.text(title.toUpperCase(), p.W / 2, 150, {
      font: theme.fonts.body,
      size: 20,
      weight: 700,
      color: palette.textDim,
      align: 'center',
      alpha: intro,
      tracking: 5,
    });
  }

  // the clock is the hero
  const clock = formatDuration(frame.elapsed, true);
  const bottom = p.H - 300;
  p.text(clock, p.W / 2, bottom, {
    font: theme.fonts.display,
    size: 132,
    weight: 700,
    color: palette.text,
    align: 'center',
    glow: 24,
    glowColor: withAlpha(palette.accent, 0.45),
  });
  p.text('GEÇEN SÜRE', p.W / 2, bottom - 150, {
    font: theme.fonts.body,
    size: 16,
    weight: 700,
    color: palette.accent,
    align: 'center',
    tracking: 6,
  });

  if (options.showStats) {
    const u = options.units;
    const cells: [string, string][] = [
      [distanceLabel(u), formatDistance(frame.distance, u)],
      [`TEMPO ${paceLabel(u)}`, formatPace(frame.speed, u)],
      [elevationLabel(u), `+${formatElevation(frame.elevGain, u)}`],
    ];
    const colW = (p.W - M * 2) / cells.length;
    cells.forEach(([label, value], i) => {
      const cx = M + colW * i + colW / 2;
      p.text(label, cx, bottom + 52, {
        font: theme.fonts.body,
        size: 14,
        weight: 700,
        color: palette.textDim,
        align: 'center',
        tracking: 3,
      });
      p.text(value, cx, bottom + 104, {
        font: theme.fonts.display,
        size: 46,
        weight: 700,
        color: palette.text,
        align: 'center',
      });
      if (i > 0) {
        p.line(M + colW * i, bottom + 30, M + colW * i, bottom + 116, palette.textDim, 1, 0.22);
      }
    });
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, M, p.H - 150, p.W - M * 2, 54, {
      fillAlpha: 0.5,
      showMarker: false,
      lineWidth: 1.5,
    });
  }
  if (options.showProgressBar) drawProgressBar(p, input, M, p.H - 84, p.W - M * 2, 6);
  drawWatermark(p, input, p.H - 46);
  if (options.showSplitToasts) drawSplitToast(p, input, 250, 'chip');
}

function drawBib(p: Painter, input: HudInput) {
  const { palette, theme, options, frame, activity } = input;
  const M = 56;
  const intro = easeOutCubic(clamp01(input.time / 0.8));
  const { title, subtitle } = headerLines(input);
  const u = options.units;

  // race bib pinned to the bottom
  const bibW = p.W - M * 2;
  const bibH = 300;
  const bibY = p.H - bibH - 110;
  p.fillRoundRect(M, bibY, bibW, bibH, 10, palette.panel, 1);
  p.strokeRoundRect(M, bibY, bibW, bibH, 10, withAlpha(palette.textDim, 0.4), 1.5);
  // pin holes
  for (const x of [M + 30, M + bibW - 30]) p.circle(x, bibY + 26, 6, palette.textDim, 0.5);

  if (options.showTitle) {
    p.text(title.toUpperCase(), p.W / 2, bibY + 62, {
      font: theme.fonts.body,
      size: 17,
      weight: 700,
      color: palette.textDim,
      align: 'center',
      alpha: intro,
      tracking: 4,
    });
  }

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, u);
    p.text(value, p.W / 2, bibY + 190, {
      font: theme.fonts.display,
      size: 128,
      weight: 400,
      color: palette.text,
      align: 'center',
    });
    p.text(distanceLabel(u), p.W / 2, bibY + 226, {
      font: theme.fonts.body,
      size: 18,
      weight: 700,
      color: palette.accent,
      align: 'center',
      tracking: 8,
    });
  }

  p.line(M + 40, bibY + 250, M + bibW - 40, bibY + 250, palette.textDim, 1, 0.3);
  if (options.showStats) {
    const cells = [
      formatDuration(frame.elapsed),
      `${formatPace(frame.speed, u)}${paceLabel(u)}`,
      `+${formatElevation(frame.elevGain, u)}${elevationLabel(u).toLowerCase()}`,
    ];
    const colW = bibW / cells.length;
    cells.forEach((value, i) => {
      p.text(value, M + colW * i + colW / 2, bibY + 282, {
        font: theme.fonts.mono,
        size: 24,
        weight: 700,
        color: palette.text,
        align: 'center',
      });
    });
  }

  // completed splits stack up the right edge
  if (options.showStats) {
    const done = activity.splits.filter(
      (s) => splitProgress(s, activity, input.pacing) <= input.progress,
    );
    const shown = done.slice(-6);
    shown.forEach((split, i) => {
      const y = 210 + i * 46;
      const age = clamp01((input.progress - splitProgress(split, activity, input.pacing)) * 60);
      p.text(`${split.index}`, p.W - M - 96, y, {
        font: theme.fonts.mono,
        size: 17,
        weight: 700,
        color: palette.accent,
        align: 'right',
        alpha: 0.35 + age * 0.65,
      });
      p.text(formatPace(1000 / Math.max(1, split.duration), u), p.W - M, y, {
        font: theme.fonts.mono,
        size: 22,
        weight: 700,
        color: palette.text,
        align: 'right',
        alpha: 0.35 + age * 0.65,
      });
    });
    if (shown.length) {
      p.text('SPLIT', p.W - M, 170, {
        font: theme.fonts.body,
        size: 13,
        weight: 700,
        color: palette.textDim,
        align: 'right',
        tracking: 4,
      });
    }
  }

  if (options.showTitle) {
    p.text(subtitle, M, 160, {
      font: theme.fonts.body,
      size: 16,
      weight: 600,
      color: palette.textDim,
      alpha: intro * 0.9,
      tracking: 1,
    });
  }

  if (options.showProgressBar) drawProgressBar(p, input, M, p.H - 78, p.W - M * 2, 6);
  drawWatermark(p, input, p.H - 40);
  if (options.showSplitToasts) drawSplitToast(p, input, 300, 'chip');
}

function drawCard(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 44;
  const intro = easeOutCubic(clamp01(input.time / 0.8));
  const { title, subtitle } = headerLines(input);
  const u = options.units;

  const cardH = options.showElevationProfile ? 400 : 320;
  const cardY = p.H - cardH - 78;
  const cardW = p.W - M * 2;

  p.fillRoundRect(M, cardY, cardW, cardH, 30, palette.panel, 1);
  p.strokeRoundRect(M, cardY, cardW, cardH, 30, withAlpha(palette.text, 0.1), 1.5);

  const pad = 40;
  if (options.showTitle) {
    p.text(title, M + pad, cardY + 62, {
      font: theme.fonts.body,
      size: 30,
      weight: 700,
      color: palette.text,
      alpha: intro,
    });
    p.text(subtitle, M + pad, cardY + 96, {
      font: theme.fonts.body,
      size: 16,
      weight: 500,
      color: palette.textDim,
      alpha: intro * 0.9,
    });
  }

  if (options.showBigDistance) {
    const value = formatDistance(frame.distance, u);
    p.text(value, M + pad, cardY + 200, {
      font: theme.fonts.body,
      size: 92,
      weight: 700,
      color: palette.text,
    });
    const w = p.measure(value, theme.fonts.body, 92, 700);
    p.text(distanceLabel(u).toLowerCase(), M + pad + w + 12, cardY + 200, {
      font: theme.fonts.body,
      size: 24,
      weight: 600,
      color: palette.accent,
    });
  }

  if (options.showStats) {
    const cells: [string, string][] = [
      ['Süre', formatDuration(frame.elapsed)],
      ['Tempo', `${formatPace(frame.speed, u)}${paceLabel(u).toLowerCase()}`],
      ['Yükseliş', `${formatElevation(frame.elevGain, u)} ${elevationLabel(u).toLowerCase()}`],
    ];
    if (options.showHeartRate && frame.hr) {
      cells.push(['Nabız', `${Math.round(frame.hr)} bpm`]);
    }
    const colW = (cardW - pad * 2) / cells.length;
    cells.forEach(([label, value], i) => {
      const x = M + pad + colW * i;
      p.text(label, x, cardY + 250, {
        font: theme.fonts.body,
        size: 14,
        weight: 600,
        color: palette.textDim,
      });
      p.text(value, x, cardY + 284, {
        font: theme.fonts.body,
        size: 26,
        weight: 700,
        color: palette.text,
      });
    });
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, M + pad, cardY + cardH - 40, cardW - pad * 2, 62, {
      fillAlpha: 0.55,
      lineWidth: 1.5,
    });
  }

  if (options.showProgressBar) drawProgressBar(p, input, M + pad, p.H - 58, cardW - pad * 2, 6);
  drawWatermark(p, input, p.H - 26);
  if (options.showSplitToasts) drawSplitToast(p, input, 280, 'chip');
}

function drawRetro(p: Painter, input: HudInput) {
  const { ctx } = p;
  const { palette, theme, options, frame } = input;
  const intro = easeOutCubic(clamp01(input.time / 0.9));
  const { title, subtitle } = headerLines(input);
  const u = options.units;

  // scanlines across the whole frame
  ctx.save();
  ctx.globalAlpha = palette.light ? 0.05 : 0.12;
  ctx.fillStyle = palette.bgBottom;
  for (let y = 0; y < p.H; y += 5) ctx.fillRect(0, y, p.W, 2);
  ctx.restore();

  const shadow = (str: string, x: number, y: number, size: number, font: string) => {
    p.text(str, x + 6, y + 6, {
      font,
      size,
      color: palette.route[2],
      align: 'center',
      alpha: 0.85,
    });
    p.text(str, x, y, { font, size, color: palette.text, align: 'center' });
  };

  if (options.showTitle) {
    p.text(subtitle.toUpperCase(), p.W / 2, 148, {
      font: theme.fonts.body,
      size: 16,
      weight: 700,
      color: palette.accent,
      align: 'center',
      alpha: intro,
      tracking: 7,
    });
    shadow(title.toUpperCase(), p.W / 2, 226, 62, theme.fonts.display);
    p.line(p.W / 2 - 150 * intro, 252, p.W / 2 + 150 * intro, 252, palette.accent, 3, intro);
  }

  const bottom = p.H - 270;
  if (options.showBigDistance) {
    shadow(`${formatDistance(frame.distance, u)} ${distanceLabel(u)}`, p.W / 2, bottom, 116, theme.fonts.display);
  }

  if (options.showStats) {
    const cells = [
      formatDuration(frame.elapsed),
      `${formatPace(frame.speed, u)}${paceLabel(u)}`,
      `+${formatElevation(frame.elevGain, u)}${elevationLabel(u).toLowerCase()}`,
    ];
    const colW = p.W / cells.length;
    cells.forEach((value, i) => {
      p.text(value, colW * i + colW / 2, bottom + 78, {
        font: theme.fonts.display,
        size: 46,
        weight: 400,
        color: palette.accent,
        align: 'center',
      });
    });
  }

  if (options.showElevationProfile) {
    drawProfile(p, input, 60, p.H - 130, p.W - 120, 56, {
      fillAlpha: 0.65,
      showMarker: false,
      lineWidth: 2,
    });
  }
  if (options.showProgressBar) drawProgressBar(p, input, 60, p.H - 72, p.W - 120, 10);
  drawWatermark(p, input, p.H - 36);
  if (options.showSplitToasts) drawSplitToast(p, input, 320, 'chip');
}

function drawTicker(p: Painter, input: HudInput) {
  const { palette, theme, options, frame } = input;
  const M = 40;
  const u = options.units;
  const { title, subtitle } = headerLines(input);
  const intro = easeOutCubic(clamp01(input.time / 0.6));

  // slim top slate
  if (options.showTitle) {
    p.fillRoundRect(M, 108, p.W - M * 2, 54, 4, palette.panel, intro);
    p.fillRoundRect(M, 108, 5, 54, 0, palette.accent, intro);
    p.text(title.toUpperCase(), M + 20, 142, {
      font: theme.fonts.mono,
      size: 21,
      weight: 700,
      color: palette.text,
      alpha: intro,
      tracking: 1,
    });
    p.text(subtitle, p.W - M - 20, 142, {
      font: theme.fonts.mono,
      size: 14,
      weight: 400,
      color: palette.textDim,
      align: 'right',
      alpha: intro,
    });
  }

  // one-line data band along the bottom
  const bandH = 92;
  const bandY = p.H - bandH - 74;
  p.fillRoundRect(M, bandY, p.W - M * 2, bandH, 4, palette.panel, 1);

  const cells: [string, string][] = [
    [distanceLabel(u), formatDistance(frame.distance, u)],
    ['SÜRE', formatDuration(frame.elapsed)],
    [paceLabel(u).slice(1), formatPace(frame.speed, u)],
    [elevationLabel(u), `+${formatElevation(frame.elevGain, u)}`],
  ];
  if (options.showHeartRate && frame.hr) cells.push(['BPM', `${Math.round(frame.hr)}`]);

  const colW = (p.W - M * 2) / cells.length;
  cells.forEach(([label, value], i) => {
    const cx = M + colW * i + colW / 2;
    p.text(label, cx, bandY + 32, {
      font: theme.fonts.mono,
      size: 12,
      weight: 400,
      color: palette.textDim,
      align: 'center',
      tracking: 3,
    });
    p.text(value, cx, bandY + 72, {
      font: theme.fonts.mono,
      size: 30,
      weight: 700,
      color: palette.text,
      align: 'center',
    });
    if (i > 0) {
      p.line(M + colW * i, bandY + 18, M + colW * i, bandY + bandH - 18, palette.textDim, 1, 0.2);
    }
  });

  if (options.showElevationProfile) {
    drawProfile(p, input, M, bandY - 20, p.W - M * 2, 70, {
      fillAlpha: 0.45,
      showMarker: false,
      lineWidth: 1.2,
    });
  }
  if (options.showProgressBar) drawProgressBar(p, input, M, p.H - 58, p.W - M * 2, 5);
  drawWatermark(p, input, p.H - 28);
  if (options.showSplitToasts) drawSplitToast(p, input, 230, 'chip');
}

const RENDERERS: Record<string, (p: Painter, input: HudInput) => void> = {
  pulse: drawPulse,
  minimal: drawMinimal,
  telemetry: drawTelemetry,
  poster: drawPoster,
  broadcast: drawBroadcast,
  zen: drawZen,
  chrono: drawChrono,
  bib: drawBib,
  card: drawCard,
  retro: drawRetro,
  ticker: drawTicker,
};

export function drawHud(input: HudInput) {
  const p = new Painter(input.ctx, input.width, input.height);
  p.begin();
  p.vignette(input.palette.bgBottom, input.palette.light ? 0.35 : 0.72);
  drawWorldLabels(p, input);
  (RENDERERS[input.theme.hud] ?? drawPulse)(p, input);
  p.end();
}
