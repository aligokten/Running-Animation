import type { Activity, Sport, TrackPoint } from '../types';
import { buildActivity } from './activity';

const API = 'https://www.strava.com/api/v3';
const AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const TOKEN_DIRECT = 'https://www.strava.com/oauth/token';
/** Local dev proxy (see server/strava-proxy.mjs) used when CORS blocks the direct call. */
const TOKEN_PROXY = '/api/strava/token';

const STORE_KEY = 'omstf.strava';

export interface StravaTokens {
  accessToken: string;
  refreshToken?: string;
  /** unix seconds */
  expiresAt?: number;
  athlete?: { firstname?: string; lastname?: string };
}

export interface StravaAppConfig {
  clientId: string;
  clientSecret: string;
}

export interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  start_date_local: string;
}

interface StoredState {
  app?: StravaAppConfig;
  tokens?: StravaTokens;
}

function read(): StoredState {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as StoredState;
  } catch {
    return {};
  }
}

function write(state: StoredState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function loadStravaState(): StoredState {
  return read();
}

export function saveStravaApp(app: StravaAppConfig) {
  write({ ...read(), app });
}

export function saveStravaTokens(tokens: StravaTokens) {
  write({ ...read(), tokens });
}

export function clearStrava() {
  localStorage.removeItem(STORE_KEY);
}

export function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Send the user to Strava's consent screen. */
export function beginStravaAuth(clientId: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
  });
  window.location.href = `${AUTHORIZE}?${params.toString()}`;
}

async function postToken(body: Record<string, string>): Promise<StravaTokens> {
  const payload = JSON.stringify(body);
  const attempt = async (url: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!res.ok) throw new Error(`Strava token isteği başarısız (${res.status}).`);
    return (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete?: { firstname?: string; lastname?: string };
    };
  };

  let json;
  try {
    json = await attempt(TOKEN_DIRECT);
  } catch (directError) {
    // Browsers block the direct call in some setups; fall back to the bundled
    // proxy, which keeps the client secret off the wire from the page itself.
    try {
      json = await attempt(TOKEN_PROXY);
    } catch {
      throw new Error(
        `Token değişimi yapılamadı (${(directError as Error).message}). ` +
          '`npm run strava-proxy` komutuyla yerel proxy’yi çalıştırıp tekrar deneyin.',
      );
    }
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at,
    athlete: json.athlete,
  };
}

export async function exchangeCode(app: StravaAppConfig, code: string): Promise<StravaTokens> {
  const tokens = await postToken({
    client_id: app.clientId,
    client_secret: app.clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  saveStravaTokens(tokens);
  return tokens;
}

async function refreshIfNeeded(): Promise<string> {
  const { app, tokens } = read();
  if (!tokens?.accessToken) throw new Error('Strava bağlantısı yok.');
  const stillValid = !tokens.expiresAt || tokens.expiresAt - 60 > Date.now() / 1000;
  if (stillValid || !tokens.refreshToken || !app) return tokens.accessToken;

  const fresh = await postToken({
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });
  saveStravaTokens({ ...fresh, athlete: tokens.athlete });
  return fresh.accessToken;
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  const accessToken = token ?? (await refreshIfNeeded());
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Error('Strava yetkisi geçersiz veya süresi dolmuş. Yeniden bağlanın.');
  }
  if (res.status === 429) {
    throw new Error('Strava API limiti aşıldı, birkaç dakika sonra tekrar deneyin.');
  }
  if (!res.ok) throw new Error(`Strava API hatası (${res.status}).`);
  return (await res.json()) as T;
}

export function listActivities(page = 1, token?: string) {
  return apiGet<StravaActivitySummary[]>(`/athlete/activities?per_page=30&page=${page}`, token);
}

/** Accepts a raw id or any strava.com/activities/<id> URL. */
export function parseActivityId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/activities\/(\d+)/);
  if (fromUrl) return fromUrl[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

function stravaSport(type: string): Sport {
  const s = type.toLowerCase();
  if (s.includes('run')) return 'run';
  if (s.includes('ride') || s.includes('bike')) return 'ride';
  if (s.includes('walk')) return 'walk';
  if (s.includes('hike')) return 'hike';
  if (s.includes('swim')) return 'swim';
  return 'other';
}

interface StreamSet {
  latlng?: { data: [number, number][] };
  altitude?: { data: number[] };
  time?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
}

export async function fetchStravaActivity(id: string, token?: string): Promise<Activity> {
  const detail = await apiGet<{
    name: string;
    type: string;
    sport_type?: string;
    start_date_local: string;
  }>(`/activities/${id}`, token);

  const streams = await apiGet<StreamSet>(
    `/activities/${id}/streams?keys=latlng,altitude,time,heartrate,cadence&key_by_type=true`,
    token,
  );

  const latlng = streams.latlng?.data;
  if (!latlng?.length) {
    throw new Error('Bu aktivitede GPS verisi yok (koşu bandı kaydı olabilir).');
  }

  const altitude = streams.altitude?.data;
  const time = streams.time?.data;
  const hr = streams.heartrate?.data;
  const cad = streams.cadence?.data;

  const points: TrackPoint[] = latlng.map(([lat, lon], i) => ({
    lat,
    lon,
    ele: altitude?.[i] ?? 0,
    t: time?.[i] ?? i,
    hr: hr?.[i],
    cad: cad?.[i],
  }));

  return buildActivity(points, {
    name: detail.name,
    sport: stravaSport(detail.sport_type ?? detail.type),
    startedAt: detail.start_date_local ? new Date(detail.start_date_local) : null,
    source: 'strava',
  });
}
