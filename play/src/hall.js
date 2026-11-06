import * as pc from '../vendor/playcanvas.mjs';
import { sinUrl, DOOR_URL } from './paths.js';
import { boundsOf } from './fit.js';

const { Entity, StandardMaterial, Color, Vec2, ShaderMaterial, Mesh, MeshInstance, SEMANTIC_POSITION, SEMANTIC_TEXCOORD0, SEMANTIC_TEXCOORD1, SEMANTIC_TEXCOORD2, BLEND_ADDITIVEALPHA, CULLFACE_NONE, PRIMITIVE_POINTS, PRIMITIVE_TRIANGLES } = pc;
const OPT = 'ارضيات وسقوف/optimized/';

const GAPS = [
  'خريطة ORM للأرضية غير مقسومة على قنوات PlayCanvas.',
  'النسخ المضغوطة بـ meshopt لم تُفك؛ استُعملت ملفات assets غير المضغوطة للجدران والأعمدة والأسود والمباخر والدرج والعرش.',
  'لمعان الأغراض خُفّض لأن القاعة بلا خريطة بيئة، حتى لا تختفي القطع المعدنية.'
];

function retain(registry, urls, url, type) {
  if (urls.includes(url)) {
    return registry.retain(url, type).then((asset) => {
      registry.release(url);
      return asset;
    });
  }
  urls.push(url);
  return registry.retain(url, type);
}

async function model(registry, urls, rel) {
  const asset = await retain(registry, urls, sinUrl(rel), 'container');
  return asset.resource.instantiateRenderEntity({ castShadows: false });
}

async function texture(registry, urls, rel) {
  const asset = await retain(registry, urls, sinUrl(rel), 'texture');
  const tex = asset.resource;
  tex.addressU = pc.ADDRESS_REPEAT;
  tex.addressV = pc.ADDRESS_REPEAT;
  return tex;
}

function std(tex, rough, metal) {
  const m = new StandardMaterial();
  if (tex) m.diffuseMap = tex;
  m.roughness = rough;
  m.metalness = metal;
  m.useMetalness = true;
  m.cull = pc.CULLFACE_NONE;
  m._sinOwned = true;
  m.update();
  return m;
}

function plane(parent, name, material, w, d, x, y, z, pitch) {
  const e = new Entity(name);
  e.addComponent('render', { type: 'plane', material });
  e.setLocalScale(w, 1, d);
  if (pitch) e.setEulerAngles(pitch, 0, 0);
  e.setLocalPosition(x, y, z);
  parent.addChild(e);
  return e;
}

function box(parent, name, material, sx, sy, sz, x, y, z) {
  const e = new Entity(name);
  e.addComponent('render', { type: 'box', material });
  e.setLocalScale(sx, sy, sz);
  e.setLocalPosition(x, y, z);
  parent.addChild(e);
  return e;
}

function orientBottom(entity, radians) {
  const spin = new Entity('orient');
  if (radians) spin.setEulerAngles(0, radians * 180 / Math.PI, 0);
  spin.addChild(entity);
  const host = new Entity('proto');
  host.addChild(spin);
  const b = boundsOf(host);
  spin.setLocalPosition(-b.cx, -b.minY, -b.cz);
  return { host, size: boundsOf(host) };
}

