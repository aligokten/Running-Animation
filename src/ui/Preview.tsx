import { useEffect, useRef } from 'react';
import { formatDuration } from '../lib/format';

export function Preview({
  canvas,
  playing,
  time,
  duration,
  onTogglePlay,
  onScrub,
  busy,
}: {
  canvas: HTMLCanvasElement | null;
  playing: boolean;
  time: number;
  duration: number;
  onTogglePlay: () => void;
  onScrub: (time: number) => void;
  busy: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node || !canvas) return;
    canvas.className = 'preview__canvas';
    node.appendChild(canvas);
    return () => {
      if (canvas.parentNode === node) node.removeChild(canvas);
    };
  }, [canvas]);

  return (
    <div className="preview">
      <div className="preview__frame">
        <div className="preview__screen" ref={holder} />
        {busy && (
          <div className="preview__busy">
            <span className="spinner" />
          </div>
        )}
      </div>

      <div className="transport">
        <button
          type="button"
          className="transport__play"
          onClick={onTogglePlay}
          aria-label={playing ? 'Duraklat' : 'Oynat'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
              <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <input
          className="transport__scrub"
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={Math.min(time, duration)}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Zaman çizelgesi"
        />
        <span className="transport__time">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
