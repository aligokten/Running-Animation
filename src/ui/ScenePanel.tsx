import type {
  CameraMode,
  HudOptions,
  PacingMode,
  SafeArea,
  SceneOptions,
  TerrainMode,
  Units,
} from '../types';
import { Field, Panel, Segmented, Slider, TextInput, Toggle } from './controls';

export function ScenePanel({
  options,
  onChange,
  duration,
  onDuration,
}: {
  options: SceneOptions;
  onChange: (next: SceneOptions) => void;
  duration: number;
  onDuration: (value: number) => void;
}) {
  const set = <K extends keyof SceneOptions>(key: K, value: SceneOptions[K]) =>
    onChange({ ...options, [key]: value });

  return (
    <Panel title="Sahne" hint="Kamera hareketi ve 3B rota görünümü.">
      <Field label="Kamera">
        <Segmented<CameraMode>
          value={options.cameraMode}
          onChange={(v) => set('cameraMode', v)}
          options={[
            { value: 'cinematic', label: 'Sinematik' },
            { value: 'follow', label: 'Takip' },
            { value: 'orbit', label: 'Yörünge' },
            { value: 'topdown', label: 'Kuş bakışı' },
          ]}
        />
      </Field>

      <Field label="Hız akışı" hint={options.pacing === 'time' ? 'gerçek tempo' : 'sabit hız'}>
        <Segmented<PacingMode>
          value={options.pacing}
          onChange={(v) => set('pacing', v)}
          options={[
            { value: 'distance', label: 'Mesafeye göre' },
            { value: 'time', label: 'Gerçek tempoya göre' },
          ]}
        />
      </Field>

      <Slider
        label="Video süresi"
        value={duration}
        min={8}
        max={90}
        step={1}
        onChange={onDuration}
        format={(v) => `${v} sn`}
      />
      <Field
        label="Topografya"
        hint={
          options.terrain === 'none'
            ? 'kapalı'
            : 'rotanın yükseklik verisinden türetilir'
        }
      >
        <Segmented<TerrainMode>
          value={options.terrain}
          onChange={(v) => set('terrain', v)}
          options={[
            { value: 'none', label: 'Yok' },
            { value: 'contours', label: 'Eşyükselti' },
            { value: 'relief', label: 'Kabartma' },
          ]}
        />
      </Field>

      {options.terrain !== 'none' && (
        <Slider
          label="Arazi yüksekliği"
          value={options.terrainScale}
          min={0.3}
          max={3}
          step={0.1}
          onChange={(v) => set('terrainScale', v)}
          format={(v) => `${v.toFixed(1)}×`}
        />
      )}

      <Slider
        label="Yükseklik abartısı"
        value={options.elevationScale}
        min={0.2}
        max={3}
        step={0.1}
        onChange={(v) => set('elevationScale', v)}
        format={(v) => `${v.toFixed(1)}×`}
      />
      <Slider
        label="İz kalınlığı"
        value={options.trailWidth}
        min={0.4}
        max={3}
        step={0.1}
        onChange={(v) => set('trailWidth', v)}
        format={(v) => `${v.toFixed(1)}×`}
      />
      <Slider
        label="Yörünge dönüş hızı"
        value={options.rotateSpeed}
        min={0.2}
        max={3}
        step={0.1}
        onChange={(v) => set('rotateSpeed', v)}
        format={(v) => `${v.toFixed(1)}×`}
      />

      <div className="toggles">
        <Toggle
          label="Rotanın tamamını soluk göster"
          checked={options.showGhostRoute}
          onChange={(v) => set('showGhostRoute', v)}
        />
        <Toggle
          label="Yükseklik perdesi"
          checked={options.showCurtain}
          onChange={(v) => set('showCurtain', v)}
        />
        {options.terrain === 'none' && (
          <Toggle
            label="Zemin ızgarası"
            checked={options.showGrid}
            onChange={(v) => set('showGrid', v)}
          />
        )}
        <Toggle
          label="Kilometre işaretleri"
          checked={options.showKmMarkers}
          onChange={(v) => set('showKmMarkers', v)}
        />
        <Toggle
          label="Havada parçacıklar"
          checked={options.showParticles}
          onChange={(v) => set('showParticles', v)}
        />
      </div>
    </Panel>
  );
}

export function HudPanel({
  options,
  onChange,
  hasHeartRate,
}: {
  options: HudOptions;
  onChange: (next: HudOptions) => void;
  hasHeartRate: boolean;
}) {
  const set = <K extends keyof HudOptions>(key: K, value: HudOptions[K]) =>
    onChange({ ...options, [key]: value });

  return (
    <Panel title="Ekran verileri" hint="Videonun üzerinde anlık olarak işlenen bilgiler.">
      <Field label="Başlık" hint="boş bırakılırsa aktivite adı">
        <TextInput
          value={options.title}
          onChange={(v) => set('title', v)}
          placeholder="Sabah Koşusu"
        />
      </Field>
      <Field label="Alt başlık" hint="boş bırakılırsa spor ve tarih">
        <TextInput
          value={options.subtitle}
          onChange={(v) => set('subtitle', v)}
          placeholder="İstanbul · Pazar sabahı"
        />
      </Field>

      <Field
        label="Güvenli alan"
        hint={
          options.safeArea === 'none'
            ? 'tüm kare kullanılır'
            : 'platform arayüzünün altında kalmaz'
        }
      >
        <Segmented<SafeArea>
          value={options.safeArea}
          onChange={(v) => set('safeArea', v)}
          options={[
            { value: 'none', label: 'Kapalı' },
            { value: 'story', label: 'Story' },
            { value: 'reels', label: 'Reels' },
          ]}
        />
      </Field>

      <Field label="Birimler">
        <Segmented<Units>
          value={options.units}
          onChange={(v) => set('units', v)}
          options={[
            { value: 'metric', label: 'km' },
            { value: 'imperial', label: 'mil' },
          ]}
        />
      </Field>

      <div className="toggles">
        <Toggle label="Başlık bloğu" checked={options.showTitle} onChange={(v) => set('showTitle', v)} />
        <Toggle
          label="Büyük mesafe sayacı"
          checked={options.showBigDistance}
          onChange={(v) => set('showBigDistance', v)}
        />
        <Toggle label="İstatistikler" checked={options.showStats} onChange={(v) => set('showStats', v)} />
        <Toggle
          label="Yükseklik profili"
          checked={options.showElevationProfile}
          onChange={(v) => set('showElevationProfile', v)}
        />
        <Toggle
          label="İlerleme çubuğu"
          checked={options.showProgressBar}
          onChange={(v) => set('showProgressBar', v)}
        />
        <Toggle
          label="Kilometre bildirimleri"
          checked={options.showSplitToasts}
          onChange={(v) => set('showSplitToasts', v)}
        />
        {hasHeartRate && (
          <Toggle
            label="Nabız"
            checked={options.showHeartRate}
            onChange={(v) => set('showHeartRate', v)}
          />
        )}
        <Toggle
          label="Uygulama imzası"
          checked={options.showWatermark}
          onChange={(v) => set('showWatermark', v)}
        />
        <Toggle label="Logo" checked={options.showLogo} onChange={(v) => set('showLogo', v)} />
      </div>
    </Panel>
  );
}
