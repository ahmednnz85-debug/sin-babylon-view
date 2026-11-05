import * as pc from '../vendor/playcanvas.mjs';
import layout from './market-layout.js';

const { Entity, MeshInstance, VertexFormat, VertexBuffer } = pc;
const ASSET = '/sin-babylon-view/original/assets/';
const PAL = { s: 56, z: 186, x: 5.6 };
const PAL_BOX = {
  x0: PAL.x - 0.5 * PAL.s - 2,
  x1: PAL.x + 0.5 * PAL.s + 2,
  z0: PAL.z - 0.47 * PAL.s - 3,
  z1: PAL.z + 0.47 * PAL.s + 3
};

const chunks = [];

export function mulberry(a) {
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Copied from index.html babylonForestLayout. Colliders inside the market
// never reach this band (edge 34), so an empty list keeps the same positions.
export function babylonForestLayout(C) {
  const mb = C.mulberry;
  const out = { left: [], right: [] };
  const palAbsX = Math.max(Math.abs(C.palaceBox.x0), Math.abs(C.palaceBox.x1));
  const crownOf = (h) => 0.26 * h;
  const blocked = (ax, z, r) => {
    if (ax - 0.75 * r < C.edge) return true;
    if (z + r > C.palaceBox.z0 - 5 && z - r < C.palaceBox.z1 + 5 && ax - 0.6 * r < palAbsX + 5) return true;
    for (let i = 0; i < C.colliders.length; i += 1) {
      const c = C.colliders[i];
      const dx = ax - Math.abs(c[0]);
      const dz = z - c[1];
      const rr = c[2] + 0.3 * r;
      if (Math.abs(c[0]) > 0 && dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  };
  const sides = [[-1, 'left', C.seed + 11], [1, 'right', C.seed + 977]];
  const perLayer = sides.map(([sg, name, seed]) => {
    const R = mb(seed);
    const ph1 = R() * 6.28;
    const ph2 = R() * 6.28;
    const cell = 8;
    const grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const nz = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.071 + z * 0.043 + ph1) + 0.25 * Math.sin(z * 0.057 - x * 0.038 + ph2);
    const layersOut = [];
    C.layers.forEach((L, li) => {
      const arr = [];
      let tries = 0;
      while (arr.length < L.n && tries < L.n * 80) {
        tries += 1;
        const ax = L.x0 + (L.x1 - L.x0) * Math.pow(R(), L.bias);
        const z = C.zFrom + (C.zTo - C.zFrom) * R();
        if (R() > 0.40 + 0.60 * nz(ax * sg, z)) continue;
        const u = R();
        const w = L.w;
        let a;
        let b;
        if (u < w[0]) { a = 4.2; b = 7.0; }
        else if (u < w[0] + w[1]) { a = 8.5; b = 13; }
        else { a = 13.5; b = 21; }
        const h = a + (b - a) * R();
        const r = crownOf(h) * (0.92 + 0.2 * R());
        if (blocked(ax, z, r)) continue;
        const cx = Math.floor(ax / cell);
        const cz = Math.floor(z / cell);
        let bad = false;
        for (let i = -2; i <= 2 && !bad; i += 1) {
          for (let j = -2; j <= 2 && !bad; j += 1) {
            const list = grid.get((cx + i) + ',' + (cz + j));
            if (!list) continue;
            for (const o of list) {
              const dx = ax - o.ax;
              const dz = z - o.z;
              const m = (r + o.r) * 0.62 + 0.9;
              if (dx * dx + dz * dz < m * m) { bad = true; break; }
            }
          }
        }
        if (bad) continue;
        const t = {
          ax, z, h, r, layer: li, optional: !!L.optional,
          yaw: R() * Math.PI * 2, tx: (R() - 0.5) * 0.12, tz: (R() - 0.5) * 0.12,
          wx: 0.9 + 0.22 * R(), hy: 0.94 + 0.12 * R(),
          tint: [0.80 + 0.26 * R(), 0.84 + 0.20 * R(), 0.78 + 0.22 * R()]
        };
        arr.push(t);
        const k = key(ax, z);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(t);
      }
      layersOut.push(arr);
    });
    return layersOut;
  });
  C.layers.forEach((L, li) => {
    const n = Math.min(perLayer[0][li].length, perLayer[1][li].length);
    sides.forEach(([sg, name], si) => {
      perLayer[si][li].slice(0, n).forEach((t) => out[name].push({
        x: sg * t.ax, z: t.z, h: t.h, r: t.r, layer: t.layer, optional: t.optional,
        yaw: t.yaw, tx: t.tx, tz: t.tz, wx: t.wx, hy: t.hy, tint: t.tint
      }));
    });
  });
  return out;
}

export function babylonNewTreeLayout(C) {
  const mb = C.mulberry;
  const out = { left: [], right: [] };
  const palAbsX = Math.max(Math.abs(C.palaceBox.x0), Math.abs(C.palaceBox.x1));
  const crownOf = (h) => 0.46 * h;
  const sides = [[-1, 'left', C.seed + 31], [1, 'right', C.seed + 719]];
  const perSide = sides.map(([sg, name, seed]) => {
    const R = mb(seed);
    const ph1 = R() * 6.28;
    const ph2 = R() * 6.28;
    const cell = 12;
    const grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const put = (t) => {
      const k = key(t.ax, t.z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    };
    (C.old || []).forEach((o) => {
      if (o.x !== 0 && (o.x < 0) === (sg < 0)) put({ ax: Math.abs(o.x), z: o.z, r: o.r, old: true });
    });
    const nz = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.047 + z * 0.031 + ph1) + 0.25 * Math.sin(z * 0.039 - x * 0.052 + ph2);
    const blocked = (ax, z, r) => {
      if (ax - 0.7 * r < C.edge) return true;
      if (z + r > C.palaceBox.z0 - 5 && z - r < C.palaceBox.z1 + 5 && ax - 0.6 * r < palAbsX + 6) return true;
      const x = sg * ax;
      for (let i = 0; i < C.colliders.length; i += 1) {
        const c = C.colliders[i];
        const dx = x - c[0];
        const dz = z - c[1];
        const rr = c[2] + 0.3 * r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return false;
    };
    const layersOut = [];
    C.layers.forEach((L, li) => {
      const arr = [];
      let tries = 0;
      while (arr.length < L.n && tries < L.n * 140) {
        tries += 1;
        const ax = L.x0 + (L.x1 - L.x0) * Math.pow(R(), L.bias);
        const z = C.zFrom + (C.zTo - C.zFrom) * R();
        if (R() > 0.35 + 0.65 * nz(ax, z)) continue;
        const h = L.hMin + (L.hMax - L.hMin) * (R() < 0.28 ? R() * 0.4 : 0.25 + 0.75 * R());
        const r = crownOf(h) * (0.95 + 0.12 * R());
        if (blocked(ax, z, r)) continue;
        const cx = Math.floor(ax / cell);
        const cz = Math.floor(z / cell);
        let bad = false;
        for (let i = -2; i <= 2 && !bad; i += 1) {
          for (let j = -2; j <= 2 && !bad; j += 1) {
            const list = grid.get((cx + i) + ',' + (cz + j));
            if (!list) continue;
            for (const o of list) {
              const dx = ax - o.ax;
              const dz = z - o.z;
              const m = o.old ? (r + o.r) * 0.55 + 1.4 : (r + o.r) * 0.78 + 2.2;
              if (dx * dx + dz * dz < m * m) { bad = true; break; }
            }
          }
        }
        if (bad) continue;
        const t = {
          ax, z, h, r, layer: li, optional: !!L.optional,
          yaw: R() * Math.PI * 2, tx: (R() - 0.5) * 0.08, tz: (R() - 0.5) * 0.08,
          wx: 0.92 + 0.2 * R(), hy: 0.95 + 0.12 * R(),
          tint: [0.80 + 0.26 * R(), 0.84 + 0.20 * R(), 0.78 + 0.22 * R()]
        };
        arr.push(t);
        put(t);
      }
      layersOut.push(arr);
    });
    return layersOut;
  });
  C.layers.forEach((L, li) => {
    const n = Math.min(perSide[0][li].length, perSide[1][li].length);
    sides.forEach(([sg, name], si) => {
      perSide[si][li].slice(0, n).forEach((t) => out[name].push({
        x: sg * t.ax, z: t.z, h: t.h, r: t.r, layer: t.layer, optional: t.optional,
        yaw: t.yaw, tx: t.tx, tz: t.tz, wx: t.wx, hy: t.hy, tint: t.tint
      }));
    });
  });
  return out;
}

export function babylonGrassLayout(C) {
  const R = C.mulberry(C.seed);
  const ph1 = R() * 6.28;
  const ph2 = R() * 6.28;
  const ph3 = R() * 6.28;
  const out = [];
  const palAbsX = Math.max(Math.abs(C.palaceBox.x0), Math.abs(C.palaceBox.x1));
  const nz = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.083 + z * 0.061 + ph1) + 0.25 * Math.sin(z * 0.071 - x * 0.097 + ph2);
  const vn = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.052 + z * 0.044 + ph3) * Math.sin(z * 0.037 - x * 0.029 + ph1);
  const CS = 16;
  const cg = new Map();
  C.colliders.forEach((c) => {
    const k = Math.floor(c[0] / CS) + ',' + Math.floor(c[1] / CS);
    if (!cg.has(k)) cg.set(k, []);
    cg.get(k).push(c);
  });
  const hit = (x, z) => {
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        const list = cg.get((cx + i) + ',' + (cz + j));
        if (!list) continue;
        for (const c of list) {
          const dx = x - c[0];
          const dz = z - c[1];
          const rr = c[2] + 0.35;
          if (dx * dx + dz * dz < rr * rr) return true;
        }
      }
    }
    return false;
  };
  const cell = 2.0;
  const xm = C.edge + C.reach;
  for (let gx = -xm; gx <= xm; gx += cell) {
    for (let gz = C.zFrom; gz <= C.zTo; gz += cell) {
      const x = gx + (R() - 0.5) * cell * 0.95;
      const z = gz + (R() - 0.5) * cell * 0.95;
      const ax = Math.abs(x);
      const side = ax >= C.edge;
      const back = z < C.backZ;
      if (!side && !back) continue;
      const dOut = Math.max(side ? ax - C.edge : 0, back ? C.backZ - z : 0);
      if (dOut > C.reach) continue;
      if (z > C.palaceBox.z0 - 3 && z < C.palaceBox.z1 + 3 && ax < palAbsX + 4) continue;
      const step = dOut < 26 ? 2.0 : dOut < 66 ? 3.0 : 4.4;
      if (R() > Math.min(1, (cell / step) * (cell / step)) * (0.40 + 0.60 * nz(x, z)) * 1.35) continue;
      if (hit(x, z)) continue;
      const sw = 0.105 + 0.06 * R();
      const b = 0.80 + 0.30 * nz(x, z) * 0.6 + 0.12 * R();
      out.push({
        x, z, sw, sh: 0.85 + 0.45 * R(), yaw: R() * Math.PI * 2,
        tx: (R() - 0.5) * 0.16, tz: (R() - 0.5) * 0.16,
        v: (vn(x, z) + (R() - 0.5) * 0.55 > 0.5) ? 1 : 0, rank: R(),
        tint: [0.90 * b * (0.96 + 0.10 * R()), 0.68 * b * (0.95 + 0.10 * R()), 0.80 * b * (0.90 + 0.20 * R())]
      });
    }
  }
  return out;
}

