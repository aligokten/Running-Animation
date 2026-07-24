import type { Activity, Frame, Sport, Split, TrackPoint } from '../types';
import { fractionalIndex, haversine, lerpAt, movingAverage } from './geo';

const MAX_POINTS = 4000;

/** Drop points that are duplicates or obvious GPS spikes. */
function clean(points: TrackPoint[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) continue;
    const prev = out[out.length - 1];
    if (prev) {
      const d = haversine(prev.lat, prev.lon, p.lat, p.lon);
      const dt = p.t - prev.t;
      // same spot, or a jump faster than 40 m/s -> discard
      if (d < 0.15 && dt < 1) continue;
      if (dt > 0 && d / dt > 40) continue;
    }
    out.push({ ...p, ele: Number.isFinite(p.ele) ? p.ele : 0 });
  }
  return out;
}

/** Evenly drop points so heavy files stay interactive. */
function decimate(points: TrackPoint[], max = MAX_POINTS): TrackPoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: TrackPoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function buildActivity(
  rawPoints: TrackPoint[],
  meta: { name?: string; sport?: Sport; startedAt?: Date | null; source?: string } = {},
): Activity {
  let points = decimate(clean(rawPoints));
  if (points.length < 2) {
    throw new Error('Bu dosyada en az iki geçerli GPS noktası bulunamadı.');
  }

  // A route-only file (no timestamps) gets a synthetic 5:30 /km pace so the
  // animation still has something to count.
  const hasTime = points.some((p, i) => i > 0 && p.t > points[i - 1].t);
  const n = points.length;

  const cumDist = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cumDist[i] =
      cumDist[i - 1] +
      haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  const totalDistance = cumDist[n - 1];

  if (!hasTime) {
    const assumedPace = 5.5 * 60; // seconds per km
    points = points.map((p, i) => ({ ...p, t: (cumDist[i] / 1000) * assumedPace }));
  }

  const rawEle = new Float64Array(n);
  for (let i = 0; i < n; i++) rawEle[i] = points[i].ele;
  const smoothEle = movingAverage(rawEle, 9);

  // speed, smoothed over roughly a 15 second window
  const rawSpeed = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dt = points[i].t - points[i - 1].t;
    const dd = cumDist[i] - cumDist[i - 1];
    rawSpeed[i] = dt > 0 ? dd / dt : rawSpeed[i - 1];
  }
  rawSpeed[0] = rawSpeed[1] ?? 0;
  const avgDt = (points[n - 1].t - points[0].t) / Math.max(1, n - 1);
  const speedWindow = Math.max(3, Math.round(15 / Math.max(0.5, avgDt)));
  const speed = movingAverage(rawSpeed, speedWindow);

  let elevGain = 0;
  let elevLoss = 0;
  for (let i = 1; i < n; i++) {
    const d = smoothEle[i] - smoothEle[i - 1];
    if (d > 0.05) elevGain += d;
    else if (d < -0.05) elevLoss += -d;
  }

  let movingTime = 0;
  for (let i = 1; i < n; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt > 0 && dt < 60 && rawSpeed[i] > 0.4) movingTime += dt;
  }

  const hrs = points.map((p) => p.hr).filter((v): v is number => typeof v === 'number' && v > 0);
  const cads = points.map((p) => p.cad).filter((v): v is number => typeof v === 'number' && v > 0);

  const totalTime = points[n - 1].t - points[0].t;

  return {
    name: meta.name?.trim() || 'Adsız Aktivite',
    sport: meta.sport ?? 'run',
    startedAt: meta.startedAt ?? null,
    points,
    cumDist,
    speed,
    smoothEle,
    totalDistance,
    totalTime,
    movingTime: movingTime || totalTime,
    elevGain,
    elevLoss,
    minEle: Math.min(...smoothEle),
    maxEle: Math.max(...smoothEle),
    avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    avgCad: cads.length ? cads.reduce((a, b) => a + b, 0) / cads.length : null,
    hasTime,
    splits: computeSplits(points, cumDist, smoothEle, 1000),
    source: meta.source ?? 'file',
  };
}

