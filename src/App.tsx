import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Activity,
  ExportSettings,
  HudOptions,
  RunnerInfo,
  SceneOptions,
} from './types';
import { createDemoActivity } from './data/demo';
import { MovieRenderer } from './render/movie';
import { ensureFontsLoaded, getPalette, getTheme } from './themes';
import { AbortedError, downloadBlob, recordVideo, safeFileName } from './export/recorder';
import { loadLogo } from './lib/logo';
import { RunnerPanel } from './ui/RunnerPanel';
import { DataPanel } from './ui/DataPanel';
import { ExportPanel } from './ui/ExportPanel';
import { HudPanel, ScenePanel } from './ui/ScenePanel';
import { Preview } from './ui/Preview';
import { StylePanel } from './ui/StylePanel';

const DEFAULT_SCENE: SceneOptions = {
  cameraMode: 'cinematic',
  pacing: 'distance',
  elevationScale: 1,
  showGhostRoute: true,
  showCurtain: true,
  showGrid: true,
  showKmMarkers: true,
  showParticles: true,
  terrain: 'contours',
  terrainScale: 1,
  trailWidth: 1,
  rotateSpeed: 1,
};

const DEFAULT_HUD: HudOptions = {
  title: '',
  subtitle: '',
  showTitle: true,
  showBigDistance: true,
  showStats: true,
  showElevationProfile: true,
  showProgressBar: true,
  showSplitToasts: true,
  showWatermark: true,
  showLogo: true,
  showHeartRate: true,
  safeArea: 'story',
  units: 'metric',
};

const DEFAULT_RUNNER: RunnerInfo = {
  kind: 'training',
  athlete: '',
  club: '',
  raceName: '',
  bib: '',
  category: '',
  placing: '',
  location: '',
  show: true,
};

const DEFAULT_EXPORT: ExportSettings = {
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 30,
  bitrate: 14,
};

