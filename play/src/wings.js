import * as pc from '../vendor/playcanvas.mjs';
import { sinUrl } from './paths.js';
import { solveLayout } from './layout.js';
import { buildWingSolids } from './clipperWalls.js';
import { dressCorridorSolids } from './corridorDress.js';
import { boundsOf } from './fit.js';
import { buildTorchFlames, chandelierFlameItems, corridorFlameItems } from './torchFire.js';

const { Entity, StandardMaterial, Color, Vec2, Mesh, MeshInstance, PRIMITIVE_TRIANGLES } = pc;
const OPT = 'ارضيات وسقوف/optimized/';
const K3 = '/sin-babylon-view/play/embedded/k3/';

const FLOOR = { Kings: [0x80, 0x70, 0x5a], Temple: [0x65, 0x75, 0x6e], Library: [0x75, 0x6b, 0x7e], Shared: [0x74, 0x66, 0x53] };
const WALL = [0x8d, 0x7a, 0x63];

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
  const asset = await retain(registry, urls, rel.startsWith('/') ? rel : sinUrl(rel), 'container');
  return asset.resource.instantiateRenderEntity({ castShadows: false });
}

async function texture(registry, urls, rel, repeat) {
  const asset = await retain(registry, urls, sinUrl(rel), 'texture');
  const tex = asset.resource;
  const mode = repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE;
  tex.addressU = mode;
  tex.addressV = mode;
  return tex;
}

function colorMat(rgb, rough) {
  const m = new StandardMaterial();
  m.diffuse = new Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  m.roughness = rough;
  m.metalness = 0.04;
  m.useMetalness = true;
  m.cull = pc.CULLFACE_NONE;
  m._sinOwned = true;
  m.update();
  return m;
}

function texMat(tex, rough, metal) {
  const m = new StandardMaterial();
  m.diffuseMap = tex;
  m.roughness = rough;
  m.metalness = metal;
  m.useMetalness = true;
  m.cull = pc.CULLFACE_NONE;
  m._sinOwned = true;
  m.update();
  return m;
}

function plane(parent, name, material, w, d, x, y, z) {
  const e = new Entity(name);
  e.addComponent('render', { type: 'plane', material });
  e.setLocalScale(Math.max(0.05, w), 1, Math.max(0.05, d));
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

function triMesh(name, material, positions) {
  if (!positions || positions.length < 9) return null;
  const app = pc.Application.getApplication();
  if (!app) return null;
  const nrm = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3] - ax;
    const by = positions[i + 4] - ay;
    const bz = positions[i + 5] - az;
    const cx = positions[i + 6] - ax;
    const cy = positions[i + 7] - ay;
    const cz = positions[i + 8] - az;
    let nx = by * cz - bz * cy;
    let ny = bz * cx - bx * cz;
    let nz = bx * cy - by * cx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k += 1) {
      nrm[i + k * 3] = nx;
      nrm[i + k * 3 + 1] = ny;
      nrm[i + k * 3 + 2] = nz;
    }
  }
  const mesh = new Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setNormals(nrm);
  mesh.update(PRIMITIVE_TRIANGLES);
  const ent = new Entity(name);
  const mi = new MeshInstance(mesh, material, ent);
  ent.addComponent('render', { meshInstances: [mi] });
  ent._sinMesh = mesh;
  return ent;
}

function uvMesh(name, material, positions, uvs) {
  if (!positions || positions.length < 9) return null;
  const app = pc.Application.getApplication();
  if (!app) return null;
  const nrm = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3] - ax;
    const by = positions[i + 4] - ay;
    const bz = positions[i + 5] - az;
    const cx = positions[i + 6] - ax;
    const cy = positions[i + 7] - ay;
    const cz = positions[i + 8] - az;
    let nx = by * cz - bz * cy;
    let ny = bz * cx - bx * cz;
    let nz = bx * cy - by * cx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k += 1) {
      nrm[i + k * 3] = nx;
      nrm[i + k * 3 + 1] = ny;
      nrm[i + k * 3 + 2] = nz;
    }
  }
  const mesh = new Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setNormals(nrm);
  if (uvs && uvs.length === (positions.length / 3) * 2) mesh.setUvs(0, uvs);
  mesh.update(PRIMITIVE_TRIANGLES);
  const ent = new Entity(name);
  const mi = new MeshInstance(mesh, material, ent);
  ent.addComponent('render', { meshInstances: [mi] });
  ent._sinMesh = mesh;
  return ent;
}

function wallBoxes(solids, doors) {
  const GRID = 0.5;
  const MAX_H = 12.25;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const s of solids || []) {
    for (const p of s.outer || []) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
  }
  if (!Number.isFinite(minX)) return [];
  const nx = Math.ceil((maxX - minX) / GRID);
  const nz = Math.ceil((maxZ - minZ) / GRID);
  const occupied = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const x = minX + (ix + 0.5) * GRID;
      const z = minZ + (iz + 0.5) * GRID;
      if (pointInSolids(x, z, solids)) occupied[iz * nx + ix] = 1;
    }
  }
  const rects = [];
  for (let iz = 0; iz < nz; iz += 1) {
    let ix = 0;
    while (ix < nx) {
      if (!occupied[iz * nx + ix]) { ix += 1; continue; }
      const start = ix;
      while (ix < nx && occupied[iz * nx + ix]) ix += 1;
      rects.push({ ix0: start, ix1: ix - 1, iz0: iz, iz1: iz });
    }
  }
  const merged = [];
  while (rects.length) {
    const r = rects.shift();
    let extended = true;
    while (extended) {
      extended = false;
      for (let q = 0; q < rects.length; q += 1) {
        const box = rects[q];
        if (box.iz0 === r.iz1 + 1 && box.ix0 === r.ix0 && box.ix1 === r.ix1) {
          r.iz1 = box.iz1;
          rects.splice(q, 1);
          extended = true;
          break;
        }
      }
    }
    merged.push(r);
  }
  const boxes = merged.map((r) => ({
    minx: minX + r.ix0 * GRID - 0.25,
    maxx: minX + (r.ix1 + 1) * GRID + 0.25,
    miny: 0,
    maxy: MAX_H,
    minz: minZ + r.iz0 * GRID - 0.25,
    maxz: minZ + (r.iz1 + 1) * GRID + 0.25
  }));
  for (const d of doors || []) {
    if (d.kind === 'arch') continue;
    if (d.axis === 'x') {
      boxes.push({ minx: d.x - 0.5, maxx: d.x + 0.5, miny: d.height, maxy: MAX_H, minz: d.z - d.width * 0.5, maxz: d.z + d.width * 0.5 });
    } else {
      boxes.push({ minx: d.x - d.width * 0.5, maxx: d.x + d.width * 0.5, miny: d.height, maxy: MAX_H, minz: d.z - 0.5, maxz: d.z + 0.5 });
    }
  }
  return boxes;
}

