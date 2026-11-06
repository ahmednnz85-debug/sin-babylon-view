import * as pc from '../vendor/playcanvas.mjs';
import layout from './market-layout.js';
import { boundsOf as worldBounds, yaw as yawOf } from './fit.js';

const { Entity, StandardMaterial, Color, Vec2 } = pc;
const ASSET = '/sin-babylon-view/original/assets/';
const EMBED = '/sin-babylon-view/play/embedded/';
const GATE_CLEAR = 10;
const optional = [];

const FOOT = {
  stall: [
    [0.3019, 0.2841],
    [0.3123, 0.2879],
    [0.2397, 0.255],
    [0.2655, 0.2486],
    [0.3714, 0.3378],
    [0.3396, 0.2786]
  ],
  kiosk: [[1.0027, 0.731]]
};
const circles = [];

export function addCityCircle(x, z, r) {
  circles.push([x, z, r]);
}

export function resetCityCircles() {
  circles.length = 0;
}

export function cityCircles() {
  return circles;
}

function marketOpenings() {
  const gaps = [];
  for (const side of [-1, 1]) {
    const row = layout.places
      .filter((p) => (p.kind === 'stall' || p.kind === 'kiosk') && Math.sign(p.x) === side)
      .sort((a, b) => a.z - b.z);
    for (let i = 0; i < row.length - 1; i += 1) {
      const a = row[i];
      const b = row[i + 1];
      const size = FOOT[a.kind][a.part];
      const next = FOOT[b.kind][b.part];
      if (!size || !next) continue;
      const w = size[0] * a.sc;
      const d = size[1] * a.sc;
      const z0 = a.z + w / 2;
      const z1 = b.z - (next[0] * b.sc) / 2;
      if (z1 - z0 <= 0.18) continue;
      if (z0 < GATE_CLEAR && z1 > -GATE_CLEAR) continue;
      gaps.push({
        side,
        z0,
        z1,
        nearX: a.x - side * (d / 2),
        farX: a.x + side * (d / 2)
      });
    }
  }
  return gaps;
}

function keepPart(entity, index) {
  const renders = entity.findComponents('render') || [];
  renders.forEach((render, i) => { render.enabled = i === index; });
  return renders.length;
}

function yaw(entity, radians) {
  yawOf(entity, radians);
}

export function setCityQuality(high) {
  for (const entity of optional) entity.enabled = high;
}

export async function buildCity(registry, parent) {
  const mark = (s) => { window.__stage = s; };
  const root = new Entity('city');
  parent.addChild(root);
  mark('gate');
  const gateS = 16 / 0.502;
  const gate = (await registry.retain(EMBED + 'gate.glb', 'container')).resource.instantiateRenderEntity();
  gate.setLocalScale(gateS, gateS, gateS);
  yaw(gate, -Math.PI / 2);
  gate.setPosition(-0.0025 * gateS, 0.2512 * gateS, 0);
  root.addChild(gate);

  mark('lamassu');
  const lamAsset = await registry.retain(EMBED + 'lam.glb', 'container');
  for (const spot of [[-5.4, -17], [5.4, -17], [-7.6, 121], [7.6, 121]]) {
    const model = lamAsset.resource.instantiateRenderEntity();
    const sc = 5.1;
    model.setLocalScale(sc, sc, sc);
    model.setLocalPosition(0, 0.487 * sc, 0);
    const g = new Entity('lam');
    g.addChild(model);
    yaw(g, Math.PI);
    g.setPosition(spot[0], 0, spot[1]);
    root.addChild(g);
    circles.push([spot[0], spot[1] - 1.6, 1.1], [spot[0], spot[1] + 1.6, 1.1]);
  }

  mark('canals');
  await buildCanals(registry, root);

  mark('market');
  const files = {
    stall: await registry.retain(ASSET + 'stalls.glb', 'container'),
    house: await registry.retain(ASSET + 'houses.glb', 'container'),
    kiosk: await registry.retain(ASSET + 'kiosk.glb', 'container')
  };
  const marketRows = { '-1': [], '1': [] };
  for (const place of layout.places) {
    const model = files[place.kind].resource.instantiateRenderEntity();
    keepPart(model, place.part);
    const g = new Entity(place.kind);
    g.addChild(model);
    g.setLocalScale(place.sc, place.sc, place.sc);
    yaw(g, place.ry);
    g.setPosition(place.x, 0, place.z);
    if (place.optional) {
      g.enabled = true;
      optional.push(g);
    }
    root.addChild(g);
    if (place.kind === 'stall' || place.kind === 'kiosk') {
      marketRows[place.x < 0 ? '-1' : '1'].push(g);
    }
    if (!place.optional && (place.kind === 'stall' || place.kind === 'kiosk' || place.kind === 'house')) {
      const foot = FOOT[place.kind] && FOOT[place.kind][place.part];
      let w = 0;
      let d = 0;
      if (foot) {
        w = foot[0] * place.sc;
        d = foot[1] * place.sc;
      } else {
        try {
          const b = worldBounds(g);
          if (b && b.sx > 0.2 && b.sz > 0.2) { w = b.sz; d = b.sx; }
        } catch (err) { /* measured house bounds are unavailable */ }
      }
      if (!(w > 0.2 && d > 0.2)) continue;
      const rc = d * 0.46;
      const n = Math.max(1, Math.ceil(w / Math.max(0.2, rc * 1.5)));
      const z0 = place.z - w / 2;
      for (let i = 0; i < n; i += 1) circles.push([place.x, z0 + (i + 0.5) * (w / n), rc]);
    }
  }

  mark('walls');
  const wallAsset = await registry.retain(ASSET + 'babylonian_wall.glb', 'container');
  for (const wall of layout.walls) {
    const model = wallAsset.resource.instantiateRenderEntity();
    model.setLocalScale(wall.sx, wall.sy, wall.sz);
    model.setLocalPosition(0, wall.y, 0);
    const g = new Entity('wall');
    g.addChild(model);
    yaw(g, Math.PI / 2);
    g.setPosition(wall.x, 0, wall.z);
    root.addChild(g);
  }
  const wallStart = layout.marketEndZ + 0.4;
  const wallEnd = (186 - 0.4586 * 56 - 0.1) - 1;
  for (const side of [-1, 1]) {
    for (let z = wallStart; z < wallEnd; z += 1.05) circles.push([side * 10.4, z, 1.05]);
    circles.push([side * 10.4, wallEnd, 1.05]);
  }
  mark('pots');
  await buildPots(registry, root, marketRows);
  mark('city-ready');
  return root;
}

