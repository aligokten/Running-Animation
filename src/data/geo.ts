const EARTH_R = 6371008.8;

export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Equirectangular projection around an origin. Accurate enough for a single
 * activity (a few tens of km) and keeps the maths cheap.
 */
export function makeProjector(lat0: number, lon0: number) {
  const mPerDegLat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180);
  const mPerDegLon = 111412.84 * Math.cos((lat0 * Math.PI) / 180);
  return (lat: number, lon: number): [number, number] => [
    (lon - lon0) * mPerDegLon,
    -(lat - lat0) * mPerDegLat,
  ];
}

/** Centred moving average that keeps the array length. */
export function movingAverage(src: ArrayLike<number>, window: number): Float64Array {
  const n = src.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const half = Math.max(0, Math.floor(window / 2));
  let sum = 0;
  let count = 0;
  // prime the window
  for (let i = 0; i <= Math.min(half, n - 1); i++) {
    sum += src[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    out[i] = sum / count;
    const add = i + half + 1;
    const rem = i - half;
    if (add < n) {
      sum += src[add];
      count++;
    }
    if (rem >= 0) {
      sum -= src[rem];
      count--;
    }
  }
  return out;
}

/** Linear interpolation between two array samples. */
export function lerpAt(arr: ArrayLike<number>, index: number): number {
  const i = Math.floor(index);
  const f = index - i;
  if (i < 0) return arr[0];
  if (i >= arr.length - 1) return arr[arr.length - 1];
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

/** Index of the last element <= value, in a sorted ascending array. */
export function searchSorted(arr: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (value <= arr[0]) return 0;
  if (value >= arr[hi]) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Fractional index into a sorted array for a given value. Used to convert a
 * distance (or an elapsed time) into a position along the point list.
 */
export function fractionalIndex(arr: ArrayLike<number>, value: number): number {
  const i = searchSorted(arr, value);
  const a = arr[i];
  const b = arr[Math.min(i + 1, arr.length - 1)];
  if (b === a) return i;
  return i + Math.min(1, Math.max(0, (value - a) / (b - a)));
}
