import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import type { Activity, SceneOptions } from '../types';
import type { Palette, Theme } from '../themes';
import {
  buildRoutePath,
  positionAt,
  progressToT,
  tangentAt,
  type RoutePath,
} from './projection';
import {
  beamFragment,
  beamVertex,
  curtainFragment,
  groundFragment,
  groundVertex,
  particleFragment,
  particleVertex,
  ribbonFragment,
  routeVertex,
} from './shaders';

const WORLD_SPAN = 200;
const UP = new THREE.Vector3(0, 1, 0);

export interface ScreenLabel {
  key: string;
  text: string;
  x: number;
  y: number;
  alpha: number;
  kind: 'km' | 'start' | 'finish';
}

function radialTexture(inner: string, outer: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function gradientTexture(top: string, bottom: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class RunScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 9 / 16, 0.5, 4000);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private width = 1080;
  private height = 1920;

  private activity: Activity | null = null;
  private path: RoutePath | null = null;
  private theme: Theme | null = null;
  private palette: Palette | null = null;
  private options: SceneOptions | null = null;

  private routeGroup = new THREE.Group();
  private decorGroup = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  private ribbonMat: THREE.ShaderMaterial | null = null;
  private curtainMat: THREE.ShaderMaterial | null = null;
  private ghostRibbonMat: THREE.ShaderMaterial | null = null;
  private ghostCurtainMat: THREE.ShaderMaterial | null = null;
  private groundMat: THREE.ShaderMaterial | null = null;
  private particleMat: THREE.ShaderMaterial | null = null;
  private beamMat: THREE.ShaderMaterial | null = null;

  private marker = new THREE.Group();
  private markerGlow: THREE.Sprite | null = null;
  private markerCore: THREE.Mesh | null = null;
  private markerRing: THREE.Mesh | null = null;
  private beam: THREE.Mesh | null = null;
  private ghostGroup = new THREE.Group();
  private particles: THREE.Points | null = null;
  private endpoints = new THREE.Group();

  // scratch vectors, reused every frame
  private vPos = new THREE.Vector3();
  private vTan = new THREE.Vector3();
  private vFlat = new THREE.Vector3();
  private vCam = new THREE.Vector3();
  private vLook = new THREE.Vector3();
  private vTmp = new THREE.Vector3();
  private vOverviewPos = new THREE.Vector3();
  private vOverviewLook = new THREE.Vector3();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.add(this.routeGroup, this.decorGroup, this.ghostGroup, this.marker, this.endpoints);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.85,
      0.6,
      0.35,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(this.width, this.height);
  }

  setSize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setActivity(activity: Activity | null) {
    this.activity = activity;
    this.rebuild();
  }

  setTheme(theme: Theme, palette: Palette) {
    this.theme = theme;
    this.palette = palette;
    this.rebuild();
  }

  setOptions(options: SceneOptions) {
    const needsRebuild =
      !this.options ||
      this.options.elevationScale !== options.elevationScale ||
      this.options.trailWidth !== options.trailWidth;
    this.options = options;
    if (needsRebuild) this.rebuild();
    else this.applyVisibility();
  }

  private applyVisibility() {
    if (!this.options || !this.theme) return;
    this.ghostGroup.visible = this.options.showGhostRoute;
    if (this.particles) {
      this.particles.visible = this.options.showParticles && this.theme.scene.particles;
    }
    if (this.beam) this.beam.visible = this.theme.scene.beam;
    const ground = this.decorGroup.getObjectByName('ground');
    if (ground) {
      ground.visible = this.options.showGrid && this.theme.scene.gridStyle !== 'none';
    }
    const curtain = this.routeGroup.getObjectByName('curtain');
    if (curtain) curtain.visible = this.options.showCurtain;
    this.endpoints.visible = this.options.showKmMarkers;
  }

  private clearBuilt() {
    for (const group of [this.routeGroup, this.decorGroup, this.ghostGroup, this.marker, this.endpoints]) {
      group.clear();
    }
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.particles = null;
    this.beam = null;
    this.markerGlow = null;
    this.markerCore = null;
    this.markerRing = null;
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private rebuild() {
    if (!this.activity || !this.theme || !this.palette || !this.options) return;
    this.clearBuilt();

    const palette = this.palette;
    const theme = this.theme;
    const options = this.options;

    this.path = buildRoutePath(this.activity, options.elevationScale);
    const path = this.path;

    // ---- background & atmosphere -------------------------------------------
    const bg = this.track(gradientTexture(palette.bgTop, palette.bgBottom));
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(new THREE.Color(palette.fog), WORLD_SPAN * 0.9, WORLD_SPAN * 3.4);

    const rampUniforms = () => ({
      uC0: { value: new THREE.Color(palette.route[0]) },
      uC1: { value: new THREE.Color(palette.route[1]) },
      uC2: { value: new THREE.Color(palette.route[2]) },
    });

    // ---- ribbon ------------------------------------------------------------
    const halfWidth = WORLD_SPAN * 0.008 * theme.scene.trailScale * options.trailWidth;
    const ribbonGeo = this.track(buildRibbonGeometry(path, halfWidth));
    const curtainGeo = this.track(buildCurtainGeometry(path));

    this.ribbonMat = this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          ...rampUniforms(),
          uProgress: { value: 0 },
          uGlow: { value: theme.scene.routeGlow * (palette.light ? 0.25 : 1) },
          uGhost: { value: 0 },
          uGhostColor: { value: new THREE.Color(palette.textDim) },
          uHead: { value: new THREE.Color(palette.head) },
        },
        vertexShader: routeVertex,
        fragmentShader: ribbonFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    this.curtainMat = this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          ...rampUniforms(),
          uProgress: { value: 0 },
          uOpacity: { value: theme.scene.curtainOpacity },
          uGlow: { value: theme.scene.routeGlow * (palette.light ? 0.2 : 1) },
          uGhost: { value: 0 },
          uGhostColor: { value: new THREE.Color(palette.textDim) },
        },
        vertexShader: routeVertex,
        fragmentShader: curtainFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    const ribbon = new THREE.Mesh(ribbonGeo, this.ribbonMat);
    ribbon.name = 'ribbon';
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 4;

    const curtain = new THREE.Mesh(curtainGeo, this.curtainMat);
    curtain.name = 'curtain';
    curtain.frustumCulled = false;
    curtain.renderOrder = 3;
    this.routeGroup.add(curtain, ribbon);

    // ---- ghost of the not-yet-run route ------------------------------------
    this.ghostRibbonMat = this.track(this.ribbonMat.clone());
    this.ghostRibbonMat.uniforms.uGhost.value = 1;
    this.ghostCurtainMat = this.track(this.curtainMat.clone());
    this.ghostCurtainMat.uniforms.uGhost.value = 1;

    // Only the line is previewed, never the curtain: stacked transparent
    // curtain surfaces pile up into an opaque wall when seen from the trail.
    const ghostRibbon = new THREE.Mesh(ribbonGeo, this.ghostRibbonMat);
    ghostRibbon.name = 'ghostRibbon';
    ghostRibbon.frustumCulled = false;
    ghostRibbon.renderOrder = 2;
    this.ghostGroup.add(ghostRibbon);

    // ---- ground ------------------------------------------------------------
    const groundGeo = this.track(new THREE.PlaneGeometry(WORLD_SPAN * 6, WORLD_SPAN * 6, 1, 1));
    this.groundMat = this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          uGridColor: { value: new THREE.Color(palette.grid) },
          uGroundColor: { value: new THREE.Color(palette.ground) },
          uSpacing: { value: WORLD_SPAN / 12 },
          uRadius: { value: WORLD_SPAN * 1.5 },
          uMode: { value: theme.scene.gridStyle === 'dots' ? 1 : 0 },
          uOpacity: { value: palette.light ? 0.75 : 1 },
        },
        vertexShader: groundVertex,
        fragmentShader: groundFragment,
        transparent: true,
        depthWrite: false,
      }),
    );
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.name = 'ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = path.baseY;
    ground.renderOrder = 0;
    this.decorGroup.add(ground);

    // ---- particles ---------------------------------------------------------
    const particleCount = 320;
    const pGeo = this.track(new THREE.BufferGeometry());
    const pPos = new Float32Array(particleCount * 3);
    const pSeed = new Float32Array(particleCount);
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const spread = WORLD_SPAN * 0.8;
    for (let i = 0; i < particleCount; i++) {
      pPos[i * 3] = (rand() - 0.5) * WORLD_SPAN * 2.2;
      pPos[i * 3 + 1] = rand() * spread;
      pPos[i * 3 + 2] = (rand() - 0.5) * WORLD_SPAN * 2.2;
      pSeed[i] = rand();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
    this.particleMat = this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 2.4 },
          uSpread: { value: spread },
          uColor: { value: new THREE.Color(palette.accent) },
        },
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: palette.light ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    this.particles = new THREE.Points(pGeo, this.particleMat);
    this.particles.position.y = path.baseY;
    this.particles.frustumCulled = false;
    this.decorGroup.add(this.particles);

    // ---- runner marker -----------------------------------------------------
    const glowTex = this.track(radialTexture(palette.head, palette.accent));
    const glowMat = this.track(
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: palette.light ? THREE.NormalBlending : THREE.AdditiveBlending,
        opacity: palette.light ? 0.4 : 0.5,
      }),
    );
    this.markerGlow = new THREE.Sprite(glowMat);
    this.markerGlow.scale.setScalar(WORLD_SPAN * 0.022);

    const coreGeo = this.track(new THREE.SphereGeometry(WORLD_SPAN * 0.006, 20, 16));
    const coreMat = this.track(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.head) }),
    );
    this.markerCore = new THREE.Mesh(coreGeo, coreMat);

    const ringGeo = this.track(
      new THREE.RingGeometry(WORLD_SPAN * 0.011, WORLD_SPAN * 0.014, 48),
    );
    const ringMat = this.track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(palette.accent),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = -Math.PI / 2;

    const beamGeo = this.track(
      new THREE.CylinderGeometry(
        WORLD_SPAN * 0.0015,
        WORLD_SPAN * 0.004,
        WORLD_SPAN * 0.05,
        16,
        1,
        true,
      ),
    );
    this.beamMat = this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(palette.accent) },
          uOpacity: { value: palette.light ? 0.18 : 0.4 },
        },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: palette.light ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.position.y = WORLD_SPAN * 0.025;

    this.marker.add(this.markerGlow, this.markerCore, this.markerRing, this.beam);
    this.marker.renderOrder = 6;

    // ---- start / finish rings ---------------------------------------------
    const endRingGeo = this.track(
      new THREE.RingGeometry(WORLD_SPAN * 0.02, WORLD_SPAN * 0.024, 48),
    );
    for (const [pos, color] of [
      [path.start, palette.route[0]],
      [path.finish, palette.route[2]],
    ] as const) {
      const mat = this.track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const ring = new THREE.Mesh(endRingGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, path.baseY + 0.15, pos.z);
      this.endpoints.add(ring);
    }

    // ---- bloom tuning ------------------------------------------------------
    this.bloom.strength = palette.light ? 0.15 : 0.3 + theme.scene.routeGlow * 0.2;
    this.bloom.radius = 0.2;
    this.bloom.threshold = palette.light ? 0.95 : 0.85;

    this.applyVisibility();
  }

  /** Camera placement for a wide shot that frames the whole route. */
  private overviewCamera(angle: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const path = this.path!;
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    // distance at which the route's bounding sphere just fits the narrower of
    // the two view angles, plus a little breathing room
    const dist = (path.radius / Math.sin(Math.min(vHalf, hHalf))) * 1.24;
    const pitch = THREE.MathUtils.degToRad(34);
    outLook.copy(path.center);
    outPos.set(
      path.center.x + Math.cos(angle) * dist * Math.cos(pitch),
      path.center.y + dist * Math.sin(pitch),
      path.center.z + Math.sin(angle) * dist * Math.cos(pitch),
    );
    // Aim below the route so it sits in the upper part of the frame, clear of
    // the stats block that occupies the bottom third of a vertical video.
    outLook.y -= dist * Math.tan(vHalf) * 0.16;
  }

  private updateCamera(progress: number, time: number) {
    const path = this.path!;
    const options = this.options!;
    const t = progressToT(path, progress);

    positionAt(path, t, this.vPos);
    tangentAt(path, t, this.vTan);
    this.vFlat.set(this.vTan.x, 0, this.vTan.z);
    if (this.vFlat.lengthSq() < 1e-6) this.vFlat.set(0, 0, 1);
    this.vFlat.normalize();

    this.camera.up.set(0, 1, 0);

    // Behind and well above the runner, aiming just past them: high enough
    // that the trail already drawn stays in frame under the camera, while the
    // route still to come runs away up the shot.
    const chaseDist = WORLD_SPAN * 0.3;
    const chaseHeight = WORLD_SPAN * 0.24;

    const setChase = (pos: THREE.Vector3, look: THREE.Vector3) => {
      const sway = Math.sin(time * 0.28) * WORLD_SPAN * 0.05;
      this.vTmp.copy(UP).cross(this.vFlat).normalize().multiplyScalar(sway);
      pos
        .copy(this.vPos)
        .addScaledVector(this.vFlat, -chaseDist)
        .add(this.vTmp);
      pos.y = this.vPos.y + chaseHeight + Math.sin(time * 0.21) * WORLD_SPAN * 0.015;
      look.copy(this.vPos).addScaledVector(this.vFlat, WORLD_SPAN * 0.075);
      look.y += WORLD_SPAN * 0.01;
    };

    switch (options.cameraMode) {
      case 'follow': {
        setChase(this.vCam, this.vLook);
        break;
      }
      case 'orbit': {
        this.overviewCamera(time * options.rotateSpeed * 0.25 - 2.2, this.vCam, this.vLook);
        break;
      }
      case 'topdown': {
        this.vCam.copy(this.vPos).addScaledVector(this.vFlat, -WORLD_SPAN * 0.02);
        this.vCam.y = this.vPos.y + WORLD_SPAN * 0.42;
        this.vLook.copy(this.vPos);
        // keep the direction of travel pointing up the frame
        this.camera.up.copy(this.vFlat);
        break;
      }
      case 'cinematic':
      default: {
        setChase(this.vCam, this.vLook);
        const intro = THREE.MathUtils.smoothstep(progress, 0.0, 0.09);
        const outro = THREE.MathUtils.smoothstep(progress, 0.9, 1.0);

        if (intro < 1) {
          this.overviewCamera(time * 0.12 - 2.4, this.vOverviewPos, this.vOverviewLook);
          this.vCam.lerp(this.vOverviewPos, 1 - intro);
          this.vLook.lerp(this.vOverviewLook, 1 - intro);
        }
        if (outro > 0) {
          this.overviewCamera(time * 0.12 + 0.6, this.vOverviewPos, this.vOverviewLook);
          this.vCam.lerp(this.vOverviewPos, outro);
          this.vLook.lerp(this.vOverviewLook, outro);
        }
        break;
      }
    }

    this.camera.position.copy(this.vCam);
    this.camera.lookAt(this.vLook);
    this.camera.updateMatrixWorld();
  }

  /**
   * Draw one frame. `progress` is 0..1 along the route and `time` is the
   * animation clock in seconds — both are supplied by the caller so preview
   * and export produce byte-identical frames.
   */
  render(progress: number, time: number) {
    if (!this.path || !this.options || !this.theme) return;
    const path = this.path;
    const t = progressToT(path, progress);

    if (this.ribbonMat) this.ribbonMat.uniforms.uProgress.value = progress;
    if (this.curtainMat) this.curtainMat.uniforms.uProgress.value = progress;
    if (this.ghostRibbonMat) this.ghostRibbonMat.uniforms.uProgress.value = progress;
    if (this.ghostCurtainMat) this.ghostCurtainMat.uniforms.uProgress.value = progress;
    if (this.particleMat) this.particleMat.uniforms.uTime.value = time;

    positionAt(path, t, this.vPos);
    this.marker.position.copy(this.vPos);
    if (this.markerRing) {
      const pulse = 1 + Math.sin(time * 3.4) * 0.18;
      this.markerRing.scale.setScalar(pulse);
      (this.markerRing.material as THREE.MeshBasicMaterial).opacity =
        0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * 3.4));
    }
    if (this.markerGlow) {
      this.markerGlow.scale.setScalar(WORLD_SPAN * (0.022 + Math.sin(time * 2.1) * 0.0025));
    }

    this.updateCamera(progress, time);
    this.composer.render();
  }

  /** Screen-space labels for km markers, start and finish. */
  labels(progress: number): ScreenLabel[] {
    if (!this.path || !this.options?.showKmMarkers) return [];
    const out: ScreenLabel[] = [];
    const forward = this.camera.getWorldDirection(new THREE.Vector3());

    const push = (key: string, text: string, world: THREE.Vector3, kind: ScreenLabel['kind'], alpha: number) => {
      this.vTmp.copy(world).sub(this.camera.position);
      if (this.vTmp.dot(forward) <= 0) return;
      const p = world.clone().project(this.camera);
      // keep labels clear of the frame edges so they never render half cut off
      if (p.x < -0.88 || p.x > 0.88 || p.y < -0.82 || p.y > 0.86) return;
      out.push({
        key,
        text,
        x: (p.x * 0.5 + 0.5) * this.width,
        y: (-p.y * 0.5 + 0.5) * this.height,
        alpha,
        kind,
      });
    };

    const total = this.activity?.totalDistance ?? 1;
    for (const m of this.path.kmMarkers) {
      const markerProgress = (m.km * 1000) / total;
      if (markerProgress > progress) continue;
      // fade a marker in as it is passed, then hold it at a calmer opacity
      const age = progress - markerProgress;
      const alpha = age < 0.02 ? age / 0.02 : Math.max(0.4, 1 - (age - 0.02) * 2.5);
      push(`km-${m.km}`, `${m.km}`, m.position, 'km', alpha);
    }

    push('start', 'BAŞLANGIÇ', this.path.start, 'start', progress > 0.06 ? 0.45 : 1);
    if (progress > 0.985) push('finish', 'BİTİŞ', this.path.finish, 'finish', 1);
    return out;
  }

  setBloomEnabled(enabled: boolean) {
    this.bloom.enabled = enabled;
  }

  dispose() {
    this.clearBuilt();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

/** Flat ribbon that follows the route, two vertices per point. */
function buildRibbonGeometry(path: RoutePath, halfWidth: number): THREE.BufferGeometry {
  const n = path.count;
  const positions = new Float32Array(n * 2 * 3);
  const aT = new Float32Array(n * 2);
  const aU = new Float32Array(n * 2);
  const right = new THREE.Vector3();
  const tan = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    tan.set(path.tangents[i * 3], 0, path.tangents[i * 3 + 2]);
    if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
    right.copy(tan).normalize().cross(UP).normalize().multiplyScalar(halfWidth);

    const px = path.positions[i * 3];
    const py = path.positions[i * 3 + 1];
    const pz = path.positions[i * 3 + 2];

    positions[i * 6] = px - right.x;
    positions[i * 6 + 1] = py - right.y;
    positions[i * 6 + 2] = pz - right.z;
    positions[i * 6 + 3] = px + right.x;
    positions[i * 6 + 4] = py + right.y;
    positions[i * 6 + 5] = pz + right.z;

    aT[i * 2] = path.ts[i];
    aT[i * 2 + 1] = path.ts[i];
    aU[i * 2] = -1;
    aU[i * 2 + 1] = 1;
  }

  return stripGeometry(positions, aT, aU, n);
}