function repeat(tex) {
  tex.addressU = pc.ADDRESS_REPEAT;
  tex.addressV = pc.ADDRESS_REPEAT;
  return tex;
}

async function buildCanals(registry, root) {
  const color = repeat((await registry.retain(ASSET + 'canal_color.jpg', 'texture')).resource);
  const normal = repeat((await registry.retain(ASSET + 'canal_normal.jpg', 'texture')).resource);
  const rough = repeat((await registry.retain(ASSET + 'canal_rough.jpg', 'texture')).resource);
  const water = (await registry.retain(ASSET + 'canal_water.jpg', 'texture')).resource;
  water.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  water.addressV = pc.ADDRESS_MIRRORED_REPEAT;
  const brick = new StandardMaterial();
  brick.diffuseMap = color;
  brick.normalMap = normal;
  brick.roughnessMap = rough;
  brick.diffuseMapTiling = new Vec2(69 / 1.4, 1);
  brick.roughness = 1;
  brick.metalness = 0;
  brick.useMetalness = true;
  brick.update();
  const waterMat = new StandardMaterial();
  waterMat.diffuseMap = water;
  waterMat.diffuseMapTiling = new Vec2(1, 69 / 4.4);
  waterMat.opacity = 0.94;
  waterMat.blendType = pc.BLEND_NORMAL;
  waterMat.roughness = 0.12;
  waterMat.metalness = 0;
  waterMat.useMetalness = true;
  waterMat.update();
  const bed = new StandardMaterial();
  bed.diffuse = new Color(0x1d / 255, 0x2a / 255, 0x24 / 255);
  bed.roughness = 1;
  bed.useMetalness = true;
  bed.update();
  const CANAL_X = 7.4;
  const CANAL_W = 1.2;
  const CANAL_Z0 = 7;
  const CL = 69;
  const CANAL_RIM = 0.3;
  const CANAL_H = 0.35;
  const box = (name, mat, sx, sy, sz, x, y, z) => {
    const e = new Entity(name);
    e.addComponent('render', { type: 'box', material: mat });
    e.setLocalScale(sx, sy, sz);
    e.setPosition(x, y, z);
    root.addChild(e);
  };
  const plane = (name, mat, w, d, x, y, z) => {
    const e = new Entity(name);
    e.addComponent('render', { type: 'plane', material: mat });
    e.setLocalScale(w, 1, d);
    e.setPosition(x, y, z);
    root.addChild(e);
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const zc = sz * (CANAL_Z0 + CL / 2);
      const xc = sx * CANAL_X;
      plane('canal-bed', bed, CANAL_W + 0.1, CL, xc, 0.05, zc);
      plane('canal-water', waterMat, CANAL_W, CL, xc, 0.14, zc);
      for (const e of [-1, 1]) box('canal-rim', brick, CANAL_RIM, CANAL_H, CL, xc + e * (CANAL_W / 2 + CANAL_RIM / 2), CANAL_H / 2, zc);
      for (const e of [-1, 1]) box('canal-cap', brick, CANAL_W + CANAL_RIM * 2, CANAL_H, CANAL_RIM, xc, CANAL_H / 2, zc + e * (CL / 2));
      for (const e of [-1, 1]) circles.push([xc, zc + e * (CL / 2), 1.25]);
      for (let z = CANAL_Z0; z <= CANAL_Z0 + CL; z += 1.3) circles.push([xc, sz * z, 0.95]);
    }
  }
}

