import type { ExportSettings } from '../types';
import { supportsWebCodecs } from '../export/recorder';
import { Button, Field, Notice, Panel, Segmented, Slider } from './controls';

const PRESETS: { label: string; width: number; height: number; note: string }[] = [
  { label: '9:16', width: 1080, height: 1920, note: 'Reels · TikTok · Shorts' },
  { label: '9:16 HD', width: 720, height: 1280, note: 'daha hızlı dışa aktarma' },
  { label: '4:5', width: 1080, height: 1350, note: 'Instagram akışı' },
  { label: '1:1', width: 1080, height: 1080, note: 'kare gönderi' },
];

export function ExportPanel({
  settings,
  onChange,
  onExport,
  onPoster,
  onCancel,
  exporting,
  progress,
  note,
  message,
  error,
  disabled,
}: {
  settings: ExportSettings;
  onChange: (next: ExportSettings) => void;
  onExport: () => void;
  onPoster: () => void;
  onCancel: () => void;
  exporting: boolean;
  progress: number;
  note: string;
  message: string | null;
  error: string | null;
  disabled: boolean;
}) {
  const activePreset =
    PRESETS.find((p) => p.width === settings.width && p.height === settings.height) ?? PRESETS[0];

  return (
    <Panel title="Dışa aktar" hint="Videoyu cihazınıza indirin.">
      <Field label="Çözünürlük" hint={activePreset.note}>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`preset${p === activePreset ? ' is-active' : ''}`}
              onClick={() => onChange({ ...settings, width: p.width, height: p.height })}
              disabled={exporting}
            >
              <span
                className="preset__shape"
                style={{ aspectRatio: `${p.width} / ${p.height}` }}
              />
              <b>{p.label}</b>
              <em>
                {p.width}×{p.height}
              </em>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Kare hızı">
        <Segmented<string>
          value={String(settings.fps)}
          onChange={(v) => onChange({ ...settings, fps: Number(v) })}
          options={[
            { value: '24', label: '24' },
            { value: '30', label: '30' },
            { value: '60', label: '60' },
          ]}
        />
      </Field>

      <Slider
        label="Görüntü kalitesi"
        value={settings.bitrate}
        min={4}
        max={40}
        step={1}
        onChange={(v) => onChange({ ...settings, bitrate: v })}
        format={(v) => `${v} Mbps`}
      />

      {exporting ? (
        <>
          <div className="export-progress">
            <div className="export-progress__bar">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="export-progress__meta">
              <span>{note}</span>
              <b>{Math.round(progress * 100)}%</b>
            </div>
          </div>
          <Button variant="danger" onClick={onCancel} full>
            İptal et
          </Button>
        </>
      ) : (
        <div className="row">
          <Button variant="primary" onClick={onExport} disabled={disabled} full>
            Videoyu dışa aktar
          </Button>
          <Button variant="ghost" onClick={onPoster} disabled={disabled} full>
            Kareyi PNG indir
          </Button>
        </div>
      )}

      {!supportsWebCodecs() && (
        <Notice kind="info">
          Bu tarayıcı WebCodecs desteklemiyor. Kayıt gerçek zamanlı yapılacak ve WebM olarak
          inecek; en iyi sonuç için Chrome veya Edge kullanın.
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
    </Panel>
  );
}
