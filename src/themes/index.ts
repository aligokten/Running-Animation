export interface Palette {
  id: string;
  name: string;
  /** true when the palette is light-on-dark inverted (light background) */
  light: boolean;
  bgTop: string;
  bgBottom: string;
  fog: string;
  /** three colour stops used along the route, start -> finish */
  route: [string, string, string];
  /** the glowing head of the trail / runner marker */
  head: string;
  grid: string;
  ground: string;
  accent: string;
  text: string;
  textDim: string;
  /** rgba string for HUD panel fills */
  panel: string;
}

export type HudStyle =
  | 'pulse'
  | 'minimal'
  | 'telemetry'
  | 'poster'
  | 'broadcast'
  | 'zen'
  | 'chrono'
  | 'bib'
  | 'card'
  | 'retro'
  | 'ticker';

export interface Theme {
  id: string;
  name: string;
  description: string;
  hud: HudStyle;
  fonts: {
    display: string;
    body: string;
    mono: string;
  };
  scene: {
    curtainOpacity: number;
    routeGlow: number;
    gridStyle: 'lines' | 'dots' | 'none';
    /** width multiplier for the trail ribbon */
    trailScale: number;
    /** vertical light beam above the runner */
    beam: boolean;
    /** floating dust particles */
    particles: boolean;
  };
  defaultPalette: string;
}

const SANS = '"Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif';
const DISPLAY = '"Bebas Neue", "Arial Narrow", Impact, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, Menlo, Consolas, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';

export const PALETTES: Palette[] = [
  {
    id: 'neon-night',
    name: 'Neon Gece',
    light: false,
    bgTop: '#0b1026',
    bgBottom: '#05060f',
    fog: '#0a0f24',
    route: ['#22d3ee', '#818cf8', '#f472b6'],
    head: '#ffffff',
    grid: '#1e2a5a',
    ground: '#0d1330',
    accent: '#22d3ee',
    text: '#f8fafc',
    textDim: '#8ea0c8',
    panel: 'rgba(10,16,38,0.55)',
  },
  {
    id: 'solar',
    name: 'Solar Flare',
    light: false,
    bgTop: '#1a0b04',
    bgBottom: '#070402',
    fog: '#160903',
    route: ['#fbbf24', '#fb7185', '#ef4444'],
    head: '#fff7ed',
    grid: '#43220e',
    ground: '#170a04',
    accent: '#fb923c',
    text: '#fff7ed',
    textDim: '#c9a189',
    panel: 'rgba(28,12,4,0.55)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    light: false,
    bgTop: '#031a17',
    bgBottom: '#01080d',
    fog: '#04211c',
    route: ['#34d399', '#22d3ee', '#a78bfa'],
    head: '#ecfeff',
    grid: '#0d3d38',
    ground: '#03211d',
    accent: '#34d399',
    text: '#ecfdf5',
    textDim: '#7fb3a6',
    panel: 'rgba(3,26,23,0.55)',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    light: false,
    bgTop: '#06255c',
    bgBottom: '#02102e',
    fog: '#062252',
    route: ['#ffffff', '#bae6fd', '#38bdf8'],
    head: '#ffffff',
    grid: '#1d4f9e',
    ground: '#052052',
    accent: '#7dd3fc',
    text: '#f0f9ff',
    textDim: '#8ab4e8',
    panel: 'rgba(4,26,66,0.6)',
  },
  {
    id: 'mono',
    name: 'Mono Ink',
    light: false,
    bgTop: '#141414',
    bgBottom: '#000000',
    fog: '#101010',
    route: ['#ffffff', '#d4d4d4', '#8a8a8a'],
    head: '#ffffff',
    grid: '#2b2b2b',
    ground: '#0c0c0c',
    accent: '#ffffff',
    text: '#ffffff',
    textDim: '#9a9a9a',
    panel: 'rgba(0,0,0,0.55)',
  },
  {
    id: 'sunset',
    name: 'Gün Batımı',
    light: false,
    bgTop: '#2b0a3d',
    bgBottom: '#0b0313',
    fog: '#280a38',
    route: ['#f97316', '#ec4899', '#8b5cf6'],
    head: '#fff1f2',
    grid: '#4a1a5e',
    ground: '#1b0726',
    accent: '#f472b6',
    text: '#fdf4ff',
    textDim: '#b79ac6',
    panel: 'rgba(30,8,44,0.55)',
  },
  {
    id: 'forest',
    name: 'Orman Patikası',
    light: false,
    bgTop: '#0a1a0e',
    bgBottom: '#020604',
    fog: '#08190d',
    route: ['#bef264', '#4ade80', '#0d9488'],
    head: '#f7fee7',
    grid: '#1d3a22',
    ground: '#08170c',
    accent: '#a3e635',
    text: '#f7fee7',
    textDim: '#8fae86',
    panel: 'rgba(8,22,12,0.55)',
  },
  {
    id: 'strava',
    name: 'Turuncu Klasik',
    light: false,
    bgTop: '#1c1c1e',
    bgBottom: '#050505',
    fog: '#161618',
    route: ['#fc5200', '#ff8c42', '#ffd166'],
    head: '#ffffff',
    grid: '#333336',
    ground: '#111112',
    accent: '#fc5200',
    text: '#ffffff',
    textDim: '#9e9ea3',
    panel: 'rgba(12,12,13,0.6)',
  },
  {
    id: 'daylight',
    name: 'Gün Işığı',
    light: true,
    bgTop: '#eef2f7',
    bgBottom: '#cdd8e6',
    fog: '#e3eaf3',
    route: ['#0f172a', '#2563eb', '#06b6d4'],
    head: '#0f172a',
    grid: '#b6c4d6',
    ground: '#dde5ef',
    accent: '#2563eb',
    text: '#0f172a',
    textDim: '#5b6b82',
    panel: 'rgba(255,255,255,0.62)',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    light: false,
    bgTop: '#2a0f22',
    bgBottom: '#0c0409',
    fog: '#280e20',
    route: ['#fecdd3', '#fb7185', '#a21caf'],
    head: '#fff1f2',
    grid: '#4d1c3c',
    ground: '#1c0916',
    accent: '#fb7185',
    text: '#fff1f2',
    textDim: '#c39aae',
    panel: 'rgba(28,9,22,0.55)',
  },
];

