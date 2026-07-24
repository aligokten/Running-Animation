import type { Sport, TrackPoint } from '../types';
import { buildActivity } from './activity';
import type { Activity } from '../types';

function textOf(parent: Element, ...names: string[]): string | null {
  for (const name of names) {
    // getElementsByTagName is namespace agnostic for HTML-ish lookups, so try
    // both the plain tag and any namespaced variant.
    const direct = parent.getElementsByTagName(name)[0];
    if (direct?.textContent) return direct.textContent.trim();
    const local = Array.from(parent.getElementsByTagName('*')).find(
      (el) => el.localName === name,
    );
    if (local?.textContent) return local.textContent.trim();
  }
  return null;
}

function numberOf(parent: Element, ...names: string[]): number | undefined {
  const raw = textOf(parent, ...names);
  if (raw == null) return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

function normaliseSport(raw: string | null | undefined): Sport {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('run') || s.includes('koş')) return 'run';
  if (s.includes('ride') || s.includes('bik') || s.includes('cycl')) return 'ride';
  if (s.includes('walk') || s.includes('yürü')) return 'walk';
  if (s.includes('hik')) return 'hike';
  if (s.includes('swim') || s.includes('yüz')) return 'swim';
  return 'other';
}

function parseXml(text: string, label: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error(`${label} dosyası okunamadı: geçersiz XML.`);
  }
  return doc;
}

export function parseGpx(text: string, fileName: string): Activity {
  const doc = parseXml(text, 'GPX');
  const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
  const nodes = trkpts.length ? trkpts : Array.from(doc.getElementsByTagName('rtept'));
  if (!nodes.length) throw new Error('GPX dosyasında hiç <trkpt> noktası bulunamadı.');

  let t0: number | null = null;
  let startedAt: Date | null = null;
  const points: TrackPoint[] = [];

  for (const node of nodes) {
    const lat = Number.parseFloat(node.getAttribute('lat') ?? '');
    const lon = Number.parseFloat(node.getAttribute('lon') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const timeText = textOf(node, 'time');
    let t = points.length; // fallback: one second per sample
    if (timeText) {
      const ms = Date.parse(timeText);
      if (Number.isFinite(ms)) {
        if (t0 === null) {
          t0 = ms;
          startedAt = new Date(ms);
        }
        t = (ms - t0) / 1000;
      }
    }

    points.push({
      lat,
      lon,
      ele: numberOf(node, 'ele') ?? 0,
      t,
      hr: numberOf(node, 'hr', 'heartrate', 'HeartRateBpm'),
      cad: numberOf(node, 'cad', 'cadence'),
    });
  }

  const trkName = textOf(doc.documentElement, 'name');
  const type = textOf(doc.documentElement, 'type');

  return buildActivity(points, {
    name: trkName || fileName.replace(/\.[^.]+$/, ''),
    sport: normaliseSport(type ?? trkName),
    startedAt,
    source: 'gpx',
  });
}

export function parseTcx(text: string, fileName: string): Activity {
  const doc = parseXml(text, 'TCX');
  const nodes = Array.from(doc.getElementsByTagName('Trackpoint'));
  if (!nodes.length) throw new Error('TCX dosyasında hiç <Trackpoint> bulunamadı.');

  let t0: number | null = null;
  let startedAt: Date | null = null;
  const points: TrackPoint[] = [];

  for (const node of nodes) {
    const lat = numberOf(node, 'LatitudeDegrees');
    const lon = numberOf(node, 'LongitudeDegrees');
    if (lat === undefined || lon === undefined) continue;

    const timeText = textOf(node, 'Time');
    let t = points.length;
    if (timeText) {
      const ms = Date.parse(timeText);
      if (Number.isFinite(ms)) {
        if (t0 === null) {
          t0 = ms;
          startedAt = new Date(ms);
        }
        t = (ms - t0) / 1000;
      }
    }

    points.push({
      lat,
      lon,
      ele: numberOf(node, 'AltitudeMeters') ?? 0,
      t,
      hr: numberOf(node, 'Value', 'HeartRateBpm'),
      cad: numberOf(node, 'Cadence', 'RunCadence'),
    });
  }

  const activityNode = doc.getElementsByTagName('Activity')[0];
  return buildActivity(points, {
    name: fileName.replace(/\.[^.]+$/, ''),
    sport: normaliseSport(activityNode?.getAttribute('Sport')),
    startedAt,
    source: 'tcx',
  });
}

export async function parseActivityFile(file: File): Promise<Activity> {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.tcx')) return parseTcx(text, file.name);
  if (lower.endsWith('.gpx')) return parseGpx(text, file.name);
  // Fall back on sniffing the contents so oddly named exports still work.
  if (text.includes('<TrainingCenterDatabase')) return parseTcx(text, file.name);
  if (text.includes('<gpx')) return parseGpx(text, file.name);
  throw new Error(
    'Desteklenmeyen dosya türü. Strava’dan “Export GPX” ile indirdiğiniz .gpx veya .tcx dosyasını yükleyin.',
  );
}
