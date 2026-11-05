// Corridor and chandelier flame, ported from wings.js TORCH_FIRE / GLOW / WALL / embers.
// PlayCanvas has no Three.js instancing here, so each layer is a world-space quad
// with the same shader, the same sizes, and the same uTime uniform.
import * as pc from '../vendor/playcanvas.mjs';

const { Entity, ShaderMaterial, Mesh, MeshInstance, SEMANTIC_POSITION, SEMANTIC_TEXCOORD0, SEMANTIC_TEXCOORD1, SEMANTIC_TEXCOORD2, BLEND_ADDITIVEALPHA, CULLFACE_NONE, PRIMITIVE_POINTS, PRIMITIVE_TRIANGLES } = pc;

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

const FIRE_VS = `
attribute vec3 vertex_position;
attribute vec2 vertex_texCoord0;
attribute vec2 vertex_texCoord1;
attribute vec2 vertex_texCoord2;
uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_viewProjection;
uniform vec3 view_position;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
void main(void) {
  float kind = vertex_texCoord2.y;
  vec3 centerL = vertex_position;
  vec3 worldPos;
  if (kind < 0.5) {
    vec3 upCenter = (matrix_model * vec4(centerL + vec3(0.0, vertex_texCoord1.y, 0.0), 1.0)).xyz;
    vec3 toCam = view_position - upCenter;
    toCam.y = 0.0;
    float dlen = length(toCam);
    vec3 side = dlen > 0.0001 ? vec3(toCam.z, 0.0, -toCam.x) / dlen : vec3(1.0, 0.0, 0.0);
    worldPos = upCenter + side * vertex_texCoord1.x;
  } else if (kind < 1.5) {
    vec3 centerW = (matrix_model * vec4(centerL, 1.0)).xyz;
    vec3 camRight = vec3(matrix_view[0][0], matrix_view[1][0], matrix_view[2][0]);
    vec3 camUp = vec3(matrix_view[0][1], matrix_view[1][1], matrix_view[2][1]);
    worldPos = centerW + camRight * vertex_texCoord1.x + camUp * vertex_texCoord1.y;
  } else {
    worldPos = (matrix_model * vec4(vertex_position, 1.0)).xyz;
  }
  gl_Position = matrix_viewProjection * vec4(worldPos, 1.0);
  vUv = vertex_texCoord0;
  vSeed = vertex_texCoord2.x;
  vKind = kind;
}
`;

const FIRE_FS = `
precision highp float;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
${NOISE}
float flick(float t, float s){ return 0.78 + 0.12 * sin(t * 7.1 + s * 11.0) + 0.07 * sin(t * 13.7 + s * 3.0) + 0.05 * sin(t * 23.3 + s * 5.0); }
void main(void) {
  float kind = vKind;
  if (kind < 0.5) {
    vec2 uv = vUv;
    float seed = fract(vSeed);
    float layer = floor(vSeed + 0.001);
    float t = uTime * (1.0 + fract(seed * 7.13) * 0.25) + seed * 13.0;
    vec2 q = vec2(fbm(uv * vec2(2.6, 1.8) + vec2(seed, -t * 1.5)), fbm(uv * vec2(2.6, 1.8) + vec2(seed + 5.2, -t * 1.8)));
    float n = fbm(vec2(uv.x * 3.4, uv.y * 2.4 - t * 2.7) + q * 1.6);
    float sway = ((q.x - 0.5) * 0.55 + sin(t * 1.9) * 0.08 + sin(t * 4.3 + seed) * 0.04) * uv.y * uv.y;
    float x = (uv.x - 0.5) * 2.0 - sway;
    float w = mix(1.0, 0.10, pow(uv.y, 0.9)) * mix(0.85, 1.2, n);
    float body = 1.0 - smoothstep(0.0, 1.0, abs(x) / max(w, 1e-3));
    body *= smoothstep(0.0, 0.10, uv.y);
    float v = body * 1.5 - uv.y * 0.45 - (1.0 - n) * 0.6 * uv.y;
    v += (n - 0.5) * 0.35;
    v = clamp(v, 0.0, 1.0);
    float core = layer < 0.5 ? 1.0 : (layer < 1.5 ? 0.6 : 0.25);
    float T = clamp(v * (0.7 + core * 0.6) * (1.0 - uv.y * 0.35), 0.0, 1.0);
    vec3 c = vec3(0.45, 0.04, 0.0);
    c = mix(c, vec3(0.95, 0.30, 0.03), smoothstep(0.08, 0.38, T));
    c = mix(c, vec3(1.0, 0.62, 0.16), smoothstep(0.32, 0.62, T));
    c = mix(c, vec3(1.0, 0.88, 0.55), smoothstep(0.58, 0.85, T));
    c = mix(c, vec3(1.0, 0.97, 0.88), smoothstep(0.82, 1.0, T));
    float base = smoothstep(0.22, 0.0, uv.y) * body;
    c = mix(c, vec3(0.35, 0.55, 1.0), base * 0.35 * core);
    float a = smoothstep(0.03, 0.4, v) * (layer > 1.5 ? 0.55 : 0.9);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c * a * 1.25, a);
  } else if (kind < 1.5) {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.4) * flick(uTime, fract(vSeed));
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(1.0, 0.52, 0.16) * a * 0.55, a);
  } else {
    vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(2.0, 1.6);
    float a = pow(max(0.0, 1.0 - length(p)), 2.0) * flick(uTime * 0.9, fract(vSeed) + 1.3);
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(1.0, 0.45, 0.12) * a * 0.42, a);
  }
}
`;

