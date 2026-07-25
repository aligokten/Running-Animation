export type Sport = 'run' | 'ride' | 'walk' | 'hike' | 'swim' | 'other';

/** A single raw sample from a GPX/TCX file or a Strava stream. */
export interface TrackPoint {
  lat: number;
  lon: number;
  /** metres above sea level */
  ele: number;
  /** seconds since the start of the activity */
  t: number;
  /** beats per minute */
  hr?: number;
  /** steps (or revolutions) per minute */
  cad?: number;
}

/** A fully derived activity, ready to be rendered. */
export interface Activity {
  name: string;
  sport: Sport;
  startedAt: Date | null;
  points: TrackPoint[];
  /** cumulative distance in metres, same length as points */
  cumDist: Float64Array;
  /** smoothed speed in m/s, same length as points */
  speed: Float64Array;
  /** smoothed elevation in metres, same length as points */
  smoothEle: Float64Array;
  totalDistance: number;
  totalTime: number;
  movingTime: number;
  elevGain: number;
  elevLoss: number;
  minEle: number;
  maxEle: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCad: number | null;
  hasTime: boolean;
  splits: Split[];
  source: string;
}

export interface Split {
  /** 1-based split index */
  index: number;
  /** distance covered at the end of this split, in metres */
  distance: number;
  /** duration of this split in seconds */
  duration: number;
  /** elapsed time at the end of the split */
  elapsed: number;
  /** elevation change across the split, in metres */
  elevDelta: number;
  /** average heart rate across the split */
  hr: number | null;
  /** index into points where this split ends */
  pointIndex: number;
}

/** State sampled at one instant of the animation. */
export interface Frame {
  /** 0..1 progress along the route */
  p: number;
  lat: number;
  lon: number;
  ele: number;
  distance: number;
  elapsed: number;
  speed: number;
  hr: number | null;
  cad: number | null;
  elevGain: number;
  grade: number;
  /** index of the last completed split */
  splitIndex: number;
}

export type Units = 'metric' | 'imperial';

/**
 * Keeps the overlay clear of the platform's own chrome.
 * 'story' avoids the profile photo at the top and the reply bar at the bottom,
 * 'reels' leaves the taller caption and action stack alone.
 */
export type SafeArea = 'none' | 'story' | 'reels';

export type CameraMode = 'cinematic' | 'follow' | 'orbit' | 'topdown';

export type PacingMode = 'distance' | 'time';

/**
 * Terrain built around the route.
 * 'contours' draws a topographic map, 'relief' a shaded surface.
 */
export type TerrainMode = 'none' | 'contours' | 'relief';

export type ActivityKind = 'race' | 'training';

/** Who ran it, and what it was. Every field is optional. */
export interface RunnerInfo {
  kind: ActivityKind;
  athlete: string;
  club: string;
  /** race name, only used when kind is 'race' */
  raceName: string;
  /** bib number */
  bib: string;
  /** age group or category */
  category: string;
  /** finishing place, e.g. "12/430" */
  placing: string;
  location: string;
  show: boolean;
}

export interface SceneOptions {
  cameraMode: CameraMode;
  pacing: PacingMode;
  /** vertical exaggeration of the elevation profile */
  elevationScale: number;
  /** show the full route faintly before the runner reaches it */
  showGhostRoute: boolean;
  /** draw the vertical curtain under the route */
  showCurtain: boolean;
  showGrid: boolean;
  showKmMarkers: boolean;
  /** terrain built around the route from its own elevation samples */
  terrain: TerrainMode;
  /** vertical exaggeration of the terrain, relative to the route's */
  terrainScale: number;
  /** background particle field */
  showParticles: boolean;
  trailWidth: number;
  rotateSpeed: number;
}

export interface HudOptions {
  title: string;
  subtitle: string;
  showTitle: boolean;
  showBigDistance: boolean;
  showStats: boolean;
  showElevationProfile: boolean;
  showProgressBar: boolean;
  showSplitToasts: boolean;
  showWatermark: boolean;
  /** draw the app logo alongside the signature */
  showLogo: boolean;
  showHeartRate: boolean;
  safeArea: SafeArea;
  units: Units;
}

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** megabits per second */
  bitrate: number;
}
