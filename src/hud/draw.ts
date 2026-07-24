import { withAlpha } from '../lib/color';

export interface TextOptions {
  font: string;
  size: number;
  weight?: number | string;
  color: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  alpha?: number;
  /** letter spacing in px (ignored where unsupported) */
  tracking?: number;
  /** soft glow behind the glyphs */
  glow?: number;
  glowColor?: string;
}

/**
 * Small drawing toolkit shared by every HUD theme. All coordinates are given
 * in the 1080-wide design space and scaled up or down to the real canvas, so
 * a 720p export is pixel-identical in layout to a 4K one.
 */
export class Painter {
  readonly ctx: CanvasRenderingContext2D;
  /** design-space width (always 1080) */
  readonly W: number;
  readonly H: number;
  /** scale from design space to device pixels */
  readonly s: number;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.s = width / 1080;
    this.W = 1080;
    this.H = height / this.s;
  }

  /** Wrap a block of drawing in the design-space transform. */
  begin() {
    this.ctx.save();
    this.ctx.scale(this.s, this.s);
  }

  end() {
    this.ctx.restore();
  }

  text(str: string, x: number, y: number, o: TextOptions) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.font = `${o.weight ?? 400} ${o.size}px ${o.font}`;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.baseline ?? 'alphabetic';
    if (o.tracking !== undefined && 'letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${o.tracking}px`;
    }
    if (o.glow) {
      ctx.shadowColor = o.glowColor ?? o.color;
      ctx.shadowBlur = o.glow;
    }
    ctx.fillStyle = o.color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  measure(str: string, font: string, size: number, weight: number | string = 400): number {
    this.ctx.save();
    this.ctx.font = `${weight} ${size}px ${font}`;
    const w = this.ctx.measureText(str).width;
    this.ctx.restore();
    return w;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number, color: string, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  strokeRoundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    color: string,
    lineWidth = 1,
    alpha = 1,
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    this.roundRect(x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  circle(x: number, y: number, r: number, color: string, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Darkens the frame edges so the HUD keeps its contrast over bright scenes. */
  vignette(color: string, strength: number) {
    const { ctx } = this;
    ctx.save();
    const grad = ctx.createLinearGradient(0, this.H * 0.45, 0, this.H);
    grad.addColorStop(0, withAlpha(color, 0));
    grad.addColorStop(1, withAlpha(color, strength));
    ctx.fillStyle = grad;
    ctx.fillRect(0, this.H * 0.45, this.W, this.H * 0.55);

    const top = ctx.createLinearGradient(0, 0, 0, this.H * 0.28);
    top.addColorStop(0, withAlpha(color, strength * 0.75));
    top.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, this.W, this.H * 0.28);
    ctx.restore();
  }
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export const easeInOutCubic = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