export function computeSplits(
  points: TrackPoint[],
  cumDist: Float64Array,
  ele: Float64Array,
  unit: number,
): Split[] {
  const splits: Split[] = [];
  const total = cumDist[cumDist.length - 1];
  const count = Math.floor(total / unit);
  let prevElapsed = points[0].t;
  let prevIdx = 0;
  for (let k = 1; k <= count; k++) {
    const target = k * unit;
    const fi = fractionalIndex(cumDist, target);
    const idx = Math.min(points.length - 1, Math.round(fi));
    const elapsed = lerpAt(
      points.map((p) => p.t),
      fi,
    );
    const hrSamples: number[] = [];
    for (let i = prevIdx; i <= idx; i++) {
      const hr = points[i].hr;
      if (typeof hr === 'number' && hr > 0) hrSamples.push(hr);
    }
    splits.push({
      index: k,
      distance: target,
      duration: elapsed - prevElapsed,
      elapsed,
      elevDelta: lerpAt(ele, fi) - ele[prevIdx],
      hr: hrSamples.length
        ? hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length
        : null,
      pointIndex: idx,
    });
    prevElapsed = elapsed;
    prevIdx = idx;
  }
  return splits;
}

export type Sampler = (p: number, pacing?: 'distance' | 'time') => Frame;

/**
 * Build a sampler that reads the activity at normalised progress `p`.
 * Every lookup table is computed once here so that sampling stays allocation
 * free — it runs for every rendered frame, preview and export alike.
 *
 * `pacing = 'distance'` advances evenly along the route (smooth camera work),
 * `pacing = 'time'` replays the real effort so slow climbs stay slow.
 */
export function createSampler(a: Activity): Sampler {
  const n = a.points.length;
  const times = new Float64Array(n);
  const hrArr = new Float64Array(n);
  const cadArr = new Float64Array(n);
  const gain = new Float64Array(n);
  let anyHr = false;
  let anyCad = false;

  for (let i = 0; i < n; i++) {
    const pt = a.points[i];
    times[i] = pt.t;
    if (typeof pt.hr === 'number' && pt.hr > 0) {
      hrArr[i] = pt.hr;
      anyHr = true;
    } else {
      hrArr[i] = i > 0 ? hrArr[i - 1] : 0;
    }
    if (typeof pt.cad === 'number' && pt.cad > 0) {
      cadArr[i] = pt.cad;
      anyCad = true;
    } else {
      cadArr[i] = i > 0 ? cadArr[i - 1] : 0;
    }
    if (i > 0) {
      const d = a.smoothEle[i] - a.smoothEle[i - 1];
      gain[i] = gain[i - 1] + (d > 0.05 ? d : 0);
    }
  }

  const splitDist = a.splits.length
    ? Float64Array.from(a.splits.map((s) => s.distance))
    : new Float64Array([Infinity]);

  return (p, pacing = 'distance') => {
    const clamped = Math.min(1, Math.max(0, p));
    const fi =
      pacing === 'time'
        ? fractionalIndex(times, times[0] + clamped * a.totalTime)
        : fractionalIndex(a.cumDist, clamped * a.totalDistance);

    const i = Math.floor(fi);
    const f = fi - i;
    const j = Math.min(n - 1, i + 1);
    const p0 = a.points[i];
    const p1 = a.points[j];

    const ele = lerpAt(a.smoothEle, fi);
    const distance = lerpAt(a.cumDist, fi);

    // grade over a ~60 m trailing window
    const back = fractionalIndex(a.cumDist, Math.max(0, distance - 60));
    const dz = ele - lerpAt(a.smoothEle, back);
    const dx = distance - lerpAt(a.cumDist, back);

    // how many whole splits are behind us
    let splitIndex = 0;
    while (splitIndex < splitDist.length && splitDist[splitIndex] <= distance) splitIndex++;

    return {
      p: clamped,
      lat: p0.lat + (p1.lat - p0.lat) * f,
      lon: p0.lon + (p1.lon - p0.lon) * f,
      ele,
      distance,
      elapsed: lerpAt(times, fi) - times[0],
      speed: lerpAt(a.speed, fi),
      hr: anyHr ? lerpAt(hrArr, fi) : null,
      cad: anyCad ? lerpAt(cadArr, fi) : null,
      elevGain: lerpAt(gain, fi),
      grade: dx > 5 ? (dz / dx) * 100 : 0,
      splitIndex,
    };
  };
}
