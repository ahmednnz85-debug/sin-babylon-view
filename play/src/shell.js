// Palace shell collision, copied from the original index.html palQuery / palGround /
// palaceBlocked path. The door opening is cut out of palace.glb the same way the
// original discards that box, so the royal door leaf is not buried in the facade.
import * as pc from '../vendor/playcanvas.mjs';

const CELL = 4;
const ARCH = { x: 1.0, y: 3.86, width: 4.42, height: 8.18 };

function transform(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

function inside(box, x, y, z) {
  return x > box.minX && x < box.maxX && y > box.minY && y < box.maxY && z > box.minZ && z < box.maxZ;
}

function at(m, src, index) {
  const i = index * 3;
  return transform(m, src.positions[i], src.positions[i + 1], src.positions[i + 2]);
}

function rayTri(ox, oy, oz, dx, dy, dz, a, b, c) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const px = dy * acz - dz * acy;
  const py = dz * acx - dx * acz;
  const pz = dx * acy - dy * acx;
  const det = abx * px + aby * py + abz * pz;
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const tx = ox - a[0];
  const ty = oy - a[1];
  const tz = oz - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-3 || u > 1) return null;
  const qx = ty * abz - tz * aby;
  const qy = tz * abx - tx * abz;
  const qz = tx * aby - ty * abx;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-3 || u + v > 1) return null;
  const t = (acx * qx + acy * qy + acz * qz) * inv;
  return t >= 0 ? t : null;
}

function readMesh(mesh) {
  const count = mesh.vertexBuffer ? mesh.vertexBuffer.numVertices : 0;
  const indexBuffer = mesh.indexBuffer && mesh.indexBuffer[0];
  if (!count || !indexBuffer) return null;
  const positions = new Float32Array(count * 3);
  mesh.getPositions(positions);
  const indexCount = indexBuffer.numIndices || indexBuffer.getNumIndices();
  const indices = new Uint32Array(indexCount);
  mesh.getIndices(indices);
  return { positions, indices, indexCount };
}

export function carveDoor(root, frontZ) {
  const doorX = ARCH.x;
  let nearest = 1e9;
  const meshes = [];
  root.syncHierarchy();
  for (const render of root.findComponents('render') || []) {
    for (const mi of render.meshInstances || []) {
      const mesh = mi.mesh;
      const node = mi.node;
      if (!mesh || !node || mesh._sinDoorHole) continue;
      const src = readMesh(mesh);
      if (!src) continue;
      meshes.push({ mesh, src, m: node.getWorldTransform().data });
    }
  }
  for (const item of meshes) {
    const src = item.src;
    const m = item.m;
    for (let i = 0; i < src.indexCount; i += 3) {
      const a = at(m, src, src.indices[i]);
      const b = at(m, src, src.indices[i + 1]);
      const c = at(m, src, src.indices[i + 2]);
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cy = (a[1] + b[1] + c[1]) / 3;
      const cz = (a[2] + b[2] + c[2]) / 3;
      if (cx < ARCH.x - ARCH.width * 0.52 || cx > ARCH.x + ARCH.width * 0.52) continue;
      if (cy < ARCH.y - 0.05 || cy > ARCH.y + ARCH.height + 0.15) continue;
      if (cz < frontZ + 0.15 || cz > frontZ + 12) continue;
      if (cz < nearest) nearest = cz;
    }
  }
  const wallZ = nearest < 1e8 ? nearest - 0.06 : frontZ + 5.2;
  const hole = {
    minX: ARCH.x - ARCH.width * 0.52,
    maxX: ARCH.x + ARCH.width * 0.52,
    minY: ARCH.y - 0.05,
    maxY: ARCH.y + ARCH.height + 0.15,
    minZ: frontZ + 0.02,
    maxZ: wallZ + 0.4
  };
  let dropped = 0;
  for (const item of meshes) {
    const src = item.src;
    const m = item.m;
    const keep = [];
    for (let i = 0; i < src.indexCount; i += 3) {
      const a = at(m, src, src.indices[i]);
      const b = at(m, src, src.indices[i + 1]);
      const c = at(m, src, src.indices[i + 2]);
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cy = (a[1] + b[1] + c[1]) / 3;
      const cz = (a[2] + b[2] + c[2]) / 3;
      if (inside(hole, cx, cy, cz)) { dropped += 1; continue; }
      keep.push(src.indices[i], src.indices[i + 1], src.indices[i + 2]);
    }
    if (keep.length !== src.indexCount) item.mesh.setIndices(keep);
    item.mesh._sinDoorHole = true;
  }
  return { hole, dropped, wallZ };
}

