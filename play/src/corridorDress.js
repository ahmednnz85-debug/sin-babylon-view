// Corridor floor, ceiling, and wall faces from original-threejs/wings.js
// dressCorridors, flatSheet, corridorWallRuns, wallQuads, and the plant/torch slots.
// Room polygons are never skinned. Pieces are clipped against rooms and each other.
import earcut from '../vendor/earcut.js';
import { cleanPoly, difference, intersection, offset, solid, union } from './clipperWalls.js';

const TILE = { floor: 2, ceiling: 3, wall: 3 };
const STEP = 0.25;
const INSET = 0.012;

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && x < ((b[0] - a[0]) * (z - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
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

function flatSheet(solids, y, faceUp, tile) {
  const positions = [];
  const uvs = [];
  for (const s of solids || []) {
    const outer = cleanPoly(s.outer, true);
    const holes = (s.holes || []).map((h) => cleanPoly(h, false)).filter((h) => h.length >= 3);
    if (outer.length < 3) continue;
    const flat = [];
    const holeIdx = [];
    for (const p of outer) flat.push(p[0], p[1]);
    for (const h of holes) {
      holeIdx.push(flat.length / 2);
      for (const p of h) flat.push(p[0], p[1]);
    }
    let faces = [];
    try { faces = earcut(flat, holeIdx, 2); } catch (err) { continue; }
    const verts = [];
    for (let i = 0; i < flat.length; i += 2) verts.push([flat[i], flat[i + 1]]);
    for (let i = 0; i < faces.length; i += 3) {
      let a = verts[faces[i]];
      let b = verts[faces[i + 1]];
      let c = verts[faces[i + 2]];
      if (!a || !b || !c) continue;
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if ((cross < 0) !== faceUp) { const t = b; b = c; c = t; }
      for (const p of [a, b, c]) {
        positions.push(p[0], y, p[1]);
        uvs.push(p[0] / tile, p[1] / tile);
      }
    }
  }
  return { positions, uvs };
}

function corridorWallRuns(wallSolids, area) {
  const runs = [];
  for (const s of wallSolids || []) {
    const rings = [cleanPoly(s.outer, true)].concat((s.holes || []).map((h) => cleanPoly(h, false)));
    for (const poly of rings) {
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 0.05) continue;
        const tx = (b[0] - a[0]) / L;
        const tz = (b[1] - a[1]) / L;
        let wx = tz;
        let wz = -tx;
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[1] + b[1]) / 2;
        if (pointInSolids(mx + wx * 0.05, mz + wz * 0.05, wallSolids)) { wx = -wx; wz = -wz; }
        const n = Math.max(1, Math.round(L / STEP));
        const st = L / n;
        let cur = null;
        for (let k = 0; k < n; k += 1) {
          const cx = a[0] + tx * st * (k + 0.5);
          const cz = a[1] + tz * st * (k + 0.5);
          const inside = pointInSolids(cx + wx * 0.2, cz + wz * 0.2, area);
          if (inside) {
            if (cur) cur.s1 = st * (k + 1);
            else cur = { a, tx, tz, nx: -wx, nz: -wz, s0: st * k, s1: st * (k + 1), inset: INSET };
          } else if (cur) { runs.push(cur); cur = null; }
        }
        if (cur) runs.push(cur);
      }
    }
  }
  return runs;
}

function wallQuads(segs, yOf, tile) {
  const positions = [];
  const uvs = [];
  for (const r of segs) {
    const [y0, y1] = yOf(r);
    if (y1 - y0 < 0.02 || r.s1 - r.s0 < 0.02) continue;
    const ix = -r.nx * r.inset;
    const iz = -r.nz * r.inset;
    const P = (s) => [r.a[0] + r.tx * s + ix, r.a[1] + r.tz * s + iz];
    const p0 = P(r.s0);
    const p1 = P(r.s1);
    const u0 = (p0[0] * Math.abs(r.tx) + p0[1] * Math.abs(r.tz)) / tile;
    const u1 = u0 + (r.s1 - r.s0) * (r.tx + r.tz >= 0 ? 1 : -1) / tile;
    const A = [p0[0], y0, p0[1]];
    const B = [p1[0], y0, p1[1]];
    const Cq = [p1[0], y1, p1[1]];
    const D = [p0[0], y1, p0[1]];
    const uA = [u0, y0 / tile];
    const uB = [u1, y0 / tile];
    const uC = [u1, y1 / tile];
    const uD = [u0, y1 / tile];
    const fx = -r.nx;
    const fz = -r.nz;
    const e1x = B[0] - A[0];
    const e1z = B[2] - A[2];
    const want = (-e1z) * fx + e1x * fz > 0;
    const tri = want ? [A, B, Cq, A, Cq, D] : [A, Cq, B, A, D, Cq];
    const tuv = want ? [uA, uB, uC, uA, uC, uD] : [uA, uC, uB, uA, uD, uC];
    tri.forEach((p, i) => {
      positions.push(p[0], p[1], p[2]);
      uvs.push(tuv[i][0], tuv[i][1]);
    });
  }
  return { positions, uvs };
}

function concatGeom(parts) {
  const positions = [];
  const uvs = [];
  for (const part of parts) {
    if (!part || !part.positions || part.positions.length < 9) continue;
    for (let i = 0; i < part.positions.length; i += 1) positions.push(part.positions[i]);
    for (let i = 0; i < part.uvs.length; i += 1) uvs.push(part.uvs[i]);
  }
  return { positions, uvs };
}

const TORCH = { spacing: 7, margin: 1.3 };