function pointInPolyRoom(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function pointInPoly(x, z, poly) {
  return pointInPolyRoom(x, z, poly);
}

function pointInSolids(x, z, solids) {
  for (const s of solids || []) {
    if (!s || !pointInPoly(x, z, s.outer)) continue;
    let hole = false;
    for (const h of s.holes || []) if (pointInPoly(x, z, h)) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

function addSourceBoxes(root, layout, hall, wallMat) {
  const dark = colorMat([0x07, 0x07, 0x06], 1);
  dark.emissive = new Color(0x01 / 255, 0x01 / 255, 0x01 / 255);
  dark.emissiveIntensity = 0.1;
  dark.update();
  const seal = colorMat([0xa5, 0x8a, 0x61], 0.72);
  seal.metalness = 0.18;
  seal.update();
  const K5 = layout.rooms.find((r) => r.id === 'K5');
  const kg = root.findByName('K5');
  if (K5 && kg) {
    const bx = K5.bbox.cx;
    const bz = K5.bbox.z1 - 1.5;
    box(kg, 'K5-balcony', wallMat, 14, 1.2, 3, bx - 2, 0.6, bz);
    for (let i = 0; i < 6; i += 1) {
      box(kg, 'K5-balcony-ramp', wallMat, 14, (i + 1) * 0.2, 0.5, bx - 2, (i + 1) * 0.1, K5.bbox.z1 - 5.75 + i * 0.5);
    }
    box(kg, 'K5-balustrade', wallMat, 14, 0.16, 0.18, bx - 2, 2.05, bz - 1.42);
    for (let x = bx - 8.5; x <= bx + 4.5 + 1e-4; x += 1.3) {
      box(kg, 'K5-balustrade', wallMat, 0.12, 0.9, 0.12, x, 1.65, bz - 1.42);
    }
    box(kg, 'K5-closed-dark-shaft', dark, 3, 0.08, 5, K5.bbox.x1 - 2, 0.06, K5.bbox.z1 - 4);
    kg._k5Rail = { minx: bx - 9, maxx: bx + 5, miny: 1.1, maxy: 2.2, minz: bz - 1.55, maxz: bz - 1.28 };
  }
  const T4 = layout.rooms.find((r) => r.id === 'T4');
  const tg = root.findByName('T4');
  if (T4 && tg) {
    for (let i = 0; i < 5; i += 1) {
      box(tg, 'T4-five-steps-platform', wallMat, 1.24, (i + 1) * 0.3, 10, T4.bbox.x1 - 13.8 + i * 1.2, (i + 1) * 0.15, T4.bbox.cz);
    }
    box(tg, 'T4-five-steps-platform', wallMat, 8, 1.5, 12, T4.bbox.x1 - 4, 0.75, T4.bbox.cz);
  }
  const sealed = (hall.passages || []).find((p) => p.id === 'passage-L0');
  if (!sealed) return;
  const sg = new Entity('L1-sealed-arch');
  root.addChild(sg);
  const x = sealed.position[0] - 0.16;
  const z = sealed.position[2];
  const w = sealed.width;
  const h = sealed.height;
  box(sg, 'L1-stone-seal', wallMat, 0.34, h, w, x, h * 0.5, z);
  const discScale = Math.min(2.1, w * 0.3);
  const disc = new Entity('L1-eight-discs');
  disc.addComponent('render', { type: 'cylinder', material: seal });
  disc.setEulerAngles(0, 0, 90);
  disc.setLocalScale(discScale, 0.12, discScale);
  disc.setLocalPosition(x + 0.22, h * 0.53, z);
  sg.addChild(disc);
  for (let i = 0; i < 7; i += 1) {
    const a = i * Math.PI * 2 / 7;
    const rad = Math.min(w * 0.34, h * 0.31);
    const d = new Entity('L1-eight-discs');
    d.addComponent('render', { type: 'cylinder', material: seal });
    d.setEulerAngles(0, 0, 90);
    d.setLocalScale(0.55, 0.12, 0.55);
    d.setLocalPosition(x + 0.23, h * 0.53 + Math.sin(a) * rad, z + Math.cos(a) * rad);
    sg.addChild(d);
  }
}

function wallFace(parent, name, material, length, height, x, y, z, axis) {
  const e = new Entity(name);
  e.addComponent('render', { type: 'plane', material });
  if (axis === 'x') {
    e.setEulerAngles(90, 0, 90);
    e.setLocalScale(length, height, 1);
  } else {
    e.setEulerAngles(90, 0, 0);
    e.setLocalScale(length, height, 1);
  }
  e.setLocalPosition(x, y, z);
  parent.addChild(e);
}

function solidRoom(parent, region, floorMat, wallMat) {
  const b = region.bbox;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  plane(parent, region.id + '-floor', floorMat, w, d, b.cx, 0.02, b.cz);
  const doors = region._doors || [];
  const h = region.height;
  cutWalls(parent, region.id, wallMat, b, h, doors);
}

function cutWalls(parent, id, material, b, h, doors) {
  const y = h * 0.5;
  const inset = 0.06;
  spans(b.x0, b.x1, doors.filter((d) => d.axis === 'z' && Math.abs(d.z - b.z0) < 1.2).map((d) => d.x)).forEach((s) => {
    wallFace(parent, id + '-wall', material, s[1] - s[0], h, (s[0] + s[1]) / 2, y, b.z0 + inset, 'z');
  });
  spans(b.x0, b.x1, doors.filter((d) => d.axis === 'z' && Math.abs(d.z - b.z1) < 1.2).map((d) => d.x)).forEach((s) => {
    wallFace(parent, id + '-wall', material, s[1] - s[0], h, (s[0] + s[1]) / 2, y, b.z1 - inset, 'z');
  });
  spans(b.z0, b.z1, doors.filter((d) => d.axis === 'x' && Math.abs(d.x - b.x0) < 1.2).map((d) => d.z)).forEach((s) => {
    wallFace(parent, id + '-wall', material, s[1] - s[0], h, b.x0 + inset, y, (s[0] + s[1]) / 2, 'x');
  });
  spans(b.z0, b.z1, doors.filter((d) => d.axis === 'x' && Math.abs(d.x - b.x1) < 1.2).map((d) => d.z)).forEach((s) => {
    wallFace(parent, id + '-wall', material, s[1] - s[0], h, b.x1 - inset, y, (s[0] + s[1]) / 2, 'x');
  });
}

function spans(a, b, cuts) {
  const gaps = cuts.map((c) => [c - 2.25, c + 2.25]).sort((p, q) => p[0] - q[0]);
  const out = [];
  let cursor = a;
  for (const [g0, g1] of gaps) {
    const z0 = Math.max(a, g0);
    const z1 = Math.min(b, g1);
    if (z0 - cursor > 0.4) out.push([cursor, z0]);
    cursor = Math.max(cursor, z1);
  }
  if (b - cursor > 0.4) out.push([cursor, b]);
  return out;
}

function warmMat(tex, rough, tileX, tileY) {
  const m = texMat(tex, rough, 0.02);
  m.diffuseMapTiling = new Vec2(tileX, tileY);
  m.emissive = new Color(0x17 / 255, 0x12 / 255, 0x0e / 255);
  m.emissiveIntensity = 0.16;
  m.update();
  return m;
}

async function corridorSkins(registry, urls) {
  return {
    floor: await texture(registry, urls, 'assets/ارضية الممرات.JPG', true),
    wall: await texture(registry, urls, 'assets/جدار الممرات.jpg', true),
    ceiling: await texture(registry, urls, OPT + 'سقف-الممرات.webp', true),
    rug: await texture(registry, urls, OPT + 'السجاد.webp', true)
  };
}

function dressCorridor(parent, region, skins, withShell, rugOnly) {
  const b = region.bbox;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const h = region.height;
  if (!rugOnly) {
    const floor = warmMat(skins.floor, 0.86, w / 2, d / 2);
    const wall = warmMat(skins.wall, 0.9, Math.max(w, d) / 3, h / 3);
    if (withShell) solidRoom(parent, region, floor, wall);
    else {
      plane(parent, region.id + '-corridor-floor', floor, w, d, b.cx, 0.03, b.cz);
      cutWalls(parent, region.id, wall, b, region.height, region._doors || []);
    }
    const ceil = plane(parent, region.id + '-corridor-ceiling', warmMat(skins.ceiling, 0.92, w / 3, d / 3), w, d, b.cx, h - 0.012, b.cz);
    ceil.setEulerAngles(180, 0, 0);
  }
  const alongX = w >= d;
  const span = alongX ? d : w;
  if (span < 2.2) return;
  const width = Math.min(1.75, span * 0.42);
  const repeatLen = width * (2048 / 508);
  const rug = texMat(skins.rug, 0.72, 0.02);
  rug.emissive = new Color(0x2a / 255, 0x14 / 255, 0x0e / 255);
  rug.emissiveIntensity = 0.18;
  if (alongX) rug.diffuseMapTiling = new Vec2(1, (w + 0.4) / repeatLen);
  else rug.diffuseMapTiling = new Vec2(1, (d + 0.4) / repeatLen);
  skins.rug.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  skins.rug.addressV = pc.ADDRESS_REPEAT;
  rug.update();
  if (alongX) plane(parent, region.id + '-corridor-rug', rug, w + 0.4, width, b.cx, 0.045, b.cz);
  else plane(parent, region.id + '-corridor-rug', rug, width, d + 0.4, b.cx, 0.045, b.cz);
}

function sheetMat(tex, rough) {
  const m = texMat(tex, rough, 0.02);
  m.diffuseMapTiling = new Vec2(1, 1);
  m.emissive = new Color(0x17 / 255, 0x12 / 255, 0x0e / 255);
  m.emissiveIntensity = 0.16;
  m.update();
  return m;
}

async function placeCorridorProps(registry, urls, root, connectors) {
  const plantSrc = grounded(await model(registry, urls, OPT + 'شتله.glb'));
  const plantBox = boundsOf(plantSrc);
  const wood = grounded(await model(registry, urls, 'assets/مشعل خشب.glb'));
  const black = grounded(await model(registry, urls, 'assets/مشعل اسود.glb'));
  const woodBox = boundsOf(wood);
  const blackBox = boundsOf(black);
  let torchN = 0;
  for (const region of connectors) {
    if (region.kind !== 'corridor' && region.kind !== 'gallery') continue;
    const host = root.findByName(region.id);
    if (!host) continue;
    const b = region.bbox;
    const dx = b.x1 - b.x0;
    const dz = b.z1 - b.z0;
    const alongX = dx >= dz;
    const width = Math.min(dx, dz);
    const length = Math.max(dx, dz);
    const off = Math.min(0.7, Math.max(0.45, width * 0.09));
    const spacing = Math.min(6, Math.max(3.5, width * 0.85));
    const margin = Math.max(1, off + 0.6);
    const doors = region._doors || [];
    const blocked = (x, z, pad) => doors.some((d) => d.kind !== 'arch' && Math.hypot(d.x - x, d.z - z) < d.width * 0.5 + pad);
    const target = Math.min(1.15, Math.max(0.75, width * 0.18));
    const pk = target / Math.max(1e-4, plantBox.sy);
    const usable = length - margin * 2;
    if (usable >= -1) {
      const n = Math.floor(Math.max(0, usable) / spacing) + 1;
      const used = (n - 1) * spacing;
      for (let i = 0; i < n; i += 1) {
        const s = (alongX ? b.x0 : b.z0) + margin + (usable - used) / 2 + i * spacing;
        for (const side of [-1, 1]) {
          const x = alongX ? s : (side < 0 ? b.x0 + off : b.x1 - off);
          const z = alongX ? (side < 0 ? b.z0 + off : b.z1 - off) : s;
          if (blocked(x, z, 0.4)) continue;
          const m = plantSrc.clone();
          m.setLocalScale(pk, pk, pk);
          m.setEulerAngles(0, side < 0 ? 0 : 180, 0);
          m.setLocalPosition(x, 0, z);
          m.name = region.id + '-plant';
          host.addChild(m);
        }
      }
    }
    const tMargin = 1.3;
    const tSpace = 7;
    const tUsable = length - tMargin * 2;
    if (tUsable < 0) continue;
    const tn = Math.floor(tUsable / tSpace) + 1;
    const tUsed = (tn - 1) * tSpace;
    for (let i = 0; i < tn; i += 1) {
      const s = (alongX ? b.x0 : b.z0) + tMargin + (tUsable - tUsed) / 2 + i * tSpace;
      for (const side of [-1, 1]) {
        const x = alongX ? s : (side < 0 ? b.x0 + 0.02 : b.x1 - 0.02);
        const z = alongX ? (side < 0 ? b.z0 + 0.02 : b.z1 - 0.02) : s;
        if (blocked(x, z, 0.9)) continue;
        const src = torchN % 2 === 0 ? wood : black;
        const box = torchN % 2 === 0 ? woodBox : blackBox;
        const k = 1.05 / Math.max(1e-4, box.sy);
        const m = src.clone();
        m.setLocalScale(k, k, k);
        const face = alongX ? (side < 0 ? 0 : 180) : (side < 0 ? 90 : -90);
        m.setEulerAngles(0, face, 0);
        m.setLocalPosition(x, 1.75, z);
        m.name = region.id + '-torch';
        host.addChild(m);
        torchN += 1;
      }
    }
  }
  plantSrc.destroy();
  wood.destroy();
  black.destroy();
}

function yawOf(dx, dz) {
  return Math.atan2(dx, dz) * 180 / Math.PI;
}

function qrot(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return [
    x + q.w * tx + (q.y * tz - q.z * ty),
    y + q.w * ty + (q.z * tx - q.x * tz),
    z + q.w * tz + (q.x * ty - q.y * tx)
  ];
}

function torchMeasure(ent) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let plateMinZ = Infinity;
  let plate = false;
  const stack = [ent];
  while (stack.length) {
    const node = stack.pop();
    const name = node.name || '';
    if (/flame/i.test(name)) continue;
    for (const child of node.children || []) stack.push(child);
    if (!node.render || !node.render.meshInstances) continue;
    let nminX = Infinity;
    let nminY = Infinity;
    let nminZ = Infinity;
    let nmaxX = -Infinity;
    let nmaxY = -Infinity;
    let nmaxZ = -Infinity;
    let any = false;
    for (const mi of node.render.meshInstances) {
      const mesh = mi.mesh;
      const count = mesh && mesh.vertexBuffer ? mesh.vertexBuffer.numVertices : 0;
      if (!count) continue;
      const src = new Float32Array(count * 3);
      mesh.getPositions(src);
      for (let i = 0; i < src.length; i += 3) {
        let x = src[i];
        let y = src[i + 1];
        let z = src[i + 2];
        let cursor = node;
        while (cursor && cursor !== ent.parent) {
          const s = cursor.getLocalScale();
          x *= s.x;
          y *= s.y;
          z *= s.z;
          const turned = qrot(cursor.getLocalRotation(), x, y, z);
          const p = cursor.getLocalPosition();
          x = turned[0] + p.x;
          y = turned[1] + p.y;
          z = turned[2] + p.z;
          cursor = cursor.parent;
        }
        any = true;
        nminX = Math.min(nminX, x);
        nminY = Math.min(nminY, y);
        nminZ = Math.min(nminZ, z);
        nmaxX = Math.max(nmaxX, x);
        nmaxY = Math.max(nmaxY, y);
        nmaxZ = Math.max(nmaxZ, z);
      }
    }
    if (!any) continue;
    minX = Math.min(minX, nminX);
    minY = Math.min(minY, nminY);
    minZ = Math.min(minZ, nminZ);
    maxX = Math.max(maxX, nmaxX);
    maxY = Math.max(maxY, nmaxY);
    maxZ = Math.max(maxZ, nmaxZ);
    if (/holder/i.test(name)) {
      plate = true;
      plateMinZ = Math.min(plateMinZ, nminZ);
    }
  }
  const h = Math.max(1e-4, maxY - minY);
  return { h, minY, cx: (minX + maxX) / 2, contactZ: plate ? plateMinZ : minZ, k: 1.05 / h };
}

function applyTorch(fit, slot, lx, ly, lz) {
  const yaw = Math.atan2(slot.dx, slot.dz);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const turn = (x, z) => [x * cos + z * sin, -x * sin + z * cos];
  const [rx, rz] = turn(lx * fit.k, lz * fit.k);
  const out = fit.contactZ * fit.k;
  const [ox, oz] = turn(-fit.cx * fit.k, -out);
  return [
    slot.x + ox - slot.dx * 0.01 + rx,
    1.75 - fit.minY * fit.k + ly * fit.k,
    slot.z + oz - slot.dz * 0.01 + rz
  ];
}

async function placeClipperProps(registry, urls, root, dress) {
  const plantSrc = grounded(await model(registry, urls, OPT + 'شتله.glb'));
  const plantBox = boundsOf(plantSrc);
  const wood = await model(registry, urls, 'assets/مشعل خشب.glb');
  const black = await model(registry, urls, 'assets/مشعل اسود.glb');
  const fits = [torchMeasure(wood), torchMeasure(black)];
  const boxes = [];
  const flames = [];
  for (const slot of dress.plants) {
    const host = root.findByName(slot.region);
    if (!host) continue;
    const target = Math.min(1.15, Math.max(0.75, slot.width * 0.18));
    const pk = target / Math.max(1e-4, plantBox.sy);
    const m = plantSrc.clone();
    m.setLocalScale(pk, pk, pk);
    m.setEulerAngles(0, slot.rot * 180 / Math.PI, 0);
    m.setLocalPosition(slot.x, 0, slot.z);
    m.name = slot.region + '-plant';
    host.addChild(m);
    boxes.push({ minx: slot.x - 0.32, maxx: slot.x + 0.32, miny: 0, maxy: 1.2, minz: slot.z - 0.32, maxz: slot.z + 0.32 });
  }
  for (const slot of dress.torches) {
    const host = root.findByName(slot.region);
    if (!host) continue;
    const fit = fits[slot.type] || fits[0];
    const src = slot.type === 0 ? wood : black;
    const m = src.clone();
    const [px, py, pz] = applyTorch(fit, slot, 0, 0, 0);
    m.setLocalScale(fit.k, fit.k, fit.k);
    m.setEulerAngles(0, yawOf(slot.dx, slot.dz), 0);
    m.setLocalPosition(px, py, pz);
    m.name = slot.region + '-torch';
    host.addChild(m);
    const flame = applyTorch(fit, slot, fit.cx, fit.minY + fit.h * 0.70, fit.contactZ + fit.h * 0.25);
    flames.push({ fx: flame[0], fy: flame[1], fz: flame[2], dx: slot.dx, dz: slot.dz, seed: slot.seed });
  }
  if (flames.length) buildTorchFlames(root, corridorFlameItems(flames), 'corridor');
  plantSrc.destroy();
  wood.destroy();
  black.destroy();
  return boxes;
}

function grounded(entity) {
  const host = new Entity('ground');
  host.addChild(entity);
  const b = boundsOf(host);
  entity.setLocalPosition(-b.cx, -b.minY, -b.cz);
  return host;
}

function addWingColumns(root, layout) {
  const boxes = [];
  const mat = colorMat([0xa1, 0x8b, 0x6d], 0.9);
  mat.emissive = new Color(0x21 / 255, 0x17 / 255, 0x0f / 255);
  mat.emissiveIntensity = 0.16;
  mat.update();
  const spec = [
    ['T1', 3, 2.3, 2.2, 0.48],
    ['T3', 6, 5.0, 3.0, 0.88],
    ['L1', 4, 4.0, 3.4, 0.60]
  ];
  for (const [id, count, inset, zInset, radius] of spec) {
    const region = layout.rooms.find((r) => r.id === id);
    const host = root.findByName(id);
    if (!region || !host || count < 1) continue;
    const b = region.bbox;
    const scaleY = Math.max(0.2, region.height - 0.15);
    const scaleXZ = radius * 2;
    for (let i = 0; i < count; i += 1) {
      const z = b.z0 + zInset + (b.z1 - b.z0 - 2 * zInset) * (count === 1 ? 0.5 : i / (count - 1));
      for (const x of [b.x0 + inset, b.x1 - inset]) {
        const g = new Entity(id + '-column');
        const base = new Entity('base');
        base.addComponent('render', { type: 'box', material: mat });
        base.setLocalScale(1.25, 0.12, 1.25);
        base.setLocalPosition(0, 0.06, 0);
        const shaft = shaftEntity(mat);
        const cap = new Entity('cap');
        cap.addComponent('render', { type: 'box', material: mat });
        cap.setLocalScale(1.12, 0.12, 1.12);
        cap.setLocalPosition(0, 0.94, 0);
        g.addChild(base);
        g.addChild(shaft);
        g.addChild(cap);
        g.setLocalScale(scaleXZ, scaleY, scaleXZ);
        g.setLocalPosition(x, 0, z);
        host.addChild(g);
        boxes.push({
          minx: x - radius * 0.75, maxx: x + radius * 0.75,
          miny: 0, maxy: region.height,
          minz: z - radius * 0.75, maxz: z + radius * 0.75
        });
      }
    }
  }
  return boxes;
}

function shaftEntity(material) {
  const app = pc.Application.getApplication();
  const ent = new Entity('shaft');
  if (!app) return ent;
  const N = 12;
  const y0 = 0.12;
  const y1 = 0.88;
  const r0 = 0.46;
  const r1 = 0.39;
  const positions = [];
  for (let i = 0; i < N; i += 1) {
    const a0 = i * Math.PI * 2 / N;
    const a1 = (i + 1) * Math.PI * 2 / N;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    positions.push(
      c0 * r0, y0, s0 * r0, c1 * r0, y0, s1 * r0, c1 * r1, y1, s1 * r1,
      c0 * r0, y0, s0 * r0, c1 * r1, y1, s1 * r1, c0 * r1, y1, s0 * r1
    );
  }
  const meshEnt = triMesh('shaft-mesh', material, positions);
  if (meshEnt) ent.addChild(meshEnt);
  return ent;
}

function addSealBrackets(root, fires) {
  const seal = colorMat([0xa5, 0x8a, 0x61], 0.72);
  seal.metalness = 0.18;
  seal.update();
  const app = pc.Application.getApplication();
  if (!app || !fires.length) return;
  const N = 8;
  const y0 = -0.75;
  const y1 = 0.05;
  const r0 = 0.13;
  const r1 = 0.09;
  const positions = [];
  for (let i = 0; i < N; i += 1) {
    const a0 = i * Math.PI * 2 / N;
    const a1 = (i + 1) * Math.PI * 2 / N;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    positions.push(
      c0 * r0, y0, s0 * r0, c1 * r0, y0, s1 * r0, c1 * r1, y1, s1 * r1,
      c0 * r0, y0, s0 * r0, c1 * r1, y1, s1 * r1, c0 * r1, y1, s0 * r1
    );
  }
  const proto = triMesh('wings-wall-torches', seal, positions);
  if (!proto) return;
  const holder = new Entity('wings-wall-torches');
  root.addChild(holder);
  holder.addChild(proto);
  for (let i = 1; i < fires.length; i += 1) {
    const copy = proto.clone();
    copy.setLocalPosition(fires[i].x, fires[i].y, fires[i].z);
    holder.addChild(copy);
  }
  proto.setLocalPosition(fires[0].x, fires[0].y, fires[0].z);
}

function roomTorchFires(layout) {
  const fires = [];
  function wall(a, b0, fixed, alongX) {
    const len = b0 - a;
    const n = Math.max(1, Math.round(len / 10));
    for (let i = 0; i < n; i += 1) {
      const v = a + len * (i + 0.5) / n;
      fires.push({
        x: alongX ? v : fixed,
        y: 2.35,
        z: alongX ? fixed : v,
        seed: fires.length * 0.731 + 0.4
      });
    }
  }
  for (const r of layout.rooms) {
    if (r.kind === 'threshold' || r.id === 'K1' || r.id === 'K2' || r.id === 'K3') continue;
    const b = r.bbox;
    if (r.id === 'L4') {
      for (let i = 0; i < 8; i += 1) {
        const a = i * Math.PI / 4;
        fires.push({ x: b.cx + Math.cos(a) * 10.8, y: 2.5, z: b.cz + Math.sin(a) * 10.8, seed: 90 + i });
      }
      continue;
    }
    wall(b.x0 + 1, b.x1 - 1, b.z0 + 0.45, true);
    wall(b.x0 + 1, b.x1 - 1, b.z1 - 0.45, true);
    if (b.z1 - b.z0 > 8) {
      wall(b.z0 + 1, b.z1 - 1, b.x0 + 0.45, false);
      wall(b.z0 + 1, b.z1 - 1, b.x1 - 0.45, false);
    }
  }
  return fires;
}

function k1Perimeter(layout) {
  const r = layout.rooms.find((q) => q.id === 'K1');
  if (!r) return [];
  const wallT = 0.8;
  const h = r.height;
  const x0 = r.bbox.x0;
  const x1 = r.bbox.x1;
  const z0 = r.bbox.z0;
  const z1 = r.bbox.z1;
  const cz = r.bbox.cz;
  const westDoor = layout.doors.find((d) => d.id === 'K1-KC12');
  const eastDoor = layout.doors.find((d) => d.id === 'PalaceL3');
  const westGap = Math.max(3, westDoor ? westDoor.width * 0.5 : 3);
  const eastGap = Math.max(3, eastDoor ? eastDoor.width * 0.5 : 3);
  return [
    { minx: x0, miny: 0, minz: z0 - wallT, maxx: x1, maxy: h, maxz: z0 },
    { minx: x0, miny: 0, minz: z1, maxx: x1, maxy: h, maxz: z1 + wallT },
    { minx: x0 - wallT, miny: 0, minz: z0, maxx: x0, maxy: h, maxz: cz - westGap },
    { minx: x0 - wallT, miny: 0, minz: cz + westGap, maxx: x0, maxy: h, maxz: z1 },
    { minx: x1, miny: 0, minz: z0, maxx: x1 + wallT, maxy: h, maxz: cz - eastGap },
    { minx: x1, miny: 0, minz: cz + eastGap, maxx: x1 + wallT, maxy: h, maxz: z1 }
  ];
}

function measureK1(root) {
  const hall = root.parent;
  const origin = hall ? hall.getPosition() : { x: 0, y: 0, z: 0 };
  let floor = 0;
  const boxes = [];
  const selected = /^K1_(Column|VaseLarge|VaseSmall)_/;
  const floorName = /^K1_(Floor|Carpet)/;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    for (const child of node.children || []) stack.push(child);
    if (!node.render || !node.render.meshInstances) continue;
    const name = node.name || '';
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let any = false;
    for (const mi of node.render.meshInstances) {
      const c = mi.aabb && mi.aabb.center;
      const h = mi.aabb && mi.aabb.halfExtents;
      if (!c || !h) continue;
      any = true;
      minX = Math.min(minX, c.x - h.x);
      minY = Math.min(minY, c.y - h.y);
      minZ = Math.min(minZ, c.z - h.z);
      maxX = Math.max(maxX, c.x + h.x);
      maxY = Math.max(maxY, c.y + h.y);
      maxZ = Math.max(maxZ, c.z + h.z);
    }
    if (!any) continue;
    if (floorName.test(name)) floor = Math.max(floor, maxY - origin.y);
    if (!selected.test(name)) continue;
    const pad = name.indexOf('Column') >= 0 ? 0.1 : 0.08;
    boxes.push({
      minx: minX - origin.x - pad,
      maxx: maxX - origin.x + pad,
      miny: Math.max(0, minY - origin.y),
      maxy: maxY - origin.y,
      minz: minZ - origin.z - pad,
      maxz: maxZ - origin.z + pad
    });
  }
  return { floor: Math.max(0, floor), boxes };
}

function wingFloorAt(layout, polys, k1FloorY) {
  const K1 = layout.rooms.find((r) => r.id === 'K1');
  const T4 = layout.rooms.find((r) => r.id === 'T4');
  const K5 = layout.rooms.find((r) => r.id === 'K5');
  return (x, z) => {
    let inside = false;
    for (const poly of polys) {
      if (pointInPoly(x, z, poly)) { inside = true; break; }
    }
    if (!inside) return null;
    if (K1 && pointInPoly(x, z, K1.poly)) return k1FloorY;
    if (T4 && pointInPoly(x, z, T4.poly)) {
      const start = T4.bbox.x1 - 14.4;
      if (x >= T4.bbox.x1 - 8.4) return 1.5;
      if (x > start) return Math.min(1.5, ((x - start) / (T4.bbox.x1 - 8.4 - start)) * 1.5);
    }
    if (K5 && pointInPoly(x, z, K5.poly) && x < K5.bbox.x1 - 5) {
      const rampStart = K5.bbox.z1 - 6;
      const balcony = K5.bbox.z1 - 3;
      if (z >= balcony) return 1.2;
      if (z > rampStart) return ((z - rampStart) / 3) * 1.2;
    }
    return 0;
  };
}

export async function buildWings(registry, urls, hallRoot, hall) {
  const gaps = [
    'تصادم الأجنحة هو شبكة الصناديق بخطوة 0.5 كما في makeColliders، مع عتب الأبواب وأعمدة T1 وT3 وL1 ومحيط K1 ودرابزين K5.',
    'أرض القاعة: ORM غير مقسومة، وmeshopt غير مفكوك لأن المسار غير المضغوط هو نفس النموذج. لمعان الأغراض مكبوح عند 0.35 حتى لا تسود.',
    'K1 بقي المجسّم الواحد بلا إعادة قياس في هذه الجولة. حركة باب القصر لم تُصوَّر هنا.'
  ];
  let layout;
  try { layout = solveLayout(hall); }
  catch (err) {
    gaps.push('تعذّر مخطط الأجنحة: ' + (err && err.message ? err.message : err));
    return { root: null, gaps, rooms: [], meshes: [], boxes: [], polys: [], floorAt: () => null };
  }
  const root = new Entity('PalaceWings');
  hallRoot.addChild(root);
  const regions = layout.rooms.concat(layout.connectors);
  for (const region of regions) {
    region._doors = layout.doors.filter((d) => d.from === region.id || d.to === region.id);
  }
  const floorMat = {};
  const wallMat = colorMat(WALL, 0.9);
  wallMat.emissive = new Color(0x1c / 255, 0x15 / 255, 0x10 / 255);
  wallMat.emissiveIntensity = 0.16;
  wallMat.update();
  for (const key of Object.keys(FLOOR)) {
    floorMat[key] = colorMat(FLOOR[key], 0.94);
    floorMat[key].emissive = new Color(0x1d / 255, 0x17 / 255, 0x10 / 255);
    floorMat[key].emissiveIntensity = 0.12;
    floorMat[key].update();
  }
  let skins = null;
  try { skins = await corridorSkins(registry, urls); }
  catch (err) { gaps.push('خامات الممرات لم تُحمَّل: ' + (err && err.message ? err.message : err)); }

  let solids = null;
  try {
    solids = buildWingSolids(layout, hall);
    gaps.unshift('جدران Clipper: ' + solids.wallVerts + ' رأساً. الأرضيات والسقوف من نفس القص.');
  } catch (err) {
    gaps.push('تعذّر قص Clipper، الرجوع إلى المستطيلات: ' + (err && err.message ? err.message : err));
  }
  const meshes = [];
  function addSolid(name, material, positions, parent) {
    const ent = triMesh(name, material, positions);
    if (!ent) return;
    (parent || root).addChild(ent);
    meshes.push(ent._sinMesh);
  }
  if (solids) {
    addSolid('wings-unified-watertight-walls', wallMat, solids.wall.concat(solids.caps));
    for (const wing of Object.keys(solids.floors)) addSolid('wings-floor-' + wing, floorMat[wing] || floorMat.Shared, solids.floors[wing]);
  }
  let corridor = null;
  if (solids && skins) {
    try {
      corridor = dressCorridorSolids(solids.layout, solids.colliderSolids);
      gaps.unshift('كسوة الممرات على وجوه Clipper: ' + corridor.surfaces.length + ' قطعة، ' + corridor.plants.length + ' نبات، ' + corridor.torches.length + ' مشعل.');
    } catch (err) {
      corridor = null;
      gaps.unshift('كسوة جدار الممر ما زالت مستوى على المستطيل: ' + (err && err.message ? err.message : err));
    }
  } else if (!corridor) {
    gaps.unshift('كسوة جدار الممر ما زالت مستوى على المستطيل، لأن قص Clipper أو الخام غير متاح.');
  }

  for (const region of regions) {
    if (region.id === 'K1' || region.id === 'K2' || region.id === 'K3') continue;
    const g = new Entity(region.id);
    root.addChild(g);
    if (skins && (region.kind === 'corridor' || region.kind === 'gallery')) {
      dressCorridor(g, region, skins, !solids, !!corridor);
    } else if (!solids) {
      solidRoom(g, region, floorMat[region.wing] || floorMat.Shared, wallMat);
    }
  }
  if (corridor && skins) {
    const sheets = {
      floor: sheetMat(skins.floor, 0.86),
      ceiling: sheetMat(skins.ceiling, 0.92),
      wall: sheetMat(skins.wall, 0.9)
    };
    for (const surface of corridor.surfaces) {
      const host = root.findByName(surface.id) || root;
      for (const part of [
        [surface.id + '-corridor-floor', sheets.floor, surface.floor],
        [surface.id + '-corridor-ceiling', sheets.ceiling, surface.ceiling],
        [surface.id + '-corridor-walls', sheets.wall, surface.walls]
      ]) {
        const ent = uvMesh(part[0], part[1], part[2].positions, part[2].uvs);
        if (!ent) continue;
        host.addChild(ent);
        meshes.push(ent._sinMesh);
      }
    }
  }
  if (solids) {
    for (const c of solids.ceilings) {
      const host = root.findByName(c.id) || root;
      addSolid(c.id + '-ceiling', c.id === 'L4-oculus-dark-cap' ? colorMat([0x07, 0x07, 0x06], 1) : wallMat, c.positions, host);
    }
    const origin = hallRoot.getPosition();
    window.__wingBlock = (wx, wz) => {
      const x = wx - origin.x;
      const z = wz - origin.z;
      const r = 0.32;
      return pointInSolids(x, z, solids.wallSolids)
        || pointInSolids(x + r, z, solids.wallSolids)
        || pointInSolids(x - r, z, solids.wallSolids)
        || pointInSolids(x, z + r, solids.wallSolids)
        || pointInSolids(x, z - r, solids.wallSolids);
    };
  } else {
    window.__wingBlock = null;
  }
  let plantBoxes = [];
  if (corridor && skins) {
    try { plantBoxes = await placeClipperProps(registry, urls, root, corridor); }
    catch (err) { gaps.push('نباتات أو مشاعل الممرات: ' + (err && err.message ? err.message : err)); }
  } else if (skins) {
    try { await placeCorridorProps(registry, urls, root, layout.connectors); }
    catch (err) { gaps.push('نباتات أو مشاعل الممرات: ' + (err && err.message ? err.message : err)); }
  }

  await dressK1(registry, urls, root, layout);
  await dressK2(registry, urls, root, layout);
  await dressK3(registry, urls, root, layout, gaps);
  addSourceBoxes(root, layout, hall, wallMat);
  const boxes = addWingColumns(root, layout);
  boxes.push(...plantBoxes);
  const k5host = root.findByName('K5');
  if (k5host && k5host._k5Rail) boxes.push(k5host._k5Rail);
  if (solids && solids.colliderSolids) {
    boxes.push(...wallBoxes(solids.colliderSolids, (solids.doorCaps || []).map((c) => c.door)));
  }
  boxes.push(...k1Perimeter(layout));
  const k1 = measureK1(root);
  boxes.push(...k1.boxes);
  const polys = layout.rooms.concat(layout.connectors).map((r) => r.poly).filter((p) => p && p.length);
  const floorAt = wingFloorAt(layout, polys, k1.floor);
  addSealBrackets(root, roomTorchFires(layout));
  return { root, gaps, rooms: layout.rooms.map((r) => r.id), meshes, boxes, polys, floorAt };
}

async function dressK1(registry, urls, root, layout) {
  const r = layout.rooms.find((q) => q.id === 'K1');
  const g = new Entity('K1');
  root.addChild(g);
  const modelEnt = await model(registry, urls, 'assets/K1_RoyalReceptionHall.glb');
  const spin = new Entity('K1-spin');
  spin.setEulerAngles(0, 90, 0);
  spin.addChild(modelEnt);
  const host = new Entity('K1-RoyalReceptionHall');
  host.addChild(spin);
  const size = boundsOf(host);
  const roomD = r.bbox.z1 - r.bbox.z0;
  const palaceDoor = layout.doors.find((d) => d.id === 'PalaceL3');
  const west = r.bbox.x0;
  const east = palaceDoor ? palaceDoor.x : r.bbox.x1;
  spin.setLocalScale(roomD / Math.max(0.001, size.sz), r.height / Math.max(0.001, size.sy), (east - west) / Math.max(0.001, size.sx));
  const fitted = boundsOf(host);
  host.setLocalPosition((west + east) * 0.5 - fitted.cx, -fitted.minY, r.bbox.cz - fitted.cz);
  g.addChild(host);
}

async function dressK2(registry, urls, root, layout) {
  const r = layout.rooms.find((q) => q.id === 'K2');
  const g = new Entity('K2');
  root.addChild(g);
  const b = r.bbox;
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;
  const h = r.height;
  const floorTex = await texture(registry, urls, 'assets/ارضية المجلس.PNG', false);
  plane(g, 'K2-floor', texMat(floorTex, 0.55, 0.08), W, D, b.cx, 0.03, b.cz);
  const wallTex = await texture(registry, urls, OPT + 'جدار-المجلس.webp', true);
  const panel = W / Math.max(1, Math.round(W / 6.75));
  const panelD = D / Math.max(1, Math.round(D / 6.75));
  const alongX = texMat(wallTex, 0.82, 0.06);
  alongX.diffuseMapTiling = new Vec2(W / panel, 2);
  alongX.update();
  const alongZ = texMat(wallTex, 0.82, 0.06);
  alongZ.diffuseMapTiling = new Vec2(D / panelD, 2);
  alongZ.update();
  cutWalls(g, 'K2', alongX, b, h, r._doors);
  for (const e of g.children) {
    if (e.name !== 'K2-wall') continue;
    const p = e.getLocalPosition();
    if (Math.abs(p.x - b.x0) < 0.3 || Math.abs(p.x - b.x1) < 0.3) e.render.meshInstances.forEach((mi) => { mi.material = alongZ; });
  }

  const col = grounded(await model(registry, urls, OPT + 'عمود-المجلس.glb'));
  const colSize = boundsOf(col);
  const targetH = Math.max(4, h - 0.30 + 0.04);
  const kCol = targetH / Math.max(1e-4, colSize.sy);
  for (let i = 0; i < 4; i += 1) {
    const z = b.z0 + 3.2 + (D - 6.4) * (i / 3);
    for (const x of [b.x0 + 4.2, b.x1 - 4.2]) {
      const c = col.clone();
      c.setLocalScale(kCol, kCol, kCol);
      c.setEulerAngles(0, Math.atan2(b.cx - x, b.cz - z) * 180 / Math.PI, 0);
      c.setLocalPosition(x, 0, z);
      c.name = 'K2-column';
      g.addChild(c);
    }
  }

  const tableHost = grounded(await model(registry, urls, 'assets/اجتماعات .glb'));
  const tb = boundsOf(tableHost);
  const long = Math.max(tb.sx, tb.sz);
  const ts = 9.2 / Math.max(1e-4, long);
  tableHost.setLocalScale(ts, ts, ts);
  tableHost.setEulerAngles(0, tb.sz >= tb.sx ? 90 : 0, 0);
  tableHost.setLocalPosition(b.cx, 0, b.cz);
  tableHost.name = 'K2-council-table';
  g.addChild(tableHost);

  const ceil = await model(registry, urls, OPT + 'سقف-المجلس.glb');
  const pivot = new Entity('ceil-proto');
  const spin = new Entity('ceil-spin');
  spin.setEulerAngles(0, 0, -90);
  spin.addChild(ceil);
  pivot.addChild(spin);
  const cb = boundsOf(pivot);
  const nx = Math.max(1, Math.round(W / 6));
  const nz = Math.max(1, Math.round(D / 6));
  const tw = W / nx;
  const td = D / nz;
  const sx = tw / Math.max(1e-4, cb.sx);
  const sy = 0.30 / Math.max(1e-4, cb.sy);
  const sz = td / Math.max(1e-4, cb.sz);
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iz = 0; iz < nz; iz += 1) {
      const tile = pivot.clone();
      tile.setLocalScale(sx, sy, sz);
      tile.setLocalPosition(b.x0 + tw * (ix + 0.5) - cb.cx * sx, h - cb.maxY * sy, b.z0 + td * (iz + 0.5) - cb.cz * sz);
      tile.name = 'K2-ceiling';
      g.addChild(tile);
    }
  }

  const lamp = await model(registry, urls, OPT + 'ثريا-المجلس.glb');
  const lb = boundsOf(lamp);
  const seatY = h - 0.30;
  let chH = Math.min(h * 0.74, Math.max(5.75, seatY - (9.2 * 0.2872 + 0.48)));
  chH = Math.min(chH, Math.max(3.2, seatY - 9.2 * 0.2872 - 0.42));
  const lk = chH / Math.max(1e-4, lb.sy);
  lamp.setLocalScale(lk, lk, lk);
  const lb2 = boundsOf(lamp);
  lamp.setLocalPosition(b.cx - lb2.cx, seatY - lb2.maxY, b.cz - lb2.cz);
  lamp.name = 'K2-chandelier';
  for (const render of lamp.findComponents('render') || []) {
    for (const mi of render.meshInstances || []) {
      mi.cull = false;
      const material = mi.material;
      if (!material) continue;
      material.emissive = new Color(1, 0xb1 / 255, 0x5a / 255);
      material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, 0.22);
      material.update();
    }
  }
  g.addChild(lamp);
  const CUPS = [
    { x: 0.179, y: -0.100, z: 0, s: 1 },
    { x: -0.178, y: -0.100, z: 0, s: 1 },
    { x: 0, y: -0.100, z: 0.177, s: 1 },
    { x: 0, y: -0.100, z: -0.180, s: 1 },
    { x: 0.094, y: -0.146, z: -0.214, s: 0.62 },
    { x: -0.091, y: -0.145, z: 0.209, s: 0.62 },
    { x: 0.211, y: -0.145, z: -0.099, s: 0.62 },
    { x: -0.093, y: -0.146, z: -0.214, s: 0.62 },
    { x: -0.210, y: -0.145, z: 0.094, s: 0.62 },
    { x: -0.210, y: -0.146, z: -0.096, s: 0.62 },
    { x: 0.212, y: -0.146, z: 0.091, s: 0.62 },
    { x: 0.095, y: -0.145, z: 0.208, s: 0.62 }
  ];
  const cups = CUPS.map((cup, i) => ({
    x: b.cx + (cup.x - lb.cx) * lk,
    y: seatY + (cup.y - lb.maxY) * lk + 0.02,
    z: b.cz + (cup.z - lb.cz) * lk,
    s: cup.s,
    seed: 0.37 + i * 0.618
  }));
  buildTorchFlames(g, chandelierFlameItems(cups), 'k2');
  const fireY = cups.reduce((sum, cup) => sum + cup.y, 0) / cups.length;
  function point(intensity, range, x, y, z, rgb) {
    const light = new Entity('K2-light');
    light.addComponent('light', {
      type: 'point',
      color: new Color(rgb[0], rgb[1], rgb[2]),
      intensity,
      range,
      castShadows: false
    });
    light.setLocalPosition(x, y, z);
    g.addChild(light);
  }
  point(11, 24, b.cx, fireY, b.cz, [1, 0xb1 / 255, 0x5a / 255]);
  point(4.2, 14, b.cx, Math.max(3.2, fireY - 1.35), b.cz, [1, 0xc4 / 255, 0x8a / 255]);
  const ix = W * 0.30;
  const iz = D * 0.30;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) point(2.2, 16, b.cx + sx * ix, 4.2, b.cz + sz * iz, [1, 0xe2 / 255, 0xc2 / 255]);
  }

  const lion = grounded(await model(registry, urls, 'assets/lion_winged.glb.glb'));
  const lionBox = boundsOf(lion);
  const lk2 = 3.2 / Math.max(1e-4, lionBox.sy);
  [{ x: b.cx - 4.6, rot: 90 }, { x: b.cx + 4.6, rot: -90 }].forEach((s, i) => {
    const m = lion.clone();
    m.setLocalScale(lk2, lk2, lk2);
    m.setEulerAngles(0, s.rot, 0);
    m.setLocalPosition(s.x, 0, b.z1 - 2.6);
    m.name = 'K2-lion-' + (i + 1);
    g.addChild(m);
  });

  const plant = grounded(await model(registry, urls, OPT + 'شتله.glb'));
  const pb = boundsOf(plant);
  const pk = 2.2 / Math.max(1e-4, pb.sy);
  for (const i of [-1, 0, 1]) {
    const z = b.cz + i * 6;
    for (const side of [-1, 1]) {
      const m = plant.clone();
      m.setLocalScale(pk, pk, pk);
      m.setEulerAngles(0, side < 0 ? 0 : 180, 0);
      m.setLocalPosition(side < 0 ? b.x0 + 1.15 : b.x1 - 1.15, 0, z);
      m.name = 'K2-plant';
      g.addChild(m);
    }
  }
}

