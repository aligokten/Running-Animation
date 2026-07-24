import { useEffect, useRef, useState } from 'react';
import type { Activity } from '../types';
import { parseActivityFile } from '../data/parsers';
import { createDemoActivity } from '../data/demo';
import {
  beginStravaAuth,
  clearStrava,
  exchangeCode,
  fetchStravaActivity,
  listActivities,
  loadStravaState,
  parseActivityId,
  redirectUri,
  saveStravaApp,
  type StravaActivitySummary,
} from '../data/strava';
import { Button, Field, Notice, Panel, TextInput } from './controls';
import { formatDistance, formatDuration } from '../lib/format';

export function DataPanel({
  activity,
  onActivity,
}: {
  activity: Activity | null;
  onActivity: (activity: Activity) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [showStrava, setShowStrava] = useState(false);
  const stored = loadStravaState();
  const [clientId, setClientId] = useState(stored.app?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState(stored.app?.clientSecret ?? '');
  const [token, setToken] = useState('');
  const [activityRef, setActivityRef] = useState('');
  const [connected, setConnected] = useState(Boolean(stored.tokens?.accessToken));
  const [list, setList] = useState<StravaActivitySummary[] | null>(null);

  const load = async (label: string, work: () => Promise<Activity>) => {
    setBusy(label);
    setError(null);
    try {
      onActivity(await work());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void load('Dosya işleniyor…', () => parseActivityFile(file));
  };

  // Finish the OAuth round trip when Strava redirects back with a code.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const app = loadStravaState().app;
    window.history.replaceState({}, '', window.location.pathname);
    if (!app) return;
    setShowStrava(true);
    setBusy('Strava bağlanıyor…');
    exchangeCode(app, code)
      .then(() => {
        setConnected(true);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(null));
  }, []);

  const connect = () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Strava uygulamanızın Client ID ve Client Secret değerlerini girin.');
      return;
    }
    saveStravaApp({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    beginStravaAuth(clientId.trim());
  };

  const loadList = async () => {
    setBusy('Aktiviteler getiriliyor…');
    setError(null);
    try {
      setList(await listActivities(1, token.trim() || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const loadById = () => {
    const id = parseActivityId(activityRef);
    if (!id) {
      setError('Geçerli bir Strava aktivite numarası veya bağlantısı girin.');
      return;
    }
    void load('Strava verisi indiriliyor…', () =>
      fetchStravaActivity(id, token.trim() || undefined),
    );
  };

  return (
    <Panel title="Veri" hint="Koşunuzu yükleyin ya da hazır rotayla deneyin.">
      <div
        className={`dropzone${dragging ? ' is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
        }}
      >
        <strong>GPX veya TCX dosyası bırakın</strong>
        <span>Strava’da aktivite → “Export GPX” ile indirebilirsiniz</span>
        <input
          ref={fileInput}
          type="file"
          accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="row">
        <Button onClick={() => void load('Hazırlanıyor…', async () => createDemoActivity())} full>
          Örnek rotayı yükle
        </Button>
        <Button variant="ghost" onClick={() => setShowStrava((v) => !v)} full>
          {showStrava ? 'Strava’yı gizle' : 'Strava’ya bağlan'}
        </Button>
      </div>

      {activity && (
        <div className="activity-card">
          <strong>{activity.name}</strong>
          <div className="activity-card__stats">
            <span>{formatDistance(activity.totalDistance, 'metric')} km</span>
            <span>{formatDuration(activity.totalTime, true)}</span>
            <span>+{Math.round(activity.elevGain)} m</span>
            <span>{activity.points.length} nokta</span>
          </div>
          {!activity.hasTime && (
            <em>Bu dosyada zaman damgası yok; tempo 5:30/km varsayılarak hesaplandı.</em>
          )}
        </div>
      )}

      {showStrava && (
        <div className="strava">
          <p className="strava__lead">
            <strong>En kolay yol bu değil:</strong> Strava’da aktiviteyi açıp “…” →{' '}
            <em>Export GPX</em> ile indirdiğiniz dosyayı yukarı bırakmanız yeterli. API’yi
            yalnızca aktivitelerinizi buradan listelemek isterseniz kurun.
          </p>
          <ol className="strava__steps">
            <li>
              <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">
                strava.com/settings/api
              </a>{' '}
              adresini açın. Bu sayfa Strava’yı Türkçe kullansanız da İngilizce görünür ve
              menüden ulaşmak zordur, doğrudan bağlantıyı kullanın.
            </li>
            <li>
              Bir uygulamanız yoksa formu doldurup oluşturun. Client ID ve Secret hazır durmaz,
              ancak uygulamayı oluşturunca üretilir.
            </li>
            <li>
              <code>Authorization Callback Domain</code> alanına <code>https://</code> olmadan
              yalnızca <code>{window.location.hostname}</code> yazın.
            </li>
            <li>
              Oluşan sayfada <code>Client ID</code> açıkta, <code>Client Secret</code> ise{' '}
              <em>Show</em> bağlantısının arkasında gizlidir.
            </li>
          </ol>
          {window.location.protocol === 'https:' && (
            <p className="strava__hint">
              Not: Strava’nın jeton değişimi bazı tarayıcılarda CORS nedeniyle engellenir. Bunun
              için yazılan yerel proxy yalnızca uygulamayı kendi bilgisayarınızda çalıştırırken
              devreye girebilir. Burada takılırsanız GPX yolu her koşulda çalışır.
            </p>
          )}

          {!connected ? (
            <>
              <Field label="Client ID">
                <TextInput value={clientId} onChange={setClientId} placeholder="123456" />
              </Field>
              <Field label="Client Secret">
                <TextInput
                  value={clientSecret}
                  onChange={setClientSecret}
                  placeholder="••••••••"
                  type="password"
                />
              </Field>
              <p className="strava__hint">
                Yönlendirme adresi: <code>{redirectUri()}</code>
              </p>
              <Button variant="primary" onClick={connect} full>
                Strava ile yetkilendir
              </Button>
              <Field label="Ya da hazır erişim jetonu" hint="opsiyonel">
                <TextInput
                  value={token}
                  onChange={setToken}
                  placeholder="access_token"
                  type="password"
                />
              </Field>
            </>
          ) : (
            <div className="row">
              <Button variant="ghost" onClick={() => { clearStrava(); setConnected(false); setList(null); }} full>
                Bağlantıyı kes
              </Button>
              <Button onClick={() => void loadList()} full>
                Son aktiviteler
              </Button>
            </div>
          )}

          <Field label="Aktivite numarası veya bağlantısı">
            <TextInput
              value={activityRef}
              onChange={setActivityRef}
              placeholder="https://www.strava.com/activities/1234567890"
            />
          </Field>
          <Button onClick={loadById} full>
            Aktiviteyi getir
          </Button>

          {!connected && !token && (
            <Button variant="ghost" onClick={() => void loadList()} full>
              Son aktiviteleri listele
            </Button>
          )}

          {list && (
            <ul className="strava__list">
              {list.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void load('Strava verisi indiriliyor…', () =>
                        fetchStravaActivity(String(item.id), token.trim() || undefined),
                      )
                    }
                  >
                    <strong>{item.name}</strong>
                    <span>
                      {(item.distance / 1000).toFixed(2)} km ·{' '}
                      {formatDuration(item.moving_time, true)} ·{' '}
                      {new Date(item.start_date_local).toLocaleDateString('tr-TR')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {busy && <Notice kind="info">{busy}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
    </Panel>
  );
}