function place(host, parent, name, x, y, z, sx, sy, sz, face) {
  const g = new Entity(name);
  const scaled = new Entity('scaled');
  scaled.addChild(host.clone());
  scaled.setLocalScale(sx, sy, sz);
  if (face) g.setEulerAngles(0, face * 180 / Math.PI, 0);
  g.setLocalPosition(x, y, z);
  g.addChild(scaled);
  parent.addChild(g);
  return g;
}

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
  } else {
    vec3 centerW = (matrix_model * vec4(centerL, 1.0)).xyz;
    vec3 camRight = vec3(matrix_view[0][0], matrix_view[1][0], matrix_view[2][0]);
    vec3 camUp = vec3(matrix_view[0][1], matrix_view[1][1], matrix_view[2][1]);
    worldPos = centerW + camRight * vertex_texCoord1.x + camUp * vertex_texCoord1.y;
  }
  gl_Position = matrix_viewProjection * vec4(worldPos, 1.0);
  vUv = vertex_texCoord0;
  vSeed = vertex_texCoord2.x;
  vKind = kind;
}
`;

const FIRE_FS = `
precision highp float;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; v += a * noise(p); p *= 2.03; a *= 0.5; v += a * noise(p); p *= 2.03; a *= 0.5; v += a * noise(p); p *= 2.03; a *= 0.5; v += a * noise(p); return v; }
void main(void) {
  if (vKind < 0.5) {
    vec2 uv = vUv;
    float t = uTime * (0.65 + fract(vSeed) * 0.45);
    float n = fbm(vec2(uv.x * 3.0 + vSeed, uv.y * 2.2 - t));
    float n2 = fbm(vec2(uv.x * 6.0 - t * 0.4, uv.y * 4.0 - t * 1.35));
    float flick = n * 0.65 + n2 * 0.35;
    float width = mix(0.46, 0.07, uv.y);
    width *= mix(0.72, 1.18, flick);
    float dx = abs(uv.x - 0.5);
    float mask = smoothstep(width, width * 0.42, dx);
    float top = smoothstep(1.0, 0.7, uv.y);
    float body = mask * top * smoothstep(0.0, 0.07, uv.y);
    body *= smoothstep(0.12, 0.55, flick + uv.y * 0.22);
    vec3 col = mix(vec3(0.32, 0.02, 0.0), vec3(1.0, 0.28, 0.02), smoothstep(0.0, 0.5, uv.y));
    col = mix(col, vec3(1.0, 0.7, 0.18), smoothstep(0.4, 0.82, 1.0 - uv.y));
    col = mix(col, vec3(1.0, 0.95, 0.8), smoothstep(0.55, 0.95, flick) * (1.0 - uv.y));
    float alpha = body * (0.5 + 0.5 * flick);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
  } else {
    float d = length(vUv - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    if (a < 0.02) discard;
    gl_FragColor = vec4(1.0, 0.55, 0.18, a * 0.45);
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
varying float vSeed;
void main(void) {
  float aSeed = vertex_texCoord0.x;
  float life = fract(uTime * (0.28 + aSeed * 0.35) + aSeed);
  vec3 p = vertex_position;
  float ang = aSeed * 6.28318;
  p.x += cos(ang + life * 3.0) * life * 0.16;
  p.z += sin(ang + life * 2.2) * life * 0.16;
  p.y += life * (0.45 + fract(aSeed * 7.1) * 0.65);
  vec4 mv = matrix_view * matrix_model * vec4(p, 1.0);
  gl_PointSize = max(1.0, (1.0 - life) * 12.0 * (7.0 / max(0.25, -mv.z)));
  gl_Position = matrix_viewProjection * vec4((matrix_model * vec4(p, 1.0)).xyz, 1.0);
  vSeed = aSeed;
}
`;

const EMBER_FS = `
precision highp float;
void main(void) {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(1.0, 0.46, 0.12, a);
}
`;

function fireMaterial(name, vs, fs, attributes) {
  const mat = new ShaderMaterial({ uniqueName: name, attributes, vertexGLSL: vs, fragmentGLSL: fs });
  mat.blendType = BLEND_ADDITIVEALPHA;
  mat.depthWrite = false;
  mat.cull = CULLFACE_NONE;
  mat._sinOwned = true;
  mat.setParameter('uTime', 1.15);
  mat.update();
  return mat;
}

export function buildHallFire(root, fires, H) {
  if (!fires.length) return;
  const app = pc.Application.getApplication();
  if (!app) return;
  const device = app.graphicsDevice;
  const layers = [
    { w: 0.16 * H, h: 0.32 * H, seed: 0 },
    { w: 0.26 * H, h: 0.48 * H, seed: 2.3 },
    { w: 0.36 * H, h: 0.62 * H, seed: 5.1 }
  ];
  const pos = [];
  const uv = [];
  const off = [];
  const seed = [];
  const idx = [];
  function quad(cx, cy, cz, ax, ay, bx, by, s, kind) {
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
  for (const layer of layers) {
    for (const f of fires) {
      quad(f.x, f.y, f.z, -layer.w * 0.5, 0, layer.w * 0.5, layer.h, f.seed + layer.seed, 0);
    }
  }
  const glow = 0.55 * H * 0.5;
  for (const f of fires) {
    quad(f.x, f.y + 0.08 * H, f.z, -glow, -glow, glow, glow, f.seed, 1);
  }
  const mesh = new Mesh(device);
  mesh.setPositions(pos);
  mesh.setUvs(0, uv);
  mesh.setUvs(1, off);
  mesh.setUvs(2, seed);
  mesh.setIndices(idx);
  mesh.update(PRIMITIVE_TRIANGLES);
  const mat = fireMaterial('sin-hall-fire', FIRE_VS, FIRE_FS, {
    vertex_position: SEMANTIC_POSITION,
    vertex_texCoord0: SEMANTIC_TEXCOORD0,
    vertex_texCoord1: SEMANTIC_TEXCOORD1,
    vertex_texCoord2: SEMANTIC_TEXCOORD2
  });
  const ent = new Entity('fire');
  const mi = new MeshInstance(mesh, mat, ent);
  mi.cull = false;
  mi.drawOrder = 2;
  ent.addComponent('render', { meshInstances: [mi] });
  root.addChild(ent);

  const epos = [];
  const eseed = [];
  fires.forEach((f, fi) => {
    for (let k = 0; k < 8; k += 1) {
      epos.push(f.x, f.y, f.z);
      eseed.push((fi * 0.17 + k * 0.13) % 1, 0);
    }
  });
  const emesh = new Mesh(device);
  emesh.setPositions(epos);
  emesh.setUvs(0, eseed);
  emesh.update(PRIMITIVE_POINTS);
  const emat = fireMaterial('sin-hall-embers', EMBER_VS, EMBER_FS, {
    vertex_position: SEMANTIC_POSITION,
    vertex_texCoord0: SEMANTIC_TEXCOORD0
  });
  const eent = new Entity('embers');
  const emi = new MeshInstance(emesh, emat, eent);
  emi.cull = false;
  emi.drawOrder = 3;
  eent.addComponent('render', { meshInstances: [emi] });
  root.addChild(eent);
  window.__fireMeshes = (window.__fireMeshes || []).concat([mesh, emesh]);
  window.__fireMats = (window.__fireMats || []).concat([mat, emat]);
}

async function placeHallProps(registry, urls, root, hall) {
  const asset = await retain(registry, urls, '/sin-babylon-view/play/embedded/props-parts.glb', 'container');
  const proto = asset.resource.instantiateRenderEntity({ castShadows: false });
  for (const render of proto.findComponents('render') || []) {
    for (const mi of render.meshInstances || []) {
      const material = mi.material;
      if (!material || material.metalness == null) continue;
      material.metalness = Math.min(material.metalness, 0.35);
      material.roughness = Math.max(material.roughness || 0, 0.45);
      material.update();
    }
  }
  const part = (name) => proto.findByName(name);
  const { H, L, CH, topY, stairFootZ } = hall;
  function localSize(ent) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let n = 0;
    for (const render of ent.findComponents('render') || []) {
      for (const mi of render.meshInstances || []) {
        const mesh = mi.mesh;
        const count = mesh && mesh.vertexBuffer ? mesh.vertexBuffer.numVertices : 0;
        if (!count || !mesh.getPositions) continue;
        const arr = new Float32Array(count * 3);
        mesh.getPositions(arr);
        for (let i = 0; i < count; i += 1) {
          const x = arr[i * 3];
          const y = arr[i * 3 + 1];
          const z = arr[i * 3 + 2];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
          n += 1;
        }
      }
    }
    if (!n) throw new Error('جزء الأغراض بلا رؤوس');
    return { sx: maxX - minX, sy: maxY - minY, sz: maxZ - minZ, minY };
  }
  function fitted(ent, height) {
    const b = localSize(ent);
    const s = height / Math.max(1e-4, b.sy);
    const longIsX = b.sx >= b.sz;
    return { along: (longIsX ? b.sx : b.sz) * s, across: (longIsX ? b.sz : b.sx) * s, rot: longIsX ? Math.PI / 2 : 0, sy: b.sy };
  }
  function seatOf(ent, height) {
    const b = localSize(ent);
    const ys = [];
    for (const render of ent.findComponents('render') || []) {
      for (const mi of render.meshInstances || []) {
        const mesh = mi.mesh;
        const count = mesh && mesh.vertexBuffer ? mesh.vertexBuffer.numVertices : 0;
        if (!count) continue;
        const arr = new Float32Array(count * 3);
        mesh.getPositions(arr);
        const step = Math.max(1, Math.floor(count / 700));
        for (let i = 0; i < count; i += step) {
          if (Math.abs(arr[i * 3]) > b.sx * 0.3 || Math.abs(arr[i * 3 + 2]) > b.sz * 0.3) continue;
          ys.push(arr[i * 3 + 1]);
        }
      }
    }
    if (!ys.length) return height * 0.74;
    ys.sort((a, c) => a - c);
    const y = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.78))];
    return Math.max(0.2, (y / Math.max(1e-4, b.sy)) * height - 0.02);
  }
  const couch = part('couch');
  const chest = part('chest');
  const vase = part('vase');
  const jar = part('jar');
  const pot = part('pot');
  if (couch && chest) {
    const stations = 3;
    const z0 = 4.2 * H;
    const z1 = Math.max(z0 + 8, stairFootZ - 1.7 * H);
    const couchH = 1.08;
    const chestH = 1.2;
    const vaseH = 1.9;
    const jarH = 0.78;
    const potH = 0.46;
    const couchFit = fitted(couch, couchH);
    const chestFit = fitted(chest, chestH);
    const carpetEdge = 2.5 * H * 0.5;
    const seat = seatOf(chest, chestH);
    for (let s = 0; s < stations; s += 1) {
      const zc = z0 + (z1 - z0) * (s / (stations - 1));
      for (const side of [-1, 1]) {
        const couchX = side * (carpetEdge + couchFit.across * 0.5 + 0.42);
        const gap = couchFit.along * 0.58;
        const couchRot = side < 0 ? couchFit.rot : -couchFit.rot;
        place(couch, root, 'prop-real', couchX, 0, zc - gap, couchH / couchFit.sy, couchH / couchFit.sy, couchH / couchFit.sy, couchRot);
        place(couch, root, 'prop-real', couchX, 0, zc + gap, couchH / couchFit.sy, couchH / couchFit.sy, couchH / couchFit.sy, couchRot);
        const chestX = side * (Math.abs(couchX) + couchFit.across * 0.5 + 0.55 + chestFit.across * 0.5);
        const chestRot = side < 0 ? chestFit.rot : -chestFit.rot;
        const cs = chestH / chestFit.sy;
        place(chest, root, 'prop-real', chestX, 0, zc, cs, cs, cs, chestRot);
        if (vase) {
          const vaseFit = fitted(vase, vaseH);
          const vaseX = side * (Math.abs(chestX) + chestFit.across * 0.5 + vaseFit.across * 0.5 + 0.28);
          const vs = vaseH / vaseFit.sy;
          place(vase, root, 'prop-real', vaseX, 0, zc - chestFit.along * 0.15, vs, vs, vs, 0);
        }
        if (jar) {
          const js = jarH / fitted(jar, jarH).sy;
          place(jar, root, 'prop-real', chestX, seat, zc - chestFit.along * 0.12, js, js, js, 0);
        }
        if (pot && pot !== jar) {
          const ps = potH / fitted(pot, potH).sy;
          place(pot, root, 'prop-real', chestX, seat, zc + chestFit.along * 0.12, ps, ps, ps, 0);
        }
      }
    }
  }
  const left = part('bannerL');
  const right = part('bannerR') || left;
  if (left) {
    const bannerH = Math.max(4.2, Math.min(CH * 0.58, CH - topY - 0.7));
    const bottom = topY + 0.1;
    const x = 2.45 * H;
    const z = L - 0.48;
    function hang(ent, px) {
      const b = localSize(ent);
      const thinIsX = b.sx <= b.sz;
      const face = thinIsX ? b.sz : b.sx;
      const sH = bannerH / Math.max(1e-4, b.sy);
      const sFace = 1.65 / Math.max(1e-4, face);
      place(ent, root, 'throne-banner', px, bottom, z, thinIsX ? sH : sFace, sH, thinIsX ? sFace : sH, thinIsX ? Math.PI / 2 : 0);
    }
    hang(left, -x);
    hang(right, x);
  }
  proto.destroy();
}

function placeLanterns(root, H, CH) {
  const h = 0.62 * H;
  const yHang = Math.max(0.8 * H, CH - h - 0.85 * H);
  const brass = new StandardMaterial();
  brass.diffuse = new Color(0xc9 / 255, 0xa3 / 255, 0x6a / 255);
  brass.emissive = new Color(1, 0xb1 / 255, 0x5a / 255);
  brass.emissiveIntensity = 0.35;
  brass.metalness = 0.2;
  brass.useMetalness = true;
  brass.roughness = 0.55;
  brass._sinOwned = true;
  brass.update();
  const chain = new StandardMaterial();
  chain.diffuse = new Color(0x3a / 255, 0x2e / 255, 0x24 / 255);
  chain.metalness = 0.4;
  chain.useMetalness = true;
  chain.roughness = 0.6;
  chain._sinOwned = true;
  chain.update();
  const spots = [[-1.6, 8.2], [1.6, 13.4], [-1.6, 18.8], [1.6, 24.2]];
  const bodyH = 0.55 * h * (1 / 0.745);
  const bodyR = 0.17 * h * (1 / 0.745);
  const capH = 0.22 * h * (1 / 0.745);
  const capR = 0.20 * h * (1 / 0.745);
  for (const [ux, uz] of spots) {
    const g = new Entity('hall-lantern');
    g.setLocalPosition(ux * H, yHang, uz * H);
    const body = new Entity('lantern-body');
    body.addComponent('render', { type: 'cylinder', material: brass });
    body.setLocalScale(bodyR * 2, bodyH, bodyR * 2);
    body.setLocalPosition(0, (0.32 - 0.045) * h * (1 / 0.745), 0);
    const cap = new Entity('lantern-cap');
    cap.addComponent('render', { type: 'cone', material: brass });
    cap.setLocalScale(capR * 2, capH, capR * 2);
    cap.setLocalPosition(0, (0.68 - 0.045) * h * (1 / 0.745), 0);
    const drop = Math.max(0.05, CH - (yHang + h));
    const link = new Entity('lantern-chain');
    link.addComponent('render', { type: 'box', material: chain });
    link.setLocalScale(0.02 * H, drop, 0.02 * H);
    link.setLocalPosition(0, h + drop * 0.5, 0);
    g.addChild(body);
    g.addChild(cap);
    g.addChild(link);
    root.addChild(g);
  }
}

export async function buildHall(registry, urls, world, portal) {
  const H = portal.H;
  const root = new Entity('PalaceInterior');
  root.setPosition(portal.x, portal.y, portal.z);
  world.addChild(root);

  const wall = await model(registry, urls, 'assets/الجدارية.glb');
  const wallRaw = boundsOf(wall);
  const wallFit = orientBottom(wall, wallRaw.sx > wallRaw.sz ? Math.PI / 2 : 0);
  const wallSize = wallFit.size;
  const L = 30 * H;
  const W = 14 * H;
  let n = 3;
  for (let k = 2; k <= 6; k += 1) {
    const hTry = wallSize.sy * ((L / k) / Math.max(1e-4, wallSize.sz));
    if (hTry >= 5.5 * H && hTry <= 8 * H) { n = k; break; }
  }
  const moduleLen = L / n;
  const wallScale = moduleLen / Math.max(1e-4, wallSize.sz);
  let CH = wallSize.sy * wallScale;
  if (CH > 8 * H) CH = 8 * H;
  const wallThick = wallSize.sx * wallScale;
  const halfT = wallThick * 0.5;
  for (let i = 0; i < n; i += 1) {
    const zc = (i + 0.5) * moduleLen;
    for (const side of [-1, 1]) {
      const x = side < 0 ? (-W / 2 - halfT) : (W / 2 + halfT);
      const scx = side < 0 ? wallScale : -wallScale;
      place(wallFit.host, root, 'wall-module', x, -0.05, zc, scx, wallScale, wallScale * 1.08);
    }
  }

  const archW = 0.30 * moduleLen;
  const archH = 0.64 * CH;
  const alcove = std(null, 0.96, 0.02);
  alcove.diffuse = new Color(0x14 / 255, 0x11 / 255, 0x0e / 255);
  alcove.update();
  const passages = [];
  const open = (side, index) => (side < 0 && index === 2) || (side > 0 && (index === 0 || index === 2));
  for (let i = 0; i < n; i += 1) {
    const zc = (i + 0.5) * moduleLen;
    for (const side of [-1, 1]) {
      const depth = 1.15 * H;
      const inner = side * (W / 2);
      const outer = inner + side * wallThick;
      const backX = outer + side * depth;
      if (!open(side, i)) {
        const span = Math.abs(backX - inner) + 0.2 * H;
        box(root, 'passage-slab', alcove, span, 0.1 * H, archW + 0.2 * H, (inner + backX) / 2, -0.02, zc);
        box(root, 'passage-slab', alcove, span, 0.06 * H, archW, (inner + backX) / 2, archH, zc);
        for (const k of [-1, 1]) {
          box(root, 'passage-jamb', alcove, span, archH, 0.08 * H, (outer + backX) / 2, archH * 0.5, zc + k * (archW / 2));
        }
      }
      passages.push({
        id: 'passage-' + (side < 0 ? 'L' : 'R') + i,
        position: [inner, 0, zc],
        width: archW,
        height: archH,
        open: open(side, i)
      });
    }
  }

  const column = await model(registry, urls, 'assets/اعمدة.glb');
  const colFit = orientBottom(column, 0);
  const colSize = colFit.size;
  const colH = Math.max(H, CH - 0.05);
  const colScale = colH / Math.max(1e-4, colSize.sy);
  const colRad = Math.max(colSize.sx, colSize.sz) * 0.5 * colScale;
  let colX = W / 2 - colRad - 1.22 * H;
  const minColX = 1.5 * H + colRad + 0.15 * H;
  if (colX < minColX) colX = minColX;
  const colZs = [];
  for (let i = 0; i <= n; i += 1) {
    let z = i * moduleLen;
    if (i === 0) z = Math.min(colRad * 0.92, moduleLen * 0.12);
    if (i === n) z = Math.max(L - colRad * 0.92, L - moduleLen * 0.12);
    colZs.push(z);
  }
  for (const z of colZs) {
    for (const side of [-1, 1]) place(colFit.host, root, 'column', side * colX, 0, z, colScale, colScale, colScale);
  }

  const floorPadX = Math.max(0.5 * H, wallThick * 0.9);
  const floorMap = await texture(registry, urls, OPT + 'marble.webp');
  const floorMat = std(floorMap, 1, 0);
  const fw = W + floorPadX * 2;
  const fd = L + 0.05 * H * 2;
  floorMat.diffuseMapTiling = new Vec2(fw / 1.8, fd / 1.8);
  floorMat.update();
  plane(root, 'floor', floorMat, fw, fd, 0, -0.015, L / 2);

  const borderMap = await texture(registry, urls, OPT + 'ارضية.webp');
  const bw = 0.48 * H;
  const stairTread = 0.32 * H;
  const stepsN = 12;
  const stairFootZ = (30 - 0.65 - 3.2 - stepsN * 0.32) * H;
  function border(w, len, x, z, alongX) {
    const m = std(borderMap, 0.72, 0.08);
    m.diffuseMapTiling = new Vec2(alongX ? w / (1.2 * H) : 1, alongX ? 1 : len / (1.2 * H));
    m.update();
    plane(root, 'floor-border', m, w, len, x, 0.006 * H, z);
  }
  border(W, bw, 0, bw / 2, true);
  border(W - bw * 2, bw, 0, stairFootZ - bw * 0.65, true);
  border(bw, stairFootZ - bw, -W / 2 + bw / 2, (stairFootZ - bw) / 2, false);
  border(bw, stairFootZ - bw, W / 2 - bw / 2, (stairFootZ - bw) / 2, false);

  const carpetMap = await texture(registry, urls, OPT + 'سجاد-الارضية.webp');
  carpetMap.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  const cw = 2.5 * H;
  const carpetEnd = stairFootZ + 0.04 * H;
  const carpetLen = Math.max(0.2, carpetEnd - 0.4 * H);
  const carpetMat = std(carpetMap, 0.84, 0.02);
  carpetMat.diffuseMapTiling = new Vec2(1, carpetLen / (cw * (1809 / 1067)));
  carpetMat.update();
  plane(root, 'carpet', carpetMat, cw, carpetLen, 0, 0.012 * H, (0.4 * H + carpetEnd) / 2);

  const stair = await model(registry, urls, 'assets/درج.glb');
  const fit = H / 1.8;
  const stairSpin = new Entity('stair-spin');
  stairSpin.setEulerAngles(0, 180, 0);
  stairSpin.setLocalScale(fit, fit, fit);
  stairSpin.addChild(stair);
  const holder = new Entity('stairs');
  holder.addChild(stairSpin);
  const sb = boundsOf(holder);
  holder.setLocalPosition(-sb.cx, -sb.minY, stairFootZ - sb.minZ);
  root.addChild(holder);
  const rise = sb.sy * (3.09022 / 4.49554);
  const run = sb.sz * (7.17277 / 7.45301);
  const stairW = sb.sx * (8.84 / 11.26);
  const platformFrontZ = stairFootZ + run;
  const topY = rise;
  const platBack = L - 0.65 * H;
  const throneZ = (platformFrontZ + platBack) * 0.5;
  const platLen = Math.max(1.2 * H, (L - 0.08 * H) - platformFrontZ);
  const stone = std(null, 0.62, 0.04);
  stone.diffuse = new Color(0xcb / 255, 0xb9 / 255, 0xa4 / 255);
  stone.update();
  box(root, 'platform', stone, stairW, 0.12 * H, platLen, 0, topY - 0.06 * H, platformFrontZ + platLen * 0.5);

  const throne = await model(registry, urls, 'assets/عرش البطل.glb');
  const throneH = 2 * H;
  const tb = boundsOf(throne);
  const ts = throneH / Math.max(1e-4, tb.sy);
  const throneSpin = new Entity('throne-spin');
  throneSpin.setEulerAngles(0, 180, 0);
  throneSpin.setLocalScale(ts, ts, ts);
  throneSpin.addChild(throne);
  const throneHold = new Entity('throne');
  throneHold.addChild(throneSpin);
  const tb2 = boundsOf(throneHold);
  throneSpin.setLocalPosition(-tb2.cx, -tb2.minY, -tb2.cz);
  throneHold.setLocalPosition(0, topY, throneZ);
  root.addChild(throneHold);

  const backMap = await texture(registry, urls, OPT + 'جدار-خلف-العرش.webp');
  backMap.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  backMap.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
  const backMat = std(backMap, 0.9, 0.05);
  backMat.emissiveMap = backMap;
  backMat.emissive = new Color(1, 1, 1);
  backMat.emissiveIntensity = 0.2;
  backMat.update();
  const north = std(null, 0.94, 0.02);
  north.diffuse = new Color(0x1a / 255, 0x14 / 255, 0x0f / 255);
  north.update();
  box(root, 'north-wall', north, W + wallThick * 2 + 0.8, CH + 0.5, 0.2, 0, CH / 2, L + 0.04);
  const aspect = 1536 / 1024;
  let panelH = CH * 0.94;
  let panelW = panelH * aspect;
  if (panelW > W * 0.94) { panelW = W * 0.94; panelH = panelW / aspect; }
  plane(root, 'back-relief', backMat, panelW, 1, 0, 0.04 * H + panelH / 2, L - 0.06, 90);
  const relief = root.findByName('back-relief');
  relief.setLocalScale(panelW, panelH, 1);
  relief.setEulerAngles(90, 180, 0);

  const doorMap = await texture(registry, urls, OPT + 'جدران-الباب.webp');
  const south = std(doorMap, 0.58, 0.22);
  const tile = 3.15 * H;
  south.diffuseMapTiling = new Vec2((W + wallThick * 2) / tile, (CH + 0.4) / tile);
  south.diffuse = new Color(1, 0xf1 / 255, 0xd4 / 255);
  south.update();
  box(root, 'south-wall', south, W + wallThick * 2, CH + 0.45, 0.28, 0, (CH + 0.45) * 0.5 - 0.08, 0.02);

  const entry = await model(registry, urls, 'assets/مجسم الباب.glb');
  let eb = boundsOf(entry);
  const entrySpin = new Entity('entry-door');
  if (eb.sz > eb.sx) entrySpin.setEulerAngles(0, 90, 0);
  entrySpin.addChild(entry);
  eb = boundsOf(entrySpin);
  const fitW = Math.max(1.2, portal.doorWidth || 4.42);
  const fitH = Math.min(CH * 0.78, fitW * (eb.sy / Math.max(0.01, eb.sx)));
  const es = Math.min(fitW / Math.max(0.01, eb.sx), fitH / Math.max(0.01, eb.sy));
  entrySpin.setLocalScale(es, es, es);
  const eb2 = boundsOf(entrySpin);
  entrySpin.setLocalPosition(-eb2.cx, -eb2.minY, 0.28 - eb2.minZ);
  root.addChild(entrySpin);

  const ceilMap = await texture(registry, urls, OPT + 'سقف-القصر.webp');
  const ceilOver = wallThick + 0.4 * H;
  const ceilSpanX = W + ceilOver * 2;
  const ceilSpanZ = L + 0.7 * H;
  const ceilMat = std(ceilMap, 0.62, 0.16);
  const ceilTile = 4.2 * H;
  ceilMat.diffuseMapTiling = new Vec2(ceilSpanX / ceilTile, ceilSpanZ / ceilTile);
  ceilMat.emissive = new Color(0x3a / 255, 0x2a / 255, 0x16 / 255);
  ceilMat.emissiveIntensity = 0.08;
  ceilMat.update();
  const ceiling = plane(root, 'ceiling', ceilMat, ceilSpanX, ceilSpanZ, 0, CH - 0.22, L / 2);
  ceiling.setEulerAngles(180, 0, 0);
  const cornice = std(null, 0.62, 0.28);
  cornice.diffuse = new Color(0x8d / 255, 0x68 / 255, 0x40 / 255);
  cornice.update();
  const beamH = 0.26 * H;
  const beamT = 0.34 * H;
  box(root, 'cornice', cornice, W + wallThick, beamH, beamT, 0, CH - beamH * 0.42, beamT * 0.2);
  box(root, 'cornice', cornice, W + wallThick, beamH, beamT, 0, CH - beamH * 0.42, L - beamT * 0.2);
  box(root, 'cornice', cornice, beamT, beamH, L, -W / 2 + beamT * 0.12, CH - beamH * 0.42, L / 2);
  box(root, 'cornice', cornice, beamT, beamH, L, W / 2 - beamT * 0.12, CH - beamH * 0.42, L / 2);

  const lion = await model(registry, urls, 'assets/lion_winged.glb.glb');
  const lionFit = orientBottom(lion, 0);
  const lionSize = lionFit.size;
  const lionS = 4.25 / Math.max(1e-4, lionSize.sy);
  const lionLen = lionSize.sz * lionS;
  const lionCenterX = cw * 0.5 + 0.42 * H + lionLen * 0.5;
  const lionZ = stairFootZ - 1.2 * H;
  for (const side of [-1, 1]) {
    place(lionFit.host, root, 'lion', side * lionCenterX, 0, lionZ, lionS, lionS, lionS, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  const smallS = 2.2 / Math.max(1e-4, lionSize.sy);
  for (const side of [-1, 1]) {
    place(lionFit.host, root, 'lionSmall', side * 1.65 * H, topY, throneZ + 0.22 * H, smallS, smallS, smallS, Math.PI);
  }

  const brazier = await model(registry, urls, 'assets/المباخر.glb');
  const brzFit = orientBottom(brazier, 0);
  const brzSize = brzFit.size;
  const fires = [];
  function addBrazier(x, z, y, target, rot) {
    const s = target / Math.max(1e-4, brzSize.sy);
    place(brzFit.host, root, 'brazier', x, y, z, s, s, s, rot);
    fires.push({ x, y: y + target * 0.66, z, seed: fires.length * 1.7 + 0.2 });
  }
  for (const zH of [4.2, 9.0, 13.8, 18.6]) {
    for (const side of [-1, 1]) addBrazier(side * 2.2 * H, zH * H, 0, 3.05, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  const stairOuter = sb.sx * 0.5;
  for (const side of [-1, 1]) {
    const rot = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    addBrazier(side * (stairOuter + 0.55 * H), stairFootZ - 0.35 * H, 0, 3.25, rot);
    addBrazier(side * 2.15 * H, platformFrontZ + 0.55 * H, topY, 2.55, rot);
  }
  fires.sort((a, b) => a.z - b.z || a.x - b.x);
  buildHallFire(root, fires, H);
  try {
    await placeHallProps(registry, urls, root, { H, L, CH, topY, stairFootZ });
  } catch (err) {
    GAPS.push('تعذّر ترتيب مجموعة الأغراض: ' + (err && err.message ? err.message : err));
  }
  const ly = Math.min(CH * 0.46, 3.1 * H);
  for (let i = 0; i < 6 && fires.length; i += 1) {
    const f = fires[Math.min(fires.length - 1, Math.round(i * (fires.length - 1) / 5))];
    const light = new Entity('hall-light');
    light.addComponent('light', {
      type: 'point',
      color: new Color(1, 0xb1 / 255, 0x5a / 255),
      intensity: 2.15,
      range: 16 * H,
      castShadows: false
    });
    light.setLocalPosition(f.x, ly, f.z);
    root.addChild(light);
  }
  const wash = new Entity('hall-wash');
  wash.addComponent('light', {
    type: 'directional',
    color: new Color(1, 0xf0 / 255, 0xd0 / 255),
    intensity: 0.5,
    castShadows: false
  });
  root.addChild(wash);
  wash.setLocalPosition(-0.2 * H, CH * 0.86, L * 0.18);
  const origin = root.getPosition();
  wash.lookAt(origin.x, origin.y + CH * 0.28, origin.z + L * 0.66);

  const boxes = [];
  function pushBox(minx, miny, minz, maxx, maxy, maxz) {
    boxes.push({
      minx: Math.min(minx, maxx),
      miny: Math.min(miny, maxy),
      minz: Math.min(minz, maxz),
      maxx: Math.max(minx, maxx),
      maxy: Math.max(miny, maxy),
      maxz: Math.max(minz, maxz)
    });
  }
  for (const side of [-1, 1]) {
    const cuts = [];
    for (let i = 0; i < n; i += 1) {
      if (!open(side, i)) continue;
      const zc = (i + 0.5) * moduleLen;
      cuts.push({ z0: zc - archW / 2, z1: zc + archW / 2 });
    }
    let cursor = 0;
    for (const cut of cuts) {
      if (cut.z0 > cursor) pushBox(side * (W / 2) - 0.45, 0, cursor, side * (W / 2) + 0.45, CH, cut.z0);
      pushBox(side * (W / 2) - 0.45, archH, cut.z0, side * (W / 2) + 0.45, CH, cut.z1);
      cursor = cut.z1;
    }
    if (cursor < L) pushBox(side * (W / 2) - 0.45, 0, cursor, side * (W / 2) + 0.45, CH, L);
  }
  pushBox(-W / 2, 0, L - 0.45, W / 2, CH, L + 0.45);
  pushBox(-W / 2 - 0.3, 0, -0.4, W / 2 + 0.3, CH, 0.85);
  const hx = stairW / 2;
  pushBox(-hx - 0.3 * H, 0, platformFrontZ, -hx + 0.04 * H, topY + H, L);
  pushBox(hx - 0.04 * H, 0, platformFrontZ, hx + 0.3 * H, topY + H, L);
  for (let i = 0; i < n; i += 1) {
    const zc = (i + 0.5) * moduleLen;
    for (const side of [-1, 1]) {
      if (open(side, i)) continue;
      const inner = side * (W / 2);
      const span = 0.22 * H;
      pushBox(Math.min(inner, inner - side * span), 0, zc - archW / 2, Math.max(inner, inner - side * span), archH, zc + archW / 2);
    }
  }
  for (const z of colZs) {
    for (const side of [-1, 1]) {
      const x = side * colX;
      const r = colRad * 0.72;
      pushBox(x - r, 0, z - r, x + r, colH, z + r);
    }
  }
  const stepHalf = stairW * 0.5;
  pushBox(-stairOuter, 0, stairFootZ, -stepHalf + 0.04 * H, topY + 0.4 * H, platformFrontZ);
  pushBox(stepHalf - 0.04 * H, 0, stairFootZ, stairOuter, topY + 0.4 * H, platformFrontZ);
  function lionBox(x, y, z, scale, rot) {
    const sx = lionSize.sx * scale * 0.5;
    const sz = lionSize.sz * scale * 0.5;
    const swap = Math.abs(Math.sin(rot)) > 0.7;
    const ex = swap ? sz : sx;
    const ez = swap ? sx : sz;
    pushBox(x - ex, y, z - ez, x + ex, y + lionSize.sy * scale, z + ez);
  }
  for (const side of [-1, 1]) lionBox(side * lionCenterX, 0, lionZ, lionS, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const side of [-1, 1]) lionBox(side * 1.65 * H, topY, throneZ + 0.22 * H, smallS, Math.PI);
  function brazierBox(x, z, y, target) {
    const s = target / Math.max(1e-4, brzSize.sy);
    const r = Math.max(brzSize.sx, brzSize.sz) * s * 0.5;
    pushBox(x - r, y, z - r, x + r, y + target, z + r);
  }
  for (const zH of [4.2, 9.0, 13.8, 18.6]) {
    for (const side of [-1, 1]) brazierBox(side * 2.2 * H, zH * H, 0, 3.05);
  }
  for (const side of [-1, 1]) {
    brazierBox(side * (stairOuter + 0.55 * H), stairFootZ - 0.35 * H, 0, 3.25);
    brazierBox(side * 2.15 * H, platformFrontZ + 0.55 * H, topY, 2.55);
  }
  const throneBox = boundsOf(throneHold);
  pushBox(
    throneBox.minX - portal.x, throneBox.minY - portal.y, throneBox.minZ - portal.z,
    throneBox.maxX - portal.x, throneBox.maxY - portal.y, throneBox.maxZ - portal.z
  );
  const ramp = { x0: -stairW / 2, x1: stairW / 2, z0: stairFootZ, z1: platformFrontZ, zPlat: L - 0.2 * H, yTop: topY };

  root.enabled = true;
  placeLanterns(root, H, CH);
  return {
    root,
    gaps: GAPS.slice(),
    boxes,
    ramp,
    metrics: {
      H, width: W, length: L, height: CH, wallThickness: wallThick, alcoveDepth: 1.15 * H,
      modules: n, passages, doorUrl: DOOR_URL
    }
  };
}
