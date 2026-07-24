import { PALETTES, THEMES, getPalette, getTheme } from '../themes';
import { Panel } from './controls';

export function StylePanel({
  themeId,
  paletteId,
  onTheme,
  onPalette,
}: {
  themeId: string;
  paletteId: string;
  onTheme: (id: string) => void;
  onPalette: (id: string) => void;
}) {
  const theme = getTheme(themeId);
  const palette = getPalette(paletteId);

  return (
    <>
      <Panel title="Tasarım teması" hint={theme.description}>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card${t.id === themeId ? ' is-active' : ''}`}
              onClick={() => onTheme(t.id)}
            >
              <ThemeThumb hud={t.hud} palette={palette} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Renk paleti" hint={`Seçili: ${palette.name}`}>
        <div className="palette-grid">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`palette-card${p.id === paletteId ? ' is-active' : ''}`}
              onClick={() => onPalette(p.id)}
              title={p.name}
            >
              <span
                className="palette-card__bg"
                style={{ background: `linear-gradient(160deg, ${p.bgTop}, ${p.bgBottom})` }}
              >
                <span
                  className="palette-card__route"
                  style={{
                    background: `linear-gradient(90deg, ${p.route[0]}, ${p.route[1]}, ${p.route[2]})`,
                  }}
                />
              </span>
              <span className="palette-card__name">{p.name}</span>
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}

/** Tiny wireframe of each HUD layout so themes are recognisable at a glance. */
function ThemeThumb({ hud, palette }: { hud: string; palette: (typeof PALETTES)[number] }) {
  const bars: Record<string, { x: number; y: number; w: number; h: number; accent?: boolean }[]> = {
    pulse: [
      { x: 8, y: 8, w: 34, h: 4 },
      { x: 8, y: 44, w: 40, h: 12, accent: true },
      { x: 8, y: 60, w: 14, h: 4 },
      { x: 26, y: 60, w: 14, h: 4 },
      { x: 44, y: 60, w: 12, h: 4 },
    ],
    minimal: [
      { x: 8, y: 8, w: 24, h: 3 },
      { x: 8, y: 56, w: 26, h: 8, accent: true },
      { x: 44, y: 58, w: 12, h: 4 },
    ],
    telemetry: [
      { x: 8, y: 8, w: 20, h: 3 },
      { x: 8, y: 30, w: 26, h: 22, accent: true },
      { x: 8, y: 58, w: 48, h: 6 },
    ],
    poster: [
      { x: 16, y: 10, w: 32, h: 5 },
      { x: 18, y: 42, w: 28, h: 10, accent: true },
      { x: 8, y: 58, w: 48, h: 4 },
    ],
    broadcast: [
      { x: 8, y: 8, w: 30, h: 5 },
      { x: 8, y: 46, w: 48, h: 18, accent: true },
    ],
    zen: [{ x: 18, y: 44, w: 28, h: 10, accent: true }],
    chrono: [
      { x: 20, y: 8, w: 24, h: 3 },
      { x: 10, y: 40, w: 44, h: 12, accent: true },
      { x: 12, y: 58, w: 12, h: 4 },
      { x: 26, y: 58, w: 12, h: 4 },
      { x: 40, y: 58, w: 12, h: 4 },
    ],
    bib: [
      { x: 8, y: 10, w: 22, h: 3 },
      { x: 46, y: 22, w: 10, h: 3 },
      { x: 46, y: 30, w: 10, h: 3 },
      { x: 10, y: 44, w: 44, h: 20, accent: true },
    ],
    card: [
      { x: 10, y: 44, w: 44, h: 22, accent: true },
      { x: 14, y: 48, w: 20, h: 4 },
      { x: 14, y: 56, w: 30, h: 6 },
    ],
    retro: [
      { x: 14, y: 12, w: 36, h: 8 },
      { x: 10, y: 42, w: 44, h: 12, accent: true },
      { x: 10, y: 60, w: 44, h: 4 },
    ],
    ticker: [
      { x: 8, y: 8, w: 48, h: 6 },
      { x: 8, y: 52, w: 48, h: 12, accent: true },
    ],
  };
  const items = bars[hud] ?? bars.pulse;
  return (
    <span
      className="theme-card__thumb"
      style={{ background: `linear-gradient(165deg, ${palette.bgTop}, ${palette.bgBottom})` }}
    >
      <span
        className="theme-card__route"
        style={{ background: `linear-gradient(120deg, ${palette.route[0]}, ${palette.route[2]})` }}
      />
      {items.map((b, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${(b.x / 64) * 100}%`,
            top: `${(b.y / 72) * 100}%`,
            width: `${(b.w / 64) * 100}%`,
            height: `${(b.h / 72) * 100}%`,
            borderRadius: 2,
            background: b.accent ? palette.accent : palette.textDim,
            opacity: b.accent ? 0.9 : 0.5,
          }}
        />
      ))}
    </span>
  );
}
