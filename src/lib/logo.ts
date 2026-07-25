/**
 * The app logo, drawn into the video itself.
 *
 * The source asset is white letterforms on transparency, so it is tinted
 * through an offscreen canvas to suit whichever palette is in play. Both the
 * image and every tinted variant are resolved before an export starts, which
 * keeps the render path synchronous and frame-for-frame deterministic.
 */

let logoPromise: Promise<HTMLImageElement | null> | null = null;
let logo: HTMLImageElement | null = null;

const tinted = new Map<string, HTMLCanvasElement>();

export function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      logo = img;
      resolve(img);
    };
    // A missing logo must never break rendering — the HUD falls back to text.
    img.onerror = () => resolve(null);
    img.src = `${import.meta.env.BASE_URL}logo.png`;
  });
  return logoPromise;
}

/** The loaded logo, or null if it is not ready (or failed to load). */
export function getLogo(): HTMLImageElement | null {
  return logo;
}

/** A copy of the logo recoloured to `color`, cached per colour. */
export function getTintedLogo(color: string): HTMLCanvasElement | null {
  if (!logo) return null;
  const cached = tinted.get(color);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(logo, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  tinted.set(color, canvas);
  return canvas;
}