/** Vertical curtain hanging from the route down to the ground plane. */
function buildCurtainGeometry(path: RoutePath): THREE.BufferGeometry {
  const n = path.count;
  const positions = new Float32Array(n * 2 * 3);
  const aT = new Float32Array(n * 2);
  const aU = new Float32Array(n * 2);

  for (let i = 0; i < n; i++) {
    const px = path.positions[i * 3];
    const py = path.positions[i * 3 + 1];
    const pz = path.positions[i * 3 + 2];

    // bottom vertex sits on the ground, top vertex on the route
    positions[i * 6] = px;
    positions[i * 6 + 1] = path.baseY;
    positions[i * 6 + 2] = pz;
    positions[i * 6 + 3] = px;
    positions[i * 6 + 4] = py;
    positions[i * 6 + 5] = pz;

    aT[i * 2] = path.ts[i];
    aT[i * 2 + 1] = path.ts[i];
    aU[i * 2] = 0;
    aU[i * 2 + 1] = 1;
  }

  return stripGeometry(positions, aT, aU, n);
}

function stripGeometry(
  positions: Float32Array,
  aT: Float32Array,
  aU: Float32Array,
  n: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));

  const indices = new Uint32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    indices[i * 6] = a;
    indices[i * 6 + 1] = a + 1;
    indices[i * 6 + 2] = a + 2;
    indices[i * 6 + 3] = a + 1;
    indices[i * 6 + 4] = a + 3;
    indices[i * 6 + 5] = a + 2;
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}