function yxzScale(px, py, pz, rx, ry, rz, sx, sy, sz) {
  const c1 = Math.cos(rx);
  const c2 = Math.cos(ry);
  const c3 = Math.cos(rz);
  const s1 = Math.sin(rx);
  const s2 = Math.sin(ry);
  const s3 = Math.sin(rz);
  const r00 = c2 * c3 + s2 * s1 * s3;
  const r10 = c1 * s3;
  const r20 = c2 * s1 * s3 - s2 * c3;
  const r01 = s2 * s1 * c3 - c2 * s3;
  const r11 = c1 * c3;
  const r21 = s2 * c3 + c2 * s1 * c3;
  const r02 = c1 * s2;
  const r12 = -s1;
  const r22 = c1 * c2;
  return [
    r00 * sx, r10 * sx, r20 * sx, 0,
    r01 * sy, r11 * sy, r21 * sy, 0,
    r02 * sz, r12 * sz, r22 * sz, 0,
    px, py, pz, 1
  ];
}

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function parts(entity) {
  entity.syncHierarchy();
  const out = [];
  for (const render of entity.findComponents('render') || []) {
    for (const mi of render.meshInstances) {
      const name = (mi.node && mi.node.name) || mi.mesh.name || '';
      out.push({ mesh: mi.mesh, material: mi.material, name, world: Array.from(mi.node.getWorldTransform().data) });
    }
  }
  return out;
}

