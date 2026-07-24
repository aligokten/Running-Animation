import type { Units } from '../types';

const M_PER_MILE = 1609.344;
const M_PER_FOOT = 0.3048;

export function distanceValue(metres: number, units: Units): number {
  return units === 'imperial' ? metres / M_PER_MILE : metres / 1000;
}

export function distanceLabel(units: Units): string {
  return units === 'imperial' ? 'MI' : 'KM';
}

export function formatDistance(metres: number, units: Units, digits = 2): string {
  return distanceValue(metres, units).toFixed(digits);
}

export function formatDuration(seconds: number, forceHours = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0 || forceHours) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Seconds per kilometre (or mile) from a speed in m/s. */
export function paceSeconds(speedMs: number, units: Units): number | null {
  if (!Number.isFinite(speedMs) || speedMs < 0.28) return null;
  const unit = units === 'imperial' ? M_PER_MILE : 1000;
  return unit / speedMs;
}

export function formatPace(speedMs: number, units: Units): string {
  const pace = paceSeconds(speedMs, units);
  if (pace === null || pace > 3600) return '--:--';
  const m = Math.floor(pace / 60);
  const s = Math.round(pace % 60);
  const carry = s === 60;
  return `${carry ? m + 1 : m}:${String(carry ? 0 : s).padStart(2, '0')}`;
}

export function paceLabel(units: Units): string {
  return units === 'imperial' ? '/MI' : '/KM';
}

export function formatElevation(metres: number, units: Units): string {
  const value = units === 'imperial' ? metres / M_PER_FOOT : metres;
  return Math.round(value).toString();
}

export function elevationLabel(units: Units): string {
  return units === 'imperial' ? 'FT' : 'M';
}

export function formatSpeed(speedMs: number, units: Units): string {
  const value = units === 'imperial' ? speedMs * 2.2369363 : speedMs * 3.6;
  return value.toFixed(1);
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function formatDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()} · ${time}`;
}

export const SPORT_LABELS: Record<string, string> = {
  run: 'KOŞU',
  ride: 'BİSİKLET',
  walk: 'YÜRÜYÜŞ',
  hike: 'DOĞA YÜRÜYÜŞÜ',
  swim: 'YÜZME',
  other: 'AKTİVİTE',
};