/** Preview renders smaller than the export so scrubbing stays smooth. */
function previewSize(width: number, height: number) {
  const scale = Math.min(1, 900 / Math.max(width, height));
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export default function App() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [themeId, setThemeId] = useState('pulse');
  const [paletteId, setPaletteId] = useState('neon-night');
  const [sceneOptions, setSceneOptions] = useState<SceneOptions>(DEFAULT_SCENE);
  const [hudOptions, setHudOptions] = useState<HudOptions>(DEFAULT_HUD);
  const [runner, setRunner] = useState<RunnerInfo>(DEFAULT_RUNNER);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT);

  const [playing, setPlaying] = useState(true);
  const [displayTime, setDisplayTime] = useState(0);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportNote, setExportNote] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const rendererRef = useRef<MovieRenderer | null>(null);
  if (rendererRef.current === null) rendererRef.current = new MovieRenderer();
  const renderer = rendererRef.current;

  const timeRef = useRef(0);
  const playingRef = useRef(playing);
  const exportingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const palette = useMemo(() => getPalette(paletteId), [paletteId]);
  const duration = exportSettings.duration;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Start with the built-in route so the app is never a blank screen.
  // The renderer owns a WebGL context that lives for the lifetime of the page,
  // so it is deliberately not disposed here — StrictMode would tear it down on
  // its simulated remount and leave the preview with a dead context.
  useEffect(() => {
    setActivity(createDemoActivity());
    void Promise.all([ensureFontsLoaded(), loadLogo()]).then(() => setFontsReady(true));
  }, []);

  // Picking a theme moves to its signature palette, unless the user chose one.
  const chooseTheme = useCallback(
    (id: string) => {
      const current = getTheme(themeId);
      if (paletteId === current.defaultPalette) setPaletteId(getTheme(id).defaultPalette);
      setThemeId(id);
    },
    [themeId, paletteId],
  );

  const preview = useMemo(
    () => previewSize(exportSettings.width, exportSettings.height),
    [exportSettings.width, exportSettings.height],
  );

  // Push state into the renderer whenever anything visual changes.
  useEffect(() => {
    if (!activity) return;
    renderer.setSize(preview.width, preview.height);
    renderer.setState({ activity, theme, palette, sceneOptions, hudOptions, runner, duration });
    if (!exportingRef.current) renderer.drawAt(timeRef.current);
  }, [
    renderer,
    activity,
    theme,
    palette,
    sceneOptions,
    hudOptions,
    runner,
    duration,
    preview.width,
    preview.height,
    fontsReady,
  ]);

  // Playback loop.
  useEffect(() => {
    if (!activity) return;
    let raf = 0;
    let last = performance.now();
    let lastUiUpdate = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (exportingRef.current) return;

      if (playingRef.current) {
        timeRef.current += dt;
        if (timeRef.current > duration) timeRef.current = 0;
      }
      renderer.drawAt(timeRef.current);

      if (now - lastUiUpdate > 100) {
        lastUiUpdate = now;
        setDisplayTime(timeRef.current);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [renderer, activity, duration]);

  const handleActivity = useCallback((next: Activity) => {
    setActivity(next);
    timeRef.current = 0;
    setDisplayTime(0);
    setPlaying(true);
  }, []);

  const scrub = useCallback(
    (t: number) => {
      timeRef.current = t;
      setDisplayTime(t);
      if (!exportingRef.current) renderer.drawAt(t);
    },
    [renderer],
  );

  const restorePreviewSize = useCallback(() => {
    renderer.setSize(preview.width, preview.height);
    renderer.drawAt(timeRef.current);
  }, [renderer, preview.width, preview.height]);

  const handleExport = useCallback(async () => {
    if (!activity) return;
    setExportError(null);
    setExportMessage(null);
    setExportProgress(0);
    setExportNote('Hazırlanıyor…');
    setPlaying(false);
    exportingRef.current = true;
    setExporting(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await Promise.all([ensureFontsLoaded(), loadLogo()]);
      renderer.setSize(exportSettings.width, exportSettings.height);

      const result = await recordVideo({
        canvas: renderer.canvas,
        fps: exportSettings.fps,
        duration,
        bitrate: exportSettings.bitrate * 1_000_000,
        renderFrame: (t) => renderer.drawAt(t),
        onProgress: (ratio, note) => {
          setExportProgress(ratio);
          setExportNote(note);
        },
        signal: controller.signal,
      });

      const name = hudOptions.title.trim() || activity.name;
      downloadBlob(
        result.blob,
        `${safeFileName(name)}-${exportSettings.width}x${exportSettings.height}.${result.extension}`,
      );
      setExportMessage(
        result.method === 'webcodecs'
          ? `Video hazır: ${exportSettings.width}×${exportSettings.height}, ${exportSettings.fps} fps, ` +
            `MP4 (${result.codec}).` +
            (result.codec === 'H.264'
              ? ''
              : ' Bu tarayıcıda H.264 bulunmadığı için farklı bir kodek kullanıldı; bazı uygulamalar dönüştürme isteyebilir.')
          : `Video gerçek zamanlı kaydedildi (${result.extension.toUpperCase()}, ${result.codec}). Paylaşım için MP4’e dönüştürmeniz gerekebilir.`,
      );
    } catch (err) {
      if (!(err instanceof AbortedError)) {
        setExportError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      abortRef.current = null;
      exportingRef.current = false;
      setExporting(false);
      restorePreviewSize();
    }
  }, [activity, renderer, exportSettings, duration, hudOptions.title, restorePreviewSize]);

  const handlePoster = useCallback(async () => {
    if (!activity) return;
    setExportError(null);
    setExportMessage(null);
    exportingRef.current = true;
    try {
      await Promise.all([ensureFontsLoaded(), loadLogo()]);
      renderer.setSize(exportSettings.width, exportSettings.height);
      renderer.drawAt(timeRef.current);
      const blob = await new Promise<Blob | null>((resolve) =>
        renderer.canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('Kare dışa aktarılamadı.');
      const name = hudOptions.title.trim() || activity.name;
      downloadBlob(blob, `${safeFileName(name)}-kare.png`);
      setExportMessage('Kare PNG olarak indirildi.');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      exportingRef.current = false;
      restorePreviewSize();
    }
  }, [activity, renderer, exportSettings, hudOptions.title, restorePreviewSize]);

  return (
    <div className="app">
      <header className="app__bar">
        <div className="brand">
          <img className="brand__mark" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          <div className="brand__text">
            <h1>One More Step to Finish</h1>
            <p>Strava verilerinden 3B dikey koşu videosu</p>
          </div>
        </div>
      </header>

      <main className="app__main">
        <div className="app__stage">
          <Preview
            canvas={renderer.canvas}
            playing={playing}
            time={displayTime}
            duration={duration}
            onTogglePlay={() => setPlaying((v) => !v)}
            onScrub={scrub}
            busy={exporting}
          />
        </div>

        <aside className="app__controls">
          <DataPanel activity={activity} onActivity={handleActivity} />
          <StylePanel
            themeId={themeId}
            paletteId={paletteId}
            onTheme={chooseTheme}
            onPalette={setPaletteId}
          />
          <RunnerPanel runner={runner} onChange={setRunner} />
          <ScenePanel
            options={sceneOptions}
            onChange={setSceneOptions}
            duration={duration}
            onDuration={(v) => setExportSettings((s) => ({ ...s, duration: v }))}
          />
          <HudPanel
            options={hudOptions}
            onChange={setHudOptions}
            hasHeartRate={Boolean(activity?.avgHr)}
          />
          <ExportPanel
            settings={exportSettings}
            onChange={setExportSettings}
            onExport={() => void handleExport()}
            onPoster={() => void handlePoster()}
            onCancel={() => abortRef.current?.abort()}
            exporting={exporting}
            progress={exportProgress}
            note={exportNote}
            message={exportMessage}
            error={exportError}
            disabled={!activity}
          />
        </aside>
      </main>
    </div>
  );
}