function instanceMeshes(device, parent, name, specs, matrices) {
  if (!matrices.length) return null;
  const format = new VertexFormat(device, [
    { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR13, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR15, components: 4, type: pc.TYPE_FLOAT32 }
  ]);
  const root = new Entity(name);
  root.enabled = false;
  parent.addChild(root);
  for (const spec of specs) {
    const vb = new VertexBuffer(device, format, matrices.length, { usage: pc.BUFFER_STATIC });
    const data = new Float32Array(vb.lock());
    for (let i = 0; i < matrices.length; i += 1) data.set(matrices[i], i * 16);
    vb.unlock();
    const mi = new MeshInstance(spec.mesh, spec.material);
    mi.setInstancing(vb, false);
    mi.castShadow = false;
    const ent = new Entity(spec.name || 'part');
    ent.addComponent('render', { meshInstances: [mi], castShadows: false });
    root.addChild(ent);
  }
  return root;
}

function treeMatrix(tree, height, center, base) {
  const s = tree.h / height;
  const trs = yxzScale(tree.x, 0, tree.z, tree.tx || 0, tree.yaw || 0, tree.tz || 0, s * (tree.wx || 1), s * (tree.hy || 1), s * (tree.wx || 1));
  const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -center[0], -center[1], -center[2], 1];
  return mul(mul(trs, shift), base);
}

