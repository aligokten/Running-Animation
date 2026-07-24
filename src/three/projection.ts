import * as THREE from 'three';
import type { Activity } from '../types';
import { makeProjector } from '../data/geo';

/** Horizontal size the route is normalised to, in world units. */
const WORLD_SPAN = 200;

export interface RoutePath {
  /** one entry per activity point */
  positions: Float32Array;
  /** smoothed unit tangent per point (xz plane dominant) */
  tangents: Float32Array;
  /** normalised distance along the route, 0..1 */
  ts: Float32Array;
  count: number;
  /** metres -> world units */
  scale: number;
  /** extra multiplier applied to the vertical axis */
  elevationScale: number;
  center: THREE.Vector3;
  radius: number;
  /** world y of the ground plane */
  baseY: number;
  /** world positions of each whole-kilometre marker */
  kmMarkers: { position: THREE.Vector3; km: number }[];
  start: THREE.Vector3;
  finish: THREE.Vector3;
}

export function buildRoutePath(activity: Activity, elevationScale: number): RoutePath {
  const pts = activity.points;
  const n = pts.length;

  let latSum = 0;
  let lonSum = 0;
  for (const p of pts) {
    latSum += p.lat;
    lonSum += p.lon;
  }
  const project = makeProjector(latSum / n, lonSum / n);

  // 1. project to metres
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const [x, z] = project(pts[i].lat, pts[i].lon);
    xs[i] = x;
    zs[i] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // 2. normalise so any route fills a comparable volume
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const scale = WORLD_SPAN / span;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Elevation is exaggerated relative to the route's own relief so that a flat
  // city loop still shows some shape and an alpine climb does not tower away.
  const relief = Math.max(activity.maxEle - activity.minEle, 1);
  const reliefWorld = Math.min(WORLD_SPAN * 0.42, Math.max(WORLD_SPAN * 0.06, relief * scale * 3));
  const yScale = (reliefWorld / relief) * elevationScale;

  const positions = new Float32Array(n * 3);
  const ts = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = (xs[i] - cx) * scale;
    positions[i * 3 + 1] = (activity.smoothEle[i] - activity.minEle) * yScale;
    positions[i * 3 + 2] = (zs[i] - cz) * scale;
    ts[i] = activity.cumDist[i] / Math.max(1, activity.totalDistance);
  }

  // 3. tangents, smoothed so the chase camera does not shake on GPS noise
  const tangents = new Float32Array(n * 3);
  const win = Math.max(2, Math.round(n / 220));
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - win);
    const b = Math.min(n - 1, i + win);
    v.set(
      positions[b * 3] - positions[a * 3],
      positions[b * 3 + 1] - positions[a * 3 + 1],
      positions[b * 3 + 2] - positions[a * 3 + 2],
    );
    if (v.lengthSq() < 1e-8) v.set(0, 0, 1);
    v.normalize();
    tangents[i * 3] = v.x;
    tangents[i * 3 + 1] = v.y;
    tangents[i * 3 + 2] = v.z;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const baseY = minY - Math.max(6, (maxY - minY) * 0.25);

  const center = new THREE.Vector3(0, (minY + maxY) / 2, 0);
  // true bounding radius, so the wide shot frames the route rather than a box
  let radiusSq = 0;
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - center.x;
    const dy = positions[i * 3 + 1] - center.y;
    const dz = positions[i * 3 + 2] - center.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > radiusSq) radiusSq = d;
  }
  const radius = Math.max(WORLD_SPAN * 0.25, Math.sqrt(radiusSq));

  const kmMarkers: { position: THREE.Vector3; km: number }[] = [];
  for (const split of activity.splits) {
    const i = Math.min(n - 1, split.pointIndex);
    kmMarkers.push({
      position: new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      ),
      km: split.index,
    });
  }

  return {
    positions,
    tangents,
    ts,
    count: n,
    scale,
    elevationScale: yScale,
    center,
    radius,
    baseY,
    kmMarkers,
    start: new THREE.Vector3(positions[0], positions[1], positions[2]),
    finish: new THREE.Vector3(
      positions[(n - 1) * 3],
      positions[(n - 1) * 3 + 1],
      positions[(n - 1) * 3 + 2],
    ),
  };
}

/** Position on the route at fractional progress `t` (0..1 by distance). */
export function positionAt(path: RoutePath, t: number, out: THREE.Vector3): THREE.Vector3 {
  const f = Math.min(1, Math.max(0, t)) * (path.count - 1);
  const i = Math.floor(f);
  const k = f - i;
  const j = Math.min(path.count - 1, i + 1);
  out.set(
    path.positions[i * 3] * (1 - k) + path.positions[j * 3] * k,
    path.positions[i * 3 + 1] * (1 - k) + path.positions[j * 3 + 1] * k,
    path.positions[i * 3 + 2] * (1 - k) + path.positions[j * 3 + 2] * k,
  );
  return out;
}

/** Smoothed tangent at fractional progress `t`. */
export function tangentAt(path: RoutePath, t: number, out: THREE.Vector3): THREE.Vector3 {
  const f = Math.min(1, Math.max(0, t)) * (path.count - 1);
  const i = Math.floor(f);
  const k = f - i;
  const j = Math.min(path.count - 1, i + 1);
  out.set(
    path.tangents[i * 3] * (1 - k) + path.tangents[j * 3] * k,
    path.tangents[i * 3 + 1] * (1 - k) + path.tangents[j * 3 + 1] * k,
    path.tangents[i * 3 + 2] * (1 - k) + path.tangents[j * 3 + 2] * k,
  );
  if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
  return out.normalize();
}

/**
 * Convert progress-by-distance into the index space used by the path arrays.
 * `RoutePath.ts` is monotonic, so a linear scan from a hint is enough.
 */
export function progressToT(path: RoutePath, distanceFraction: number): number {
  const target = Math.min(1, Math.max(0, distanceFraction));
  let lo = 0;
  let hi = path.count - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.ts[mid] <= target) lo = mid;
    else hi = mid;
  }
  const a = path.ts[lo];
  const b = path.ts[hi];
  const k = b > a ? (target - a) / (b - a) : 0;
  return (lo + k) / (path.count - 1);
}
