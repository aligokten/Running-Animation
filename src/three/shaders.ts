/**
 * All route materials share one colour ramp so the trail, the curtain beneath
 * it and the km markers stay in sync.
 */
const RAMP = /* glsl */ `
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;

  vec3 routeColor(float t) {
    t = clamp(t, 0.0, 1.0);
    return t < 0.5 ? mix(uC0, uC1, t * 2.0) : mix(uC1, uC2, (t - 0.5) * 2.0);
  }
`;

export const routeVertex = /* glsl */ `
  attribute float aT;
  attribute float aU;
  varying float vT;
  varying float vU;

  void main() {
    vT = aT;
    vU = aU;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The vertical "curtain" that drops from the route down to the ground plane. */
export const curtainFragment = /* glsl */ `
  precision highp float;
  ${RAMP}
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uGhost;
  uniform vec3 uGhostColor;
  varying float vT;
  varying float vU;

  void main() {
    float lead = uProgress - vT;
    // vU runs 0 at the ground, 1 at the route line
    float band = pow(clamp(vU, 0.0, 1.0), 1.45);

    if (uGhost > 0.5) {
      if (lead >= 0.0) discard;
      // barely there: enough to hint at the shape ahead without hiding it
      gl_FragColor = vec4(uGhostColor, band * uOpacity * 0.09);
      return;
    }

    if (lead < 0.0) discard;
    vec3 col = routeColor(vT);
    float head = exp(-lead * 42.0);
    col += col * head * 0.7 * uGlow;
    float alpha = band * uOpacity + head * band * 0.25;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

/** The trail itself: a flat ribbon that hugs the elevation profile. */
export const ribbonFragment = /* glsl */ `
  precision highp float;
  ${RAMP}
  uniform float uProgress;
  uniform float uGlow;
  uniform float uGhost;
  uniform vec3 uGhostColor;
  uniform vec3 uHead;
  varying float vT;
  varying float vU;

  void main() {
    float lead = uProgress - vT;
    float edge = 1.0 - abs(vU);
    float core = smoothstep(0.0, 0.22, edge);

    if (uGhost > 0.5) {
      if (lead >= 0.0) discard;
      // the preview of the route ahead is drawn as a thinner line down the
      // middle of the ribbon, so it never competes with the trail already run
      gl_FragColor = vec4(uGhostColor, smoothstep(0.5, 0.82, edge) * 0.3);
      return;
    }

    if (lead < 0.0) discard;
    vec3 col = routeColor(vT);
    float head = exp(-lead * 26.0);
    col = mix(col, uHead, head * 0.35);
    col += col * head * 0.45 * uGlow;
    // a soft halo bleeding past the ribbon edge
    float alpha = core + (1.0 - core) * 0.22 * (0.4 + uGlow);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export const groundVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const groundFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uGridColor;
  uniform vec3 uGroundColor;
  uniform float uSpacing;
  uniform float uRadius;
  uniform float uMode;   // 0 = lines, 1 = dots
  uniform float uOpacity;
  varying vec3 vWorld;

  float gridLines(vec2 p, float spacing) {
    vec2 c = abs(fract(p / spacing - 0.5) - 0.5) / fwidth(p / spacing);
    return 1.0 - min(min(c.x, c.y), 1.0);
  }

  float gridDots(vec2 p, float spacing) {
    vec2 f = fract(p / spacing) - 0.5;
    float d = length(f) * spacing;
    float w = fwidth(d) + 0.0001;
    return 1.0 - smoothstep(spacing * 0.045, spacing * 0.045 + w * 1.5, d);
  }

  void main() {
    float fade = 1.0 - smoothstep(uRadius * 0.35, uRadius, length(vWorld.xz));
    float fine = uMode < 0.5
      ? gridLines(vWorld.xz, uSpacing)
      : gridDots(vWorld.xz, uSpacing);
    float coarse = uMode < 0.5 ? gridLines(vWorld.xz, uSpacing * 5.0) : 0.0;

    vec3 col = mix(uGroundColor, uGridColor, clamp(fine * 0.4 + coarse * 0.7, 0.0, 1.0));
    float alpha = (0.3 + fine * 0.25 + coarse * 0.45) * fade * uOpacity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export const terrainVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Two looks over the same surface: a contour map drawn from the height field,
 * or a shaded relief. Both tint by altitude so the shape reads even flat on.
 */
export const terrainFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uLine;
  uniform float uInterval;
  uniform float uMinY;
  uniform float uMaxY;
  uniform float uRadius;
  uniform float uOpacity;
  uniform float uMode;      // 0 = contours, 1 = relief
  varying vec3 vWorld;
  varying vec3 vNormal;

  float band(float h, float interval) {
    float f = fract(h / interval);
    float d = min(f, 1.0 - f) * interval;
    float w = fwidth(h) * 1.1 + 1e-4;
    return 1.0 - smoothstep(0.0, w, d);
  }

  void main() {
    float t = clamp((vWorld.y - uMinY) / max(0.001, uMaxY - uMinY), 0.0, 1.0);
    vec3 col = mix(uLow, uHigh, t);

    // a wide radial fade so the square edge of the tile never shows
    float fade = 1.0 - smoothstep(uRadius * 0.26, uRadius * 0.48, length(vWorld.xz));
    float alpha = uOpacity * fade;

    if (uMode < 0.5) {
      // every fifth line is drawn heavier, the way an index contour is
      float minor = band(vWorld.y, uInterval);
      float major = band(vWorld.y, uInterval * 5.0);
      float line = clamp(minor * 0.5 + major, 0.0, 1.0);
      col = mix(col * 0.55, uLine, line);
      alpha *= 0.28 + line * 0.72;
    } else {
      vec3 light = normalize(vec3(-0.45, 0.82, 0.36));
      float lambert = 0.45 + 0.55 * max(0.0, dot(normalize(vNormal), light));
      col *= lambert;
      // a faint contour keeps the topographic reading in relief mode too
      alpha *= 0.85;
      col = mix(col, uLine, band(vWorld.y, uInterval * 5.0) * 0.35);
    }

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export const particleVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSize;
  uniform float uSpread;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.6 + aSeed * 1.4), uSpread) ;
    p.x += sin(uTime * 0.35 + aSeed * 12.0) * 2.2;
    p.z += cos(uTime * 0.28 + aSeed * 9.0) * 2.2;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // clamped so particles drifting near the camera stay specks, not blobs
    gl_PointSize = clamp(uSize * (300.0 / max(1.0, -mv.z)), 1.0, 9.0);
    vAlpha = 0.25 + 0.5 * aSeed;
  }
`;

export const particleFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = (1.0 - smoothstep(0.15, 0.5, d)) * vAlpha;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Vertical shaft of light marking the runner's position. */
export const beamVertex = /* glsl */ `
  varying float vY;
  void main() {
    vY = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const beamFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vY;

  void main() {
    float a = pow(1.0 - vY, 2.0) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;