function transformedAabb(part) {
  const box = part.mesh.aabb;
  const c = box.center;
  const h = box.halfExtents;
  const m = part.world;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = c.x + sx * h.x;
        const y = c.y + sy * h.y;
        const z = c.z + sz * h.z;
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        minX = Math.min(minX, wx);
        minY = Math.min(minY, wy);
        minZ = Math.min(minZ, wz);
        maxX = Math.max(maxX, wx);
        maxY = Math.max(maxY, wy);
        maxZ = Math.max(maxZ, wz);
      }
    }
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function triCount(part) {
  const prim = part.mesh.primitive;
  const list = Array.isArray(prim) ? prim : (prim ? [prim] : []);
  return list.reduce((sum, item) => sum + (item.count || 0), 0);
}

function bounds(entity) {
  entity.syncHierarchy();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const render of entity.findComponents('render') || []) {
    for (const mi of render.meshInstances) {
      mi.node._aabbVer = (mi.node._aabbVer || 0) + 1;
      mi._updateAabb = true;
      const c = mi.aabb.center;
      const h = mi.aabb.halfExtents;
      minX = Math.min(minX, c.x - h.x);
      minY = Math.min(minY, c.y - h.y);
      minZ = Math.min(minZ, c.z - h.z);
      maxX = Math.max(maxX, c.x + h.x);
      maxY = Math.max(maxY, c.y + h.y);
      maxZ = Math.max(maxZ, c.z + h.z);
    }
  }
  return { minY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, sy: maxY - minY, maxY };
}

function horizonSpots() {
  const R = mulberry(20261101);
  const spots = [];
  const push = (x, z, h, kind) => spots.push({ x, z, h, yaw: R() * 6.2832, kind });
  for (let row = 0; row < 3; row += 1) {
    const z = -100 - row * 18;
    const n = row === 1 ? 11 : 9;
    for (let i = 0; i < n; i += 1) {
      push(-82 + (164 / (n - 1)) * i + (R() - 0.5) * 3.2, z + (R() - 0.5) * 2.4, 15.5 + R() * 6.5, i % 2);
    }
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k += 1) {
      const z = -76 + k * 13;
      push(s * (27 + R() * 2.2), z, 12.5 + R() * 4.5, 0);
      push(s * (46 + R() * 3), z - 3, 15 + R() * 5, 1);
      if (k % 2 === 0) push(s * (66 + R() * 4), z - 6, 17 + R() * 4, 0);
    }
  }
  return spots;
}

