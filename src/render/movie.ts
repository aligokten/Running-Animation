import type { Activity, HudOptions, SceneOptions } from '../types';
import type { Palette, Theme } from '../themes';
import { createSampler, type Sampler } from '../data/activity';
import { RunScene } from '../three/scene';
import { drawHud } from '../hud';

export interface MovieState {
  activity: Activity;
  theme: Theme;
  palette: Palette;
  sceneOptions: SceneOptions;
  hudOptions: HudOptions;
  /** total animation length in seconds */
  duration: number;
}

/**
 * Progress along the route for a given moment of the animation.
 * A gentle ease keeps the opening and closing shots from snapping, while
 * staying close enough to linear that the pace read-out still feels honest.
 */
export function progressForTime(time: number, duration: number): number {
  const u = Math.max(0, Math.min(1, time / Math.max(0.001, duration)));
  return 0.72 * u + 0.28 * (0.5 - 0.5 * Math.cos(Math.PI * u));
}

/**
 * Draws one composited frame: the 3D route underneath, the live data HUD on
 * top. Preview and export share this exact code path, so what is on screen is
 * what lands in the file.
 */
export class MovieRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scene = new RunScene();
  private state: MovieState | null = null;
  private sampler: Sampler | null = null;
  private width = 1080;
  private height = 1920;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas oluşturulamadı.');
    this.ctx = ctx;
  }

  setSize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.scene.setSize(width, height);
  }

  get size() {
    return { width: this.width, height: this.height };
  }

  setState(state: MovieState) {
    const prev = this.state;
    this.state = state;

    if (!prev || prev.activity !== state.activity) {
      this.sampler = createSampler(state.activity);
      this.scene.setTheme(state.theme, state.palette);
      this.scene.setOptions(state.sceneOptions);
      this.scene.setActivity(state.activity);
      return;
    }
    if (prev.theme !== state.theme || prev.palette !== state.palette) {
      this.scene.setTheme(state.theme, state.palette);
    }
    if (prev.sceneOptions !== state.sceneOptions) {
      this.scene.setOptions(state.sceneOptions);
    }
  }

  setBloomEnabled(enabled: boolean) {
    this.scene.setBloomEnabled(enabled);
  }

  drawAt(time: number) {
    const state = this.state;
    if (!state || !this.sampler) return;

    const progress = progressForTime(time, state.duration);
    const frame = this.sampler(progress, state.sceneOptions.pacing);

    this.scene.render(progress, time);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.scene.canvas, 0, 0, this.width, this.height);

    drawHud({
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      theme: state.theme,
      palette: state.palette,
      options: state.hudOptions,
      activity: state.activity,
      frame,
      progress,
      time,
      duration: state.duration,
      pacing: state.sceneOptions.pacing,
      labels: this.scene.labels(progress),
    });
  }

  dispose() {
    this.scene.dispose();
  }
}