export function indexShell(root) {
  const raw = [];
  const grid = new Map();
  const big = [];
  function add(tri) {
    const i = raw.length / 12;
    raw.push(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5], tri[6], tri[7], tri[8], tri[9], tri[10], tri[11]);
    const x0 = Math.floor(Math.min(tri[0], tri[3], tri[6]) / CELL);
    const x1 = Math.floor(Math.max(tri[0], tri[3], tri[6]) / CELL);
    const z0 = Math.floor(Math.min(tri[2], tri[5], tri[8]) / CELL);
    const z1 = Math.floor(Math.max(tri[2], tri[5], tri[8]) / CELL);
    if (x1 - x0 > 6 || z1 - z0 > 6) { big.push(i); return; }
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const key = x + ',' + z;
        let list = grid.get(key);
        if (!list) grid.set(key, list = []);
        list.push(i);
      }
    }
  }
  root.syncHierarchy();
  for (const render of root.findComponents('render') || []) {
    for (const mi of render.meshInstances || []) {
      const mesh = mi.mesh;
      const node = mi.node;
      if (!mesh || !node) continue;
      const src = readMesh(mesh);
      if (!src) continue;
      const m = node.getWorldTransform().data;
      for (let i = 0; i < src.indexCount; i += 3) {
        const ia = src.indices[i] * 3;
        const ib = src.indices[i + 1] * 3;
        const ic = src.indices[i + 2] * 3;
        const a = transform(m, src.positions[ia], src.positions[ia + 1], src.positions[ia + 2]);
        const b = transform(m, src.positions[ib], src.positions[ib + 1], src.positions[ib + 2]);
        const c = transform(m, src.positions[ic], src.positions[ic + 1], src.positions[ic + 2]);
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const abz = b[2] - a[2];
        const acx = c[0] - a[0];
        const acy = c[1] - a[1];
        const acz = c[2] - a[2];
        let nx = aby * acz - abz * acy;
        let ny = abz * acx - abx * acz;
        let nz = abx * acy - aby * acx;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-8) continue;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        add([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], nx, ny, nz]);
      }
    }
  }
  const data = new Float32Array(raw);
  function ray(ox, oy, oz, dx, dy, dz, far, keep) {
    const hits = [];
    const seen = new Set();
    const ex = ox + dx * far;
    const ey = oy + dy * far;
    const ez = oz + dz * far;
    const x0 = Math.floor(Math.min(ox, ex) / CELL);
    const x1 = Math.floor(Math.max(ox, ex) / CELL);
    const z0 = Math.floor(Math.min(oz, ez) / CELL);
    const z1 = Math.floor(Math.max(oz, ez) / CELL);
    const ids = big.slice();
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const list = grid.get(x + ',' + z);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 1) ids.push(list[k]);
      }
    }
    for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            const t = id * 12;
            const nd = data[t + 9] * dx + data[t + 10] * dy + data[t + 11] * dz;
            if (Math.abs(nd) < 1e-8) continue;
            const dist = (data[t + 9] * (data[t] - ox) + data[t + 10] * (data[t + 1] - oy) + data[t + 11] * (data[t + 2] - oz)) / nd;
            if (dist < 0 || dist > far) continue;
            const px = ox + dx * dist;
            const py = oy + dy * dist;
            const pz = oz + dz * dist;
            const abx = data[t + 3] - data[t];
            const aby = data[t + 4] - data[t + 1];
            const abz = data[t + 5] - data[t + 2];
            const acx = data[t + 6] - data[t];
            const acy = data[t + 7] - data[t + 1];
            const acz = data[t + 8] - data[t + 2];
            const apx = px - data[t];
            const apy = py - data[t + 1];
            const apz = pz - data[t + 2];
            const d00 = abx * abx + aby * aby + abz * abz;
            const d01 = abx * acx + aby * acy + abz * acz;
            const d11 = acx * acx + acy * acy + acz * acz;
            const d20 = apx * abx + apy * aby + apz * abz;
            const d21 = apx * acx + apy * acy + apz * acz;
            const den = d00 * d11 - d01 * d01;
            if (Math.abs(den) < 1e-12) continue;
            const v = (d11 * d20 - d01 * d21) / den;
            const w = (d00 * d21 - d01 * d20) / den;
            const u = 1 - v - w;
            if (u < -1e-3 || v < -1e-3 || w < -1e-3) continue;
            hits.push({ dist, nx: data[t + 9], ny: data[t + 10], nz: data[t + 11], y: py });
    }
    hits.sort((p, q) => p.dist - q.dist);
    return hits.slice(0, keep);
  }
  return {
    triangles: data.length / 12,
    ground(x, z, y0) {
      const hits = ray(x, y0 + 1, z, 0, -1, 0, 80, 1);
      return hits.length ? hits[0].y : 0;
    },
    wallAhead(px, py, pz, x, z) {
      const dx = x - px;
      const dz = z - pz;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) return false;
      const ux = dx / len;
      const uz = dz / len;
      const hits = ray(px, py + 1.15, pz, ux, 0, uz, len + 0.48, 6);
      for (const hit of hits) {
        if (hit.ny > 0.6) continue;
        if (hit.nx * ux + hit.nz * uz > 0.05) continue;
        return true;
      }
      return false;
    }
  };
}

