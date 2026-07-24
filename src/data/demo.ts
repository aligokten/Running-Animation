import type { Activity, TrackPoint } from '../types';
import { buildActivity } from './activity';

/**
 * A procedurally generated but physically plausible trail run, so the app has
 * something to show before the user loads their own data.
 *
 * The loop sits in Belgrad Forest, north of Istanbul: a rolling ~10 km circuit
 * with two real climbs, pace that reacts to gradient, and a heart rate that
 * lags behind effort the way a real one does.
 */
export function createDemoActivity(): Activity {
  const LAT0 = 41.1795;
  const LON0 = 28.9825;
  const M_PER_DEG_LAT = 111132;
  const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

  const points: TrackPoint[] = [];
  const steps = 2200;

  let t = 0;
  let hr = 118;

  const radiusAt = (a: number) =>
    1450 * (1 + 0.22 * Math.sin(3 * a + 0.4) + 0.13 * Math.cos(5 * a) + 0.07 * Math.sin(8 * a + 1.1));

  const elevationAt = (a: number) =>
    118 +
    46 * Math.sin(a * 1.0 - 0.6) +
    30 * Math.sin(a * 2.3 + 1.7) +
    12 * Math.sin(a * 5.1) +
    5 * Math.sin(a * 11.3 + 0.3);

  let prevX = 0;
  let prevY = 0;
  let prevEle = 0;

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = radiusAt(a);
    const x = Math.cos(a) * r + 90 * Math.sin(a * 4);
    const y = Math.sin(a) * r * 0.82 + 70 * Math.cos(a * 3);
    const ele = elevationAt(a);

    if (i > 0) {
      const dx = x - prevX;
      const dy = y - prevY;
      const dist = Math.hypot(dx, dy);
      const grade = dist > 0 ? (ele - prevEle) / dist : 0;

      // ~5:05 /km on the flat, slowing about 12 s/km per 1 % of climb
      const flatPace = 305;
      const pace = Math.min(
        520,
        Math.max(240, flatPace + grade * 100 * 12 + 8 * Math.sin(i / 55)),
      );
      const speed = 1000 / pace;
      t += dist / speed;

      // effort-driven heart rate with a first-order lag
      const target = 138 + grade * 100 * 3.4 + (i / steps) * 16;
      hr += (Math.min(182, Math.max(112, target)) - hr) * 0.035;
    }

    points.push({
      lat: LAT0 + y / M_PER_DEG_LAT,
      lon: LON0 + x / M_PER_DEG_LON,
      ele,
      t,
      hr: Math.round(hr + Math.sin(i / 9) * 1.5),
      cad: Math.round(176 + Math.sin(i / 24) * 5),
    });

    prevX = x;
    prevY = y;
    prevEle = ele;
  }

  const startedAt = new Date();
  startedAt.setHours(7, 42, 0, 0);

  return buildActivity(points, {
    name: 'Belgrad Ormanı Sabah Koşusu',
    sport: 'run',
    startedAt,
    source: 'demo',
  });
}