export function updateVegetation(pos, high) {
  if (!window.__vegReady) return;
  const maxFar = high ? 1 : 0.72;
  for (const chunk of chunks) {
    const dx = chunk.x - pos.x;
    const dz = chunk.z - pos.z;
    const dist = Math.max(0, Math.hypot(dx, dz) - chunk.r);
    const limit = high ? chunk.max : chunk.max * maxFar;
    let lod = -1;
    if ((high || !chunk.optional) && dist < limit) {
      lod = dist < chunk.lodD[0] ? 0 : dist < chunk.lodD[1] ? 1 : 2;
      if (!high && lod < chunk.minLod) lod = chunk.minLod;
    }
    for (let i = 0; i < chunk.lods.length; i += 1) {
      if (chunk.lods[i]) chunk.lods[i].enabled = i === lod;
    }
  }
}

export async function buildVegetation(app, registry, parent) {
  const gaps = [];
  window.__stage = 'grove-layout';
  window.__vegReady = false;
  const device = app.graphicsDevice;
  const wallStart = layout.marketEndZ + 0.4;
  const zFrom = Math.max(38, wallStart - 40);
  const forest = babylonForestLayout({
    mulberry, edge: 34, zFrom, zTo: 272, palaceBox: PAL_BOX, colliders: [], seed: 20261027,
    layers: [
      { x0: 34, x1: 62, n: 110, w: [0.30, 0.32, 0.38], bias: 1.1, optional: false },
      { x0: 62, x1: 95, n: 50, w: [0.04, 0.20, 0.76], bias: 1.0, optional: true },
      { x0: 95, x1: 140, n: 18, w: [0, 0.1, 0.9], bias: 1.0, optional: true }
    ]
  });
  const oldTrees = forest.left.concat(forest.right);
  const palmAsset = await registry.retain(ASSET + 'palm.glb', 'container');
  const palmProto = palmAsset.resource.instantiateRenderEntity();
  parent.addChild(palmProto);
  const palmBox = bounds(palmProto);
  const palmParts = parts(palmProto);
  palmProto.destroy();
  const palmBase = palmParts[0] ? palmParts[0].world : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const palmCenter = [palmBox.cx, palmBox.minY, palmBox.cz];
  const oldMats = oldTrees.map((t) => treeMatrix(t, palmBox.sy, palmCenter, palmBase));
  const oldRoot = instanceMeshes(device, parent, 'babylon-grove', palmParts, oldMats);
  if (oldRoot) {
    chunks.push({ x: 0, z: 150, r: 140, max: 175, optional: false, lodD: [175, 175], minLod: 0, lods: [oldRoot, null, null] });
  }

  try {
    const newer = babylonNewTreeLayout({
      mulberry, edge: 38, zFrom: -70, zTo: 275, palaceBox: PAL_BOX, colliders: [],
      old: oldTrees.map((t) => ({ x: t.x, z: t.z, r: t.r })), seed: 20261028,
      layers: [
        { x0: 38, x1: 74, n: 44, hMin: 7.5, hMax: 12.5, bias: 1.1, optional: false },
        { x0: 74, x1: 120, n: 30, hMin: 10, hMax: 15, bias: 1.0, optional: false },
        { x0: 120, x1: 178, n: 16, hMin: 12, hMax: 17, bias: 1.0, optional: true }
      ]
    });
    const newTrees = newer.left.concat(newer.right);
    const asset = await registry.retain(ASSET + 'palm_new.glb', 'container');
    const proto = asset.resource.instantiateRenderEntity();
    parent.addChild(proto);
    const box = bounds(proto);
    const all = parts(proto);
    proto.destroy();
    const by = (re) => all.filter((p) => re.test(p.name));
    const trunk = by(/trunk/i)[0] || all[0];
    const leaf2 = [by(/Leaf_2_0/i)[0], by(/LOD1_Leaf2/i)[0], by(/LOD2_Leaf2/i)[0]].filter(Boolean);
    const leaf0 = [by(/Leaf_0$/i)[0], by(/LOD1_Leaf0/i)[0], by(/LOD2_Leaf0/i)[0]].filter(Boolean);
    const trunkBox = transformedAabb(trunk);
    let sceneMaxY = trunkBox.maxY;
    for (const part of all) sceneMaxY = Math.max(sceneMaxY, transformedAabb(part).maxY);
    const newHeight = Math.max(0.01, sceneMaxY - trunkBox.minY);
    const newCenter = [(trunkBox.minX + trunkBox.maxX) / 2, trunkBox.minY, (trunkBox.minZ + trunkBox.maxZ) / 2];
    const groups = new Map();
    for (const t of newTrees) {
      const k = (t.x < 0 ? -1 : 1) + ':' + t.layer + ':' + Math.floor((t.z + 70) / 36);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    for (const list of groups.values()) {
      const mats = list.map((t) => treeMatrix(t, newHeight, newCenter, trunk.world));
      const lods = [0, 1, 2].map((li) => instanceMeshes(device, parent, 'new-palm', [trunk, leaf2[Math.min(li, leaf2.length - 1)], leaf0[Math.min(li, leaf0.length - 1)]].filter(Boolean), mats));
      let sx = 0;
      let sz = 0;
      list.forEach((t) => { sx += t.x; sz += t.z; });
      chunks.push({
        x: sx / list.length, z: sz / list.length, r: 22,
        max: 120, optional: list[0].optional, lodD: [24, 52], minLod: 1, lods
      });
    }
    window.__groveNew = newTrees.length;
    window.__groveNewHeight = newHeight;
  } catch (err) {
    gaps.push('بستان palm_new لم يُركَّب: ' + (err && err.message ? err.message : err));
  }

  try {
    const spots = horizonSpots();
    const batches = [
      spots.filter((t) => t.z < -96),
      spots.filter((t) => t.z >= -96 && t.x < 0),
      spots.filter((t) => t.z >= -96 && t.x >= 0)
    ];
    let newPack = null;
    if ((window.__groveNew || 0) > 0) {
      const asset = await registry.retain(ASSET + 'palm_new.glb', 'container');
      const proto = asset.resource.instantiateRenderEntity();
      parent.addChild(proto);
      const all = parts(proto);
      proto.destroy();
      const by = (re) => all.filter((p) => re.test(p.name));
      const trunk = by(/trunk/i)[0];
      const leaf2 = [by(/Leaf_2_0/i)[0], by(/LOD1_Leaf2/i)[0], by(/LOD2_Leaf2/i)[0]].filter(Boolean);
      const leaf0 = [by(/Leaf_0$/i)[0], by(/LOD1_Leaf0/i)[0], by(/LOD2_Leaf0/i)[0]].filter(Boolean);
      const trunkBox = transformedAabb(trunk);
      let sceneMaxY = trunkBox.maxY;
      for (const part of all) sceneMaxY = Math.max(sceneMaxY, transformedAabb(part).maxY);
      newPack = {
        height: Math.max(0.01, sceneMaxY - trunkBox.minY),
        center: [(trunkBox.minX + trunkBox.maxX) / 2, trunkBox.minY, (trunkBox.minZ + trunkBox.maxZ) / 2],
        specs: [trunk, leaf2[leaf2.length - 1], leaf0[leaf0.length - 1]].filter(Boolean)
      };
    }
    for (const batch of batches) {
      if (!batch.length) continue;
      const root = new Entity('start-horizon');
      root.enabled = false;
      parent.addChild(root);
      const oldSpots = batch.filter((t) => t.kind === 0);
      const newSpots = batch.filter((t) => t.kind === 1);
      if (oldSpots.length) {
        const mats = oldSpots.map((t) => treeMatrix(
          { ...t, tx: 0, tz: 0, wx: 1, hy: 1 },
          palmBox.sy,
          palmCenter,
          palmBase
        ));
        const partRoot = instanceMeshes(device, root, 'horizon-old', palmParts, mats);
        if (partRoot) partRoot.enabled = true;
      }
      if (newSpots.length && newPack) {
        const mats = newSpots.map((t) => treeMatrix(
          { ...t, tx: 0, tz: 0, wx: 1, hy: 1 },
          newPack.height,
          newPack.center,
          newPack.specs[0].world
        ));
        const partRoot = instanceMeshes(device, root, 'horizon-new', newPack.specs, mats);
        if (partRoot) partRoot.enabled = true;
      }
      let sx = 0;
      let sz = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      batch.forEach((t) => {
        sx += t.x;
        sz += t.z;
        minX = Math.min(minX, t.x);
        maxX = Math.max(maxX, t.x);
        minZ = Math.min(minZ, t.z);
        maxZ = Math.max(maxZ, t.z);
      });
      chunks.push({
        x: sx / batch.length,
        z: sz / batch.length,
        r: 0.5 * Math.hypot(maxX - minX, maxZ - minZ) + 8,
        max: 150,
        optional: false,
        lodD: [240, 400],
        minLod: 0,
        lods: [root, null, null]
      });
    }
    window.__horizon = spots.length;
  } catch (err) {
    gaps.push('نخيل الأفق لم يُركَّب: ' + (err && err.message ? err.message : err));
  }

  try {
    const tufts = babylonGrassLayout({
      mulberry, seed: 20261029, edge: 35, backZ: -80, zFrom: -150, zTo: 280, reach: 118,
      palaceBox: PAL_BOX, colliders: []
    });
    const files = ['grass_tuft_a.glb', 'grass_tuft_b.glb'];
    const lods = [];
    for (const file of files) {
      const asset = await registry.retain(ASSET + file, 'container');
      const proto = asset.resource.instantiateRenderEntity();
      parent.addChild(proto);
      const list = parts(proto);
      proto.destroy();
      list.sort((a, b) => triCount(b) - triCount(a));
      lods.push(list);
    }
    const CS = 32;
    const groups = new Map();
    for (const t of tufts) {
      const k = Math.floor(t.x / CS) + ',' + Math.floor(t.z / CS);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    window.__tuftChunks = groups.size;
    const RANK = [1.01, 0.72, 0.42];
    const GROW = [1, 1.08, 1.22];
    let made = 0;
    for (const list of groups.values()) {
      made += 1;
      if (made % 12 === 0) {
        window.__stage = 'tufts ' + made + '/' + groups.size;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const lodEntities = [0, 1, 2].map((li) => {
        const specs = [];
        const matrices = [];
        for (let v = 0; v < 2; v += 1) {
          const use = list.filter((t) => t.v === v && t.rank < RANK[li]);
          if (!use.length || !lods[v][li]) continue;
          const start = matrices.length;
          use.forEach((t) => {
            const s = t.sw * GROW[li];
            matrices.push(yxzScale(t.x, -0.012, t.z, t.tx, t.yaw, t.tz, s, s * t.sh, s));
          });
          specs.push({ spec: lods[v][li], from: start, to: matrices.length });
        }
        if (!matrices.length) return null;
        return instanceRange(device, parent, 'grass-tuft', specs, matrices);
      });
      const cx = (Math.floor(list[0].x / CS) + 0.5) * CS;
      const cz = (Math.floor(list[0].z / CS) + 0.5) * CS;
      chunks.push({ x: cx, z: cz, r: CS * 0.75, max: 62, optional: false, lodD: [4, 9], minLod: 1, lods: lodEntities });
    }
    window.__tufts = tufts.length;
  } catch (err) {
    gaps.push('خصل العشب لم تُركَّب: ' + (err && err.message ? err.message : err));
  }
  window.__groveOld = oldTrees.length;
  window.__vegReady = true;
  return { old: oldTrees.length, gaps };
}

function instanceRange(device, parent, name, specs, matrices) {
  const root = new Entity(name);
  root.enabled = false;
  parent.addChild(root);
  const format = new VertexFormat(device, [
    { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR13, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR15, components: 4, type: pc.TYPE_FLOAT32 }
  ]);
  for (const item of specs) {
    const count = item.to - item.from;
    const vb = new VertexBuffer(device, format, count, { usage: pc.BUFFER_STATIC });
    const data = new Float32Array(vb.lock());
    for (let i = 0; i < count; i += 1) data.set(matrices[item.from + i], i * 16);
    vb.unlock();
    const mi = new MeshInstance(item.spec.mesh, item.spec.material);
    mi.setInstancing(vb, false);
    const ent = new Entity('tuft');
    ent.addComponent('render', { meshInstances: [mi], castShadows: false });
    root.addChild(ent);
  }
  return root;
}