export const THEMES: Theme[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Kalın rakamlar, parlayan iz, dolu ekran istatistikleri.',
    hud: 'pulse',
    fonts: { display: DISPLAY, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.5,
      routeGlow: 1,
      gridStyle: 'lines',
      trailScale: 1,
      beam: true,
      particles: true,
    },
    defaultPalette: 'neon-night',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'İnce tipografi, az veri, rotaya odaklı sade bir kurgu.',
    hud: 'minimal',
    fonts: { display: SANS, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.28,
      routeGlow: 0.6,
      gridStyle: 'dots',
      trailScale: 0.75,
      beam: false,
      particles: false,
    },
    defaultPalette: 'mono',
  },
  {
    id: 'telemetry',
    name: 'Telemetri',
    description: 'Monospace veri paneli, köşe işaretleri, teknik görünüm.',
    hud: 'telemetry',
    fonts: { display: MONO, body: MONO, mono: MONO },
    scene: {
      curtainOpacity: 0.35,
      routeGlow: 0.8,
      gridStyle: 'lines',
      trailScale: 0.85,
      beam: false,
      particles: false,
    },
    defaultPalette: 'blueprint',
  },
  {
    id: 'poster',
    name: 'Poster',
    description: 'Dergi kapağı düzeni: büyük başlık, altta istatistik ızgarası.',
    hud: 'poster',
    fonts: { display: SERIF, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.45,
      routeGlow: 0.7,
      gridStyle: 'none',
      trailScale: 1.1,
      beam: false,
      particles: true,
    },
    defaultPalette: 'sunset',
  },
  {
    id: 'broadcast',
    name: 'Yayın',
    description: 'Spor yayını alt bantları ve canlı split bildirimleri.',
    hud: 'broadcast',
    fonts: { display: DISPLAY, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.4,
      routeGlow: 0.9,
      gridStyle: 'lines',
      trailScale: 1,
      beam: true,
      particles: false,
    },
    defaultPalette: 'strava',
  },
  {
    id: 'zen',
    name: 'Zen',
    description: 'Sadece mesafe ve süre. Geri kalan her şey manzara.',
    hud: 'zen',
    fonts: { display: SANS, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.55,
      routeGlow: 1.1,
      gridStyle: 'none',
      trailScale: 0.9,
      beam: true,
      particles: true,
    },
    defaultPalette: 'aurora',
  },
  {
    id: 'chrono',
    name: 'Kronometre',
    description: 'Kadranı süre tutuyor: dev kronometre, altında mesafe ve tempo.',
    hud: 'chrono',
    fonts: { display: MONO, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.42,
      routeGlow: 0.9,
      gridStyle: 'dots',
      trailScale: 0.95,
      beam: true,
      particles: false,
    },
    defaultPalette: 'mono',
  },
  {
    id: 'bib',
    name: 'Yarış Numarası',
    description: 'Göğüs numarası düzeni ve yanda ilerleyen kilometre listesi.',
    hud: 'bib',
    fonts: { display: DISPLAY, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.45,
      routeGlow: 0.85,
      gridStyle: 'lines',
      trailScale: 1,
      beam: false,
      particles: false,
    },
    defaultPalette: 'solar',
  },
  {
    id: 'card',
    name: 'Kart',
    description: 'Altta duran yuvarlak köşeli özet kartı, uygulama paylaşımı gibi.',
    hud: 'card',
    fonts: { display: SANS, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.5,
      routeGlow: 0.8,
      gridStyle: 'dots',
      trailScale: 1,
      beam: false,
      particles: true,
    },
    defaultPalette: 'sakura',
  },
  {
    id: 'retro',
    name: 'Retro',
    description: 'Tarama çizgileri, kalın gölgeli tipografi, seksenler afişi.',
    hud: 'retro',
    fonts: { display: DISPLAY, body: SANS, mono: MONO },
    scene: {
      curtainOpacity: 0.6,
      routeGlow: 1.2,
      gridStyle: 'lines',
      trailScale: 1.15,
      beam: true,
      particles: false,
    },
    defaultPalette: 'sunset',
  },
  {
    id: 'ticker',
    name: 'Bant',
    description: 'Üstte ince künye, altta tek satırlık kayan veri bandı.',
    hud: 'ticker',
    fonts: { display: MONO, body: MONO, mono: MONO },
    scene: {
      curtainOpacity: 0.38,
      routeGlow: 0.75,
      gridStyle: 'lines',
      trailScale: 0.8,
      beam: false,
      particles: false,
    },
    defaultPalette: 'forest',
  },
];

export const getTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const getPalette = (id: string): Palette =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Canvas needs the webfonts resolved before it can draw with them. */
export async function ensureFontsLoaded(): Promise<void> {
  if (!('fonts' in document)) return;
  const faces = [
    '700 64px "Bebas Neue"',
    '400 32px "Inter Variable"',
    '700 32px "Inter Variable"',
    '400 28px "JetBrains Mono Variable"',
    '700 28px "JetBrains Mono Variable"',
  ];
  await Promise.all(
    faces.map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  await document.fonts.ready;
}