const EMBER_VS = `
attribute vec3 vertex_position;
attribute vec2 vertex_texCoord0;
uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_viewProjection;
uniform float uTime;
varying float vLife;
void main(void) {
  float aSeed = vertex_texCoord0.x;
  float life = fract(uTime * (0.35 + fract(aSeed * 3.7) * 0.3) + aSeed);
  vLife = life;
  vec3 p = vertex_position;
  p.x += sin(aSeed * 31.0 + uTime * 1.7) * 0.09 * life;
  p.z += cos(aSeed * 17.0 + uTime * 1.3) * 0.09 * life;
  p.y += life * (0.75 + fract(aSeed * 5.3) * 0.5);
  vec4 mv = matrix_view * matrix_model * vec4(p, 1.0);
  gl_PointSize = (1.0 - life) * 34.0 / max(0.5, -mv.z);
  gl_Position = matrix_viewProjection * vec4((matrix_model * vec4(p, 1.0)).xyz, 1.0);
}
`;

const EMBER_FS = `
precision mediump float;
varying float vLife;
void main(void) {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife);
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 0.25, 0.03), vLife) * a, a);
}
`;

function material(name, vs, fs, withLayer) {
  const attributes = {
    vertex_position: SEMANTIC_POSITION,
    vertex_texCoord0: SEMANTIC_TEXCOORD0
  };
  if (withLayer) {
    attributes.vertex_texCoord1 = SEMANTIC_TEXCOORD1;
    attributes.vertex_texCoord2 = SEMANTIC_TEXCOORD2;
  }
  const mat = new ShaderMaterial({
    uniqueName: name,
    attributes,
    vertexGLSL: vs,
    fragmentGLSL: fs
  });
  mat.blendType = BLEND_ADDITIVEALPHA;
  mat.depthWrite = false;
  mat.cull = CULLFACE_NONE;
  mat._sinOwned = true;
  mat.setParameter('uTime', 1.15);
  mat.update();
  return mat;
}