function pointInPoly(x, z, poly) {
  let insidePoly = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-12) + xi) insidePoly = !insidePoly;
  }
  return insidePoly;
}

export function interiorVolume(portal, hall, wing) {
  const ox = portal.x;
  const oy = portal.y;
  const oz = portal.z;
  const hallBoxes = [];
  function lift(list, into) {
    for (const b of list || []) {
      into.push({
        minx: ox + b.minx, maxx: ox + b.maxx,
        miny: oy + b.miny, maxy: oy + b.maxy,
        minz: oz + b.minz, maxz: oz + b.maxz
      });
    }
  }
  lift(hall.boxes, hallBoxes);
  const ramp = hall.ramp;
  const polys = (wing && wing.polys) || [];
  const H = hall.H || 1.8;
  function contains(lx, lz) {
    for (const poly of polys) if (pointInPoly(lx, lz, poly)) return true;
    return false;
  }
  function inHall(lx, lz) {
    return lz >= -0.08 && lz <= hall.length + 0.4 && Math.abs(lx) <= hall.width * 0.5 + 0.2;
  }
  function capsule(x, z, list) {
    const r = 0.32;
    for (const b of list || []) {
      if (b.miny > 1.65 || b.maxy < 0.08) continue;
      const qx = Math.max(b.minx, Math.min(x, b.maxx));
      const qz = Math.max(b.minz, Math.min(z, b.maxz));
      const dx = x - qx;
      const dz = z - qz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  return {
    boxes: hallBoxes.length + ((wing && wing.boxes && wing.boxes.length) || 0),
    owns(x, z) {
      const lx = x - ox;
      const lz = z - oz;
      return inHall(lx, lz) || contains(lx, lz);
    },
    y(x, z) {
      const lx = x - ox;
      const lz = z - oz;
      if (contains(lx, lz) && wing && wing.floorAt) {
        const wh = wing.floorAt(lx, lz);
        if (wh != null) return oy + wh;
      }
      let h = 0;
      if (inHall(lx, lz) && ramp && lx >= ramp.x0 && lx <= ramp.x1) {
        if (lz >= ramp.z1 && lz <= ramp.zPlat) h = ramp.yTop;
        else if (lz > ramp.z0 && lz < ramp.z1) h = ramp.yTop * ((lz - ramp.z0) / Math.max(0.001, ramp.z1 - ramp.z0));
      }
      return oy + h;
    },
    blocks(x, z) {
      const lx = x - ox;
      const lz = z - oz;
      if (capsule(lx, lz, wing && wing.boxes)) return true;
      const feet = this.y(x, z);
      const head = feet + Math.max(1.9, H * 1.05);
      for (const c of hallBoxes) {
        if (c.miny >= head || c.maxy <= feet + 0.08) continue;
        if (x > c.minx && x < c.maxx && z > c.minz && z < c.maxz) return true;
      }
      return false;
    }
  };
}