function placeTorches(runs, freeArea, doors, out) {
  for (const run of runs) {
    const len = run.s1 - run.s0;
    const usable = len - TORCH.margin * 2;
    if (usable < 0) continue;
    const n = Math.floor(usable / TORCH.spacing) + 1;
    const used = (n - 1) * TORCH.spacing;
    for (let i = 0; i < n; i += 1) {
      const s = run.s0 + TORCH.margin + (usable - used) / 2 + i * TORCH.spacing;
      const dx = -run.nx;
      const dz = -run.nz;
      const wx = run.a[0] + run.tx * s + dx * run.inset;
      const wz = run.a[1] + run.tz * s + dz * run.inset;
      if (!pointInSolids(wx + dx * 0.35, wz + dz * 0.35, freeArea)) continue;
      if (!pointInSolids(wx + dx * 0.35 + run.tx * 0.3, wz + dz * 0.35 + run.tz * 0.3, freeArea)) continue;
      if (!pointInSolids(wx + dx * 0.35 - run.tx * 0.3, wz + dz * 0.35 - run.tz * 0.3, freeArea)) continue;
      if (doors.some((d) => d.kind !== 'arch' && Math.hypot(d.x - wx, d.z - wz) < d.width * 0.5 + 0.9)) continue;
      if (out.some((t) => Math.hypot(t.x - wx, t.z - wz) < TORCH.spacing * 0.55)) continue;
      out.push({ x: wx, z: wz, dx, dz, type: out.length % 2, seed: out.length * 0.618 + 0.37 });
    }
  }
}

export function dressCorridorSolids(layout, baseWall) {
  const corridors = layout.connectors.filter((r) => r.kind === 'corridor' || r.kind === 'gallery');
  let roomsSolid = [];
  for (const r of layout.rooms) roomsSolid = union(roomsSolid, solid(r.poly));
  let claimed = [];
  let claimedDoors = [];
  const surfaces = [];
  const plants = [];
  const torches = [];
  for (const r of corridors) {
    const piece = difference(difference(solid(r.poly), roomsSolid), claimed);
    claimed = union(claimed, piece);
    if (!piece.length) continue;
    let doorStrip = [];
    for (const d of layout.doors) {
      if (d.kind === 'arch' || !d.floorPoly) continue;
      if (d.from !== r.id && d.to !== r.id) continue;
      doorStrip = union(doorStrip, solid(d.floorPoly));
    }
    doorStrip = difference(difference(doorStrip, claimedDoors), claimed);
    claimedDoors = union(claimedDoors, doorStrip);
    const h = r.height;
    const floor = flatSheet(union(piece, doorStrip), 0.012, true, TILE.floor);
    const ceiling = flatSheet(piece, h - 0.012, false, TILE.ceiling);
    const area = union(piece, doorStrip);
    const wallsHere = intersection(baseWall, offset(area, 1.6));
    const freeArea = difference(area, baseWall);
    const runs = corridorWallRuns(wallsHere, freeArea);
    const lintelRuns = [];
    const soffits = [];
    for (const d of layout.doors) {
      if (d.kind === 'arch' || !d.openPoly) continue;
      if (d.from !== r.id && d.to !== r.id) continue;
      const op = solid(d.openPoly);
      for (const l of corridorWallRuns(op, difference(freeArea, op))) {
        l.door = d;
        lintelRuns.push(l);
      }
      const under = intersection(op, area);
      if (under.length) soffits.push({ d, under });
    }
    const walls = concatGeom([
      wallQuads(runs, () => [0, h - 0.012], TILE.wall),
      wallQuads(lintelRuns, (l) => [Math.min(l.door.height, h), h - 0.012], TILE.wall)
    ].concat(soffits.map((sf) => flatSheet(sf.under, Math.min(sf.d.height, h) - 0.012, false, TILE.wall))));
    surfaces.push({ id: r.id, floor, ceiling, walls });
    const regionTorches = [];
    placeTorches(runs, freeArea, layout.doors, regionTorches);
    for (const t of regionTorches) {
      t.region = r.id;
      torches.push(t);
    }
    const b = r.bbox;
    const dx = b.x1 - b.x0;
    const dz = b.z1 - b.z0;
    const width = Math.min(dx, dz) >= 2.5 ? Math.min(dx, dz) : Math.max(dx, dz);
    const spacing = Math.min(6, Math.max(3.5, width * 0.85));
    const off = Math.min(0.7, Math.max(0.45, width * 0.09));
    const margin = Math.max(1, off + 0.6);
    for (const run of runs) {
      const len = run.s1 - run.s0 - margin * 2;
      if (len < -1) continue;
      const n = Math.floor(len / spacing) + 1;
      const used = (n - 1) * spacing;
      for (let i = 0; i < n; i += 1) {
        const s = run.s0 + margin + (len - used) / 2 + i * spacing;
        let x = 0;
        let z = 0;
        let ok = false;
        for (const shift of [0, 1, -1]) {
          const ss = s + shift;
          if (ss < run.s0 + 0.6 || ss > run.s1 - 0.6) continue;
          x = run.a[0] + run.tx * ss - run.nx * off;
          z = run.a[1] + run.tz * ss - run.nz * off;
          if (!pointInSolids(x, z, freeArea) || pointInSolids(x, z, offset(wallsHere, 0.4))) continue;
          if (torches.some((t) => Math.hypot(t.x - x, t.z - z) < 1.1)) continue;
          if (plants.some((p) => Math.hypot(p.x - x, p.z - z) < spacing * 0.6)) continue;
          if (layout.doors.some((d) => d.kind !== 'arch' && Math.hypot(d.x - x, d.z - z) < d.width * 0.5 + 0.4)) continue;
          ok = true;
          break;
        }
        if (!ok) continue;
        plants.push({ x, z, region: r.id, width, rot: (plants.length * 2.399) % (Math.PI * 2) });
      }
    }
  }
  return { surfaces, plants, torches };
}