async function dressK3(registry, urls, root, layout, gaps) {
  const r = layout.rooms.find((q) => q.id === 'K3');
  const g = new Entity('K3');
  root.addChild(g);
  const b = r.bbox;
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;
  const h = r.height;
  const span = Math.min(W, D);
  const floorTex = await texture(registry, urls, 'assets/\u0627\u0631\u0636\u064a\u0629 \u0627\u0644\u062e\u0631\u0627\u064a\u0654\u0637.JPG', false);
  const floor = texMat(floorTex, 0.45, 0.08);
  floor.diffuseMapTiling = new Vec2(W / span, D / span);
  floor.diffuseMapOffset = new Vec2(0.5 - 0.5 * W / span, 0.5 - 0.5 * D / span);
  floor.emissive = new Color(0x12 / 255, 0x0e / 255, 0x0a / 255);
  floor.emissiveIntensity = 0.07;
  floor.update();
  plane(g, 'K3-map-floor', floor, W, D, b.cx, 0.04, b.cz);

  const farTex = await texture(registry, urls, 'assets/\u062c\u062f\u0627\u0631 \u0627\u0644\u062e\u0631\u0627\u064a\u0654\u0637 2.JPG', false);
  const sideTex = await texture(registry, urls, 'assets/\u062c\u062f\u0627\u0631 \u0627\u0644\u062e\u0631\u0627\u064a\u0654\u0637.JPG', false);
  const far = texMat(farTex, 0.72, 0.06);
  far.emissive = new Color(0x1a / 255, 0x14 / 255, 0x0c / 255);
  far.emissiveIntensity = 0.12;
  far.update();
  const side = texMat(sideTex, 0.72, 0.06);
  side.emissive = far.emissive;
  side.emissiveIntensity = 0.12;
  side.update();
  wallFace(g, 'K3-map-wall-far', far, D, h, b.x0, h * 0.5, b.cz, 'x');
  spans(b.z0, b.z1, r._doors.filter((d) => Math.abs(d.x - b.x1) < 1.2).map((d) => d.z)).forEach((s) => {
    wallFace(g, 'K3-map-wall-side', side, s[1] - s[0], h, b.x1, h * 0.5, (s[0] + s[1]) / 2, 'x');
  });
  wallFace(g, 'K3-map-wall-side', side, W, h, b.cx, h * 0.5, b.z0, 'z');
  wallFace(g, 'K3-map-wall-side', side, W, h, b.cx, h * 0.5, b.z1, 'z');

  const key = new Entity('K3-light');
  key.addComponent('light', { type: 'point', color: new Color(1, 0xb1 / 255, 0x5a / 255), intensity: 3.2, range: 18, castShadows: false });
  key.setLocalPosition(b.cx, 3.2, b.cz);
  g.addChild(key);

  const spec = await (await fetch(K3 + 'pieces.json')).json();
  const chosen = spec.chosen || {};
  const table = grounded(await model(registry, urls, K3 + 'table.glb'));
  const tb = boundsOf(table);
  const s = 1.12 / Math.max(1e-4, tb.sy);
  table.setLocalScale(s, s, s);
  table.setEulerAngles(0, -90, 0);
  table.setLocalPosition(b.cx, 0, b.cz);
  table.name = 'K3-map-table';
  g.addChild(table);
  const hx = tb.sz * s * 0.5;
  const hz = tb.sx * s * 0.5;

  async function put(kind, targetH, x, z, rot, name) {
    const info = chosen[kind];
    if (!info) { gaps.push('قطعة خرائط ناقصة: ' + kind); return null; }
    const ent = await model(registry, urls, K3 + info.file);
    const sc = targetH / Math.max(1e-4, info.size[1]);
    ent.setLocalScale(sc, sc, sc);
    const hold = new Entity(name);
    hold.setEulerAngles(0, rot * 180 / Math.PI, 0);
    hold.setLocalPosition(x, 0, z);
    hold.addChild(ent);
    g.addChild(hold);
    return { size: info.size.map((v) => v * sc) };
  }
  const shelf = await put('shelf', 1.5, 0, 0, 0, 'shelf-probe');
  if (shelf) {
    g.findByName('shelf-probe').destroy();
    await put('shelf', 1.5, b.x0 + 5.0, b.z0 + shelf.size[0] * 0.5 + 0.05, Math.PI / 2, 'K3-shelf-a');
    await put('shelf', 1.5, b.x0 + 10.6, b.z0 + shelf.size[0] * 0.5 + 0.05, Math.PI / 2, 'K3-shelf-b');
  }
  const arch = await put('arch', 3.5, 0, 0, 0, 'arch-probe');
  if (arch) {
    g.findByName('arch-probe').destroy();
    await put('arch', 3.5, b.x0 + 3.5, b.z1 - arch.size[0] * 0.5 - 0.04, -Math.PI / 2, 'K3-arch');
  }
  await put('scrolls', 1.5, b.x0 + 6.7, b.z1 - 1.35, 0.4, 'K3-scrolls');
  await put('brazier', 1.4, b.x0 + 0.85, b.z0 + 2.5, 0, 'K3-brazier-s');
  await put('brazier', 1.4, b.x0 + 0.85, b.z0 + 9.5, Math.PI, 'K3-brazier-n');
  await put('easel', 1.85, b.x0 + 12.4, b.z0 + 2.3, 2.4, 'K3-easel');
  const chair = await put('chair', 1.28, 0, 0, 0, 'chair-probe');
  if (chair) {
    g.findByName('chair-probe').destroy();
    const cd = chair.size[0] * 0.5 + 0.18;
    await put('chair', 1.28, b.cx - hx - cd, b.cz, 0, 'K3-chair-head');
    await put('chair', 1.28, b.cx - 1.25, b.cz + hz + cd, -Math.PI / 2, 'K3-chair-n1');
    await put('chair', 1.28, b.cx + 1.25, b.cz + hz + cd, -Math.PI / 2, 'K3-chair-n2');
    await put('chair', 1.28, b.cx - 1.25, b.cz - hz - cd, Math.PI / 2, 'K3-chair-s1');
    await put('chair', 1.28, b.cx + 1.25, b.cz - hz - cd, Math.PI / 2, 'K3-chair-s2');
  }
}