async function buildPots(registry, root, marketRows) {
  const potAsset = await registry.retain(ASSET + 'market_pot.glb', 'container');
  const clusterAsset = await registry.retain(ASSET + 'market_pots.glb', 'container');
  const potProbe = potAsset.resource.instantiateRenderEntity();
  root.addChild(potProbe);
  const potBox = worldBounds(potProbe);
  potProbe.destroy();
  const clusterProbe = clusterAsset.resource.instantiateRenderEntity();
  root.addChild(clusterProbe);
  const clusterBox = worldBounds(clusterProbe);
  clusterProbe.destroy();
  const potHeights = [1.62, 1.86, 1.52, 1.78, 1.55, 1.82];
  let pots = 0;
  function placePot(x, z, h, rot, radius) {
    const ent = potAsset.resource.instantiateRenderEntity();
    const sc = h / Math.max(1e-4, potBox.sy);
    ent.setLocalScale(sc, sc, sc);
    ent.setLocalPosition(0, -potBox.minY * sc, 0);
    const g = new Entity('pot');
    g.addChild(ent);
    yaw(g, rot);
    g.setPosition(x, 0, z);
    root.addChild(g);
    circles.push([x, z, radius]);
    pots += 1;
  }
  function potLine(x0, z0, x1, z1, step) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const rot = Math.abs((Math.round(x + z) * 3) % 4) * Math.PI / 2;
      placePot(x, z, 1.72, rot, 0.74);
    }
  }
  potLine(-20, -80.6, 20, -80.6, 1.15);
  for (const s of [-1, 1]) {
    potLine(s * 5.6, -80.6, s * 5.6, -75.2, 1.15);
    potLine(s * 5.8, -76.5, s * 20, -76.5, 1.15);
    potLine(s * 20, -80.6, s * 20, -74.2, 1.15);
    potLine(s * 8.2, -78.4, s * 16.5, -78.4, 1.15);
    potLine(s * 9.3, -9.2, s * 18, -9.2, 1.15);
    potLine(s * 9.3, 9.2, s * 18, 9.2, 1.15);
    potLine(s * 8.6, 76.2, s * 14, 76.2, 1.15);
  }
  let gapIndex = 0;
  for (const gap of marketOpenings()) {
    const { side, z0, z1, nearX, farX } = gap;
    const depth = Math.abs(farX - nearX);
    const count = Math.max(4, Math.ceil(depth / 0.68));
    const gapWidth = z1 - z0;
    const lanes = gapWidth > 0.75 ? [-gapWidth * 0.24, gapWidth * 0.24] : [0];
    lanes.forEach((offset, laneIndex) => {
      const z = (z0 + z1) / 2 + offset;
      for (let k = 0; k < count; k += 1) {
        const x = nearX + (farX - nearX) * ((k + 0.5) / count);
        const h = potHeights[(gapIndex + k + laneIndex) % potHeights.length];
        placePot(x, z, h, ((gapIndex + k + laneIndex) % 2) * Math.PI / 2, 0.68);
      }
    });
    const out = side > 0 ? 1 : -1;
    const mid = (z0 + z1) / 2;
    placePot(farX + out * 0.75, mid, 1.72, 0, 0.74);
    placePot(farX + out * 0.75, (z0 + mid) * 0.5, 1.72, Math.PI / 2, 0.74);
    gapIndex += 1;
  }
  function addCluster(x, z, h) {
    const ent = clusterAsset.resource.instantiateRenderEntity();
    const sc = h / Math.max(1e-4, clusterBox.sy);
    ent.setLocalScale(sc, sc, sc);
    ent.setLocalPosition(0, -clusterBox.minY * sc, 0);
    const g = new Entity('pot-cluster');
    g.addChild(ent);
    yaw(g, Math.PI / 2);
    g.setPosition(x, 0, z);
    root.addChild(g);
    circles.push([x, z, Math.hypot(clusterBox.sx, clusterBox.sz) * sc * 0.55 + 0.2]);
  }
  const start = layout.marketEndZ + 0.4;
  const gateZ = start + 0.25;
  const end = (186 - 0.4586 * 56 - 0.1) - 1;
  const wallX = 10.4;
  for (const side of [-1, 1]) {
    addCluster(side * 7.25, gateZ, 1.1);
    addCluster(side * 9.3, gateZ, 1.1);
    for (const dx of [0.2, 1.7, 3.2]) {
      for (const z of [end - 1.1, end + 0.35, end + 1.8]) addCluster(side * (wallX + dx), z, 1.6);
    }
  }
  root._potCount = pots;
}