function pushQuad(pos, uv, off, seed, idx, cx, cy, cz, ax, ay, bx, by, s, kind) {
  const base = pos.length / 3;
  const corners = [[ax, ay, 0, 0], [bx, ay, 1, 0], [bx, by, 1, 1], [ax, by, 0, 1]];
  for (const c of corners) {
    pos.push(cx, cy, cz);
    uv.push(c[2], c[3]);
    off.push(c[0], c[1]);
    seed.push(s, kind);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushWorldQuad(pos, uv, off, seed, idx, corners, s) {
  const base = pos.length / 3;
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < 4; i += 1) {
    pos.push(corners[i][0], corners[i][1], corners[i][2]);
    uv.push(uvs[i][0], uvs[i][1]);
    off.push(0, 0);
    seed.push(s, 2);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function remember(mesh, mat) {
  window.__fireMeshes = (window.__fireMeshes || []).concat([mesh]);
  window.__fireMats = (window.__fireMats || []).concat([mat]);
}

// items: { x, y, z, seed, layers:[{w,h,layer}], glow, wall:{dx,dz,y} | null, embers }
export function buildTorchFlames(parent, items, name) {
  if (!items.length) return;
  const app = pc.Application.getApplication();
  if (!app) return;
  const pos = [];
  const uv = [];
  const off = [];
  const seed = [];
  const idx = [];
  const epos = [];
  const eseed = [];
  items.forEach((item, i) => {
    for (const layer of item.layers) {
      pushQuad(pos, uv, off, seed, idx, item.x, item.y, item.z, -layer.w * 0.5, 0, layer.w * 0.5, layer.h, layer.layer + (item.seed % 1), 0);
    }
    const g = item.glow;
    pushQuad(pos, uv, off, seed, idx, item.x, item.y + g.dy, item.z, -g.r, -g.r, g.r, g.r, item.seed + 10, 1);
    if (item.wall) {
      const w = item.wall;
      const rx = -w.dz;
      const rz = w.dx;
      const hw = 1.2;
      const y0 = w.y - 1.4;
      const y1 = w.y + 1.4;
      const ox = item.x + w.dx * 0.006;
      const oz = item.z + w.dz * 0.006;
      pushWorldQuad(pos, uv, off, seed, idx, [
        [ox - rx * hw, y0, oz - rz * hw],
        [ox + rx * hw, y0, oz + rz * hw],
        [ox + rx * hw, y1, oz + rz * hw],
        [ox - rx * hw, y1, oz - rz * hw]
      ], item.seed + 20);
    }
    for (let k = 0; k < item.embers; k += 1) {
      epos.push(item.x, item.y + (item.emberLift || 0.12), item.z);
      eseed.push((item.seed * 0.37 + k * 0.1037 + i * 0.01) % 1, 0);
    }
  });
  const mesh = new Mesh(app.graphicsDevice);
  mesh.setPositions(pos);
  mesh.setUvs(0, uv);
  mesh.setUvs(1, off);
  mesh.setUvs(2, seed);
  mesh.setIndices(idx);
  mesh.update(PRIMITIVE_TRIANGLES);
  const mat = material('sin-torch-fire-' + name, FIRE_VS, FIRE_FS, true);
  const ent = new Entity(name + '-torch-fire');
  const mi = new MeshInstance(mesh, mat, ent);
  mi.cull = false;
  mi.drawOrder = 3;
  ent.addComponent('render', { meshInstances: [mi] });
  parent.addChild(ent);

  const emesh = new Mesh(app.graphicsDevice);
  emesh.setPositions(epos);
  emesh.setUvs(0, eseed);
  emesh.update(PRIMITIVE_POINTS);
  const emat = material('sin-torch-embers-' + name, EMBER_VS, EMBER_FS, false);
  const eent = new Entity(name + '-torch-embers');
  const emi = new MeshInstance(emesh, emat, eent);
  emi.cull = false;
  emi.drawOrder = 4;
  eent.addComponent('render', { meshInstances: [emi] });
  parent.addChild(eent);
  remember(mesh, mat);
  remember(emesh, emat);
}

const CORRIDOR_LAYERS = [
  { w: 0.20, h: 0.34, layer: 0 },
  { w: 0.30, h: 0.48, layer: 1 },
  { w: 0.40, h: 0.60, layer: 2 }
];

export function corridorFlameItems(slots) {
  return slots.map((s) => ({
    x: s.fx, y: s.fy, z: s.fz, seed: s.seed,
    layers: CORRIDOR_LAYERS,
    glow: { r: 0.55, dy: 0.16 },
    wall: { dx: s.dx, dz: s.dz, y: s.fy + 0.1 },
    embers: 10
  }));
}

const CH_SCALES = [0.72, 1.05, 1.38];

export function chandelierFlameItems(cups) {
  return cups.map((c) => ({
    x: c.x, y: c.y, z: c.z, seed: c.seed,
    layers: CH_SCALES.map((sc, li) => ({
      w: 0.48 * c.s * sc,
      h: 0.92 * c.s * (0.85 + li * 0.12),
      layer: li
    })),
    glow: { r: 0.425 * c.s, dy: 0.16 * c.s },
    wall: null,
    embers: 8,
    emberLift: 0.05
  }));
}
