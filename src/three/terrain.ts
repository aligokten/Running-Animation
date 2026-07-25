import * as THREE from 'three';
import type { RoutePath } from './projection';

const RES = 132;
const MARGIN = 0.38;

export interface TerrainData {
  geometry: THREE.BufferGeometry;
  minY: number;
  maxY: number;
  /** world size of one grid cell, used to pick a contour interval */
  extent: number;
}

const cache = new Map<string, Float32Array>();

/**
 * Interpolates a height field around the route from the route's own elevation
 * samples (inverse distance weighting), then lets it settle back to the base
 * plane towards the edges.
 *
 * This is terrain *implied by the activity*, not survey data: away from the
 * track there is nothing to measure, so the surface is an interpolation and is
 * described as such in the UI.
 */
function heightField(path: RoutePath, key: string): Float32Array {
  const cached = cache.get(key);
  if (cached) return cached;

  // A few hundred sample points are plenty and keep the weighting cheap.
  const stride = Math.max(1, Math.floor(path.count / 320));
  const sx: number[] = [];
  const sz: number[] = [];
  const sy: number[] = [];
  for (let i = 0; i < path.count; i += stride) {
    sx.push(path.positions[i * 3]);
    sy.push(path.positions[i * 3 + 1]);
    sz.push(path.positions[i * 3 + 2]);
  }
  const n = sx.length;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, sx[i]);
    maxX = Math.max(maxX, sx[i]);
    minZ = Math.min(minZ, sz[i]);
    maxZ = Math.max(maxZ, sz[i]);
    meanY += sy[i];
  }
  meanY /= n;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const span = Math.max(spanX, spanZ);
  const half = (span * (1 + MARGIN * 2)) / 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Beyond this distance from the track the surface relaxes to the mean.
  const reach = span * 0.22;
  const reachSq = reach * reach;

  const field = new Float32Array(RES * RES);
  for (let gz = 0; gz < RES; gz++) {
    const wz = cz - half + (gz / (RES - 1)) * half * 2;
    for (let gx = 0; gx < RES; gx++) {
      const wx = cx - half + (gx / (RES - 1)) * half * 2;

      let acc = 0;
      let wsum = 0;
      let nearestSq = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = wx - sx[i];
        const dz = wz - sz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 < nearestSq) nearestSq = d2;
        const w = 1 / (d2 * d2 + 1e-3);
        acc += sy[i] * w;
        wsum += w;
      }
      let h = wsum > 0 ? acc / wsum : meanY;

      // fade the interpolation out where there is nothing to interpolate from
      const t = Math.min(1, nearestSq / reachSq);
      h = h * (1 - t) + meanY * t;

      field[gz * RES + gx] = h;
    }
  }

  // one smoothing pass to take the edge off the interpolation
  const out = new Float32Array(field.length);
  for (let gz = 0; gz < RES; gz++) {
    for (let gx = 0; gx < RES; gx++) {
      let sum = 0;
      let count = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const zz = gz + dz;
          const xx = gx + dx;
          if (zz < 0 || zz >= RES || xx < 0 || xx >= RES) continue;
          sum += field[zz * RES + xx];
          count++;
        }
      }
      out[gz * RES + gx] = sum / count;
    }
  }

  if (cache.size > 6) cache.clear();
  cache.set(key, out);
  return out;
}

export function buildTerrain(path: RoutePath, terrainScale: number, key: string): TerrainData {
  const field = heightField(path, key);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < path.count; i++) {
    minX = Math.min(minX, path.positions[i * 3]);
    maxX = Math.max(maxX, path.positions[i * 3]);
    minZ = Math.min(minZ, path.positions[i * 3 + 2]);
    maxZ = Math.max(maxZ, path.positions[i * 3 + 2]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ);
  const half = (span * (1 + MARGIN * 2)) / 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // The interpolated surface only approximates the track, so a smoothed dip
  // can sit above the trail and hide it. Dropping the whole sheet by a slice
  // of the route's own relief keeps the trail reliably on top.
  let routeMinY = Infinity;
  let routeMaxY = -Infinity;
  for (let i = 0; i < path.count; i++) {
    const y = path.positions[i * 3 + 1];
    if (y < routeMinY) routeMinY = y;
    if (y > routeMaxY) routeMaxY = y;
  }
  const bias = Math.max(1.5, (routeMaxY - routeMinY) * 0.12);

  const positions = new Float32Array(RES * RES * 3);
  let minY = Infinity;
  let maxY = -Infinity;

  for (let gz = 0; gz < RES; gz++) {
    for (let gx = 0; gx < RES; gx++) {
      const i = gz * RES + gx;
      // Scaled about the base plane so exaggerating relief does not lift the
      // whole surface away from the route.
      const h = path.baseY + (field[i] - path.baseY) * terrainScale - bias;
      positions[i * 3] = cx - half + (gx / (RES - 1)) * half * 2;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = cz - half + (gz / (RES - 1)) * half * 2;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }

  const indices = new Uint32Array((RES - 1) * (RES - 1) * 6);
  let k = 0;
  for (let gz = 0; gz < RES - 1; gz++) {
    for (let gx = 0; gx < RES - 1; gx++) {
      const a = gz * RES + gx;
      const b = a + 1;
      const c = a + RES;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return { geometry, minY, maxY, extent: half * 2 };
}
