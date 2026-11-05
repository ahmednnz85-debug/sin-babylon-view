// Clipper wall, floor skirt, and ceiling solids from wings.js prepareArchitecture / buildVisuals.
// Room polygons come from solveLayout. No rooms are invented here.
import earcut from '../vendor/earcut.js';

const SCALE = 1000;
const WALL = 1.0;
const MAX_H = 12.25;

function lib() {
  const C = typeof window !== 'undefined' ? window.ClipperLib : globalThis.ClipperLib;
  if (!C) throw new Error('ClipperLib غير محمّل');
  return C;
}

function pt(x, z) {
  const C = lib();
  return new C.IntPoint(Math.round(x * SCALE), Math.round(z * SCALE));
}
function polyRect(x, z, w, d) { return [[x, z], [x + w, z], [x + w, z + d], [x, z + d]]; }
function polyCircle(cx, cz, r, n) {
  const p = [];
  for (let i = 0; i < n; i += 1) {
    const a = i * Math.PI * 2 / n;
    p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return p;
}
function toPath(poly) { return poly.map((p) => pt(p[0], p[1])); }
function fromPath(path) { return path.map((p) => [p.X / SCALE, p.Y / SCALE]); }
function solidsToPaths(solids) {
  const paths = [];
  for (const s of solids || []) {
    if (!s || !s.outer) continue;
    paths.push(toPath(s.outer));
    for (const h of s.holes || []) if (h) paths.push(toPath(h));
  }
  return paths;
}
function treeToSolids(tree) {
  const C = lib();
  return C.JS.PolyTreeToExPolygons(tree).map((e) => ({
    outer: fromPath(e.outer),
    holes: (e.holes || []).map(fromPath)
  }));
}
function clip(op, a, b) {
  const C = lib();
  const c = new C.Clipper();
  c.AddPaths(solidsToPaths(a || []), C.PolyType.ptSubject, true);
  if (b) c.AddPaths(solidsToPaths(b), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(op, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return treeToSolids(tree);
}
function union(a, b) { return clip(lib().ClipType.ctUnion, a, b); }
function difference(a, b) { return clip(lib().ClipType.ctDifference, a, b); }
function intersection(a, b) { return clip(lib().ClipType.ctIntersection, a, b); }
function solid(poly) { return [{ outer: poly, holes: [] }]; }
function offset(solids, amount) {
  const C = lib();
  const co = new C.ClipperOffset(1, 0.08 * SCALE);
  co.AddPaths(solidsToPaths(solids), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const tree = new C.PolyTree();
  co.Execute(tree, amount * SCALE);
  return treeToSolids(tree);
}
function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}
function cleanPoly(poly, ccw) {
  const out = poly.filter((p, i) => i === 0 || Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) > 1e-6);
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
  if ((signedArea(out) > 0) !== ccw) out.reverse();
  return out;
}

function extrudeSolids(solids, y0, y1) {
  const positions = [];
  function tri(a, b, c) { positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  function quad(a, b, c, d) { tri(a, b, c); tri(a, c, d); }
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
    const faces = earcut(flat, holeIdx, 2);
    const verts = [];
    for (let i = 0; i < flat.length; i += 2) verts.push([flat[i], flat[i + 1]]);
    for (let i = 0; i < faces.length; i += 3) {
      const a = verts[faces[i]];
      const b = verts[faces[i + 1]];
      const c = verts[faces[i + 2]];
      if (!a || !b || !c) continue;
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const A = [a[0], y0, a[1]];
      const B = [b[0], y0, b[1]];
      const Cc = [c[0], y0, c[1]];
      const At = [a[0], y1, a[1]];
      const Bt = [b[0], y1, b[1]];
      const Ct = [c[0], y1, c[1]];
      if (cross > 0) { tri(A, B, Cc); tri(At, Ct, Bt); }
      else { tri(A, Cc, B); tri(At, Bt, Ct); }
    }
    function sides(poly) {
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        quad([a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]]);
      }
    }
    sides(outer);
    holes.forEach(sides);
  }
  return positions;
}

export { union, difference, intersection, solid, offset, cleanPoly };

function rectRegion(id, wing, name, x, z, w, d, h, kind) {
  const poly = polyRect(x, z, w, d);
  let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]);
    x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]);
  }
  return { id, wing, name, poly, height: h, kind, ceiling: false, bbox: { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 } };
}

// The ported solveLayout omitted thresholds, the sealed reservation, door thickness, and K1.ceiling.
// These are the same formulas as wings.js, not new rooms.
export function completeLayout(layout, hall) {
  const passages = {};
  for (const p of hall.passages || []) passages[p.id.replace('passage-', '')] = p;
  const rooms = layout.rooms;
  const connectors = layout.connectors.slice();
  const doors = layout.doors.map((d) => ({ ...d, thickness: d.thickness || 1 }));
  const K1 = rooms.find((r) => r.id === 'K1');
  if (K1) K1.ceiling = false;
  if (!connectors.some((r) => r.kind === 'threshold') && passages.L2 && passages.R2 && passages.R0) {
    function threshold(id, wing, passage, room) {
      const inner = passage.position[0];
      const x0 = Math.min(inner, room.bbox.x0, room.bbox.x1) - 0.05;
      const x1 = Math.max(inner, room.bbox.x0, room.bbox.x1) + 0.05;
      const r = rectRegion(id, wing, 'Arch threshold', x0, passage.position[2] - passage.width * 0.5 - 0.05, x1 - x0, passage.width + 0.1, room.height, 'threshold');
      r.linkRoom = room.id;
      connectors.push(r);
    }
    const T1 = rooms.find((r) => r.id === 'T1');
    const L1 = rooms.find((r) => r.id === 'L1');
    if (K1) threshold('ARCH_L3', 'Kings', passages.L2, K1);
    if (T1) threshold('ARCH_R3', 'Temple', passages.R2, T1);
    if (L1) threshold('ARCH_R1', 'Library', passages.R0, L1);
  }
  const zL = passages.R0 ? passages.R0.position[2] : 0;
  const sealed = layout.sealed || { x: -layout.back - 68, z: zL - 20, w: 50, d: 40 };
  return { ...layout, rooms, connectors, doors, sealed, passages };
}

export function prepareArchitecture(layout, hall) {
  const regions = layout.rooms.concat(layout.connectors);
  const allFloor = regions.reduce((acc, r) => union(acc, solid(r.poly)), []);
  const doorFloors = [];
  for (const d of layout.doors) {
    if (d.kind === 'arch') continue;
    const w = d.width;
    const t = (d.thickness || 1) + 0.1;
    const poly = d.axis === 'x' ? polyRect(d.x - t * 0.5, d.z - w * 0.5, t, w) : polyRect(d.x - w * 0.5, d.z - t * 0.5, w, t);
    d.floorPoly = poly;
    doorFloors.push(solid(poly));
  }
  const floors = doorFloors.reduce((acc, s) => union(acc, s), allFloor);
  const doorWalls = [];
  const openings = [];
  const caps = [];
  for (const d of layout.doors) {
    if (d.kind === 'arch') continue;
    const span = d.width + 2;
    const wallPoly = d.axis === 'x' ? polyRect(d.x - 0.5, d.z - span * 0.5, 1, span) : polyRect(d.x - span * 0.5, d.z - 0.5, span, 1);
    const openPoly = d.axis === 'x' ? polyRect(d.x - 0.6, d.z - d.width * 0.5, 1.2, d.width) : polyRect(d.x - d.width * 0.5, d.z - 0.6, d.width, 1.2);
    d.wallPoly = wallPoly;
    d.openPoly = openPoly;
    doorWalls.push(solid(wallPoly));
    openings.push(solid(openPoly));
    caps.push({ door: d, solids: solid(openPoly) });
  }
  let wallSolid = union(difference(offset(floors, WALL), floors), doorWalls.reduce((a, s) => union(a, s), []));
  const hw = hall.width * 0.5;
  const hl = hall.length;
  let hallObstacles = solid(polyRect(-hw - 0.2, -0.2, hw * 2 + 0.4, hl + 0.4));
  for (const d of layout.doors.filter((q) => q.kind === 'arch')) {
    const inner = d.x;
    const outer = inner < 0 ? -layout.back : layout.back;
    const x0 = Math.min(inner, outer) - 0.05;
    const x1 = Math.max(inner, outer) + 0.05;
    hallObstacles = union(hallObstacles, solid(polyRect(x0, d.z - d.width * 0.5 - 0.05, x1 - x0, d.width + 0.1)));
  }
  wallSolid = difference(wallSolid, hallObstacles);
  wallSolid = difference(wallSolid, solid(polyRect(layout.sealed.x, layout.sealed.z, layout.sealed.w, layout.sealed.d)));
  const baseWall = openings.reduce((acc, s) => difference(acc, s), wallSolid);
  return { floors, wallSolid, baseWall, caps, regions };
}

export function buildWingSolids(layoutIn, hall) {
  const layout = completeLayout(layoutIn, hall);
  const arch = prepareArchitecture(layout, hall);
  const regions = arch.regions;
  const hwv = hall.width * 0.5;
  const wtv = hall.wallThickness || 0;
  const palaceBand = solid(polyRect(-hwv - wtv - 0.02, -0.5, (hwv + wtv + 0.02) * 2, hall.length + 1));
  const visualWall = difference(arch.baseWall, palaceBand);
  const wall = extrudeSolids(visualWall, 0, MAX_H);
  const caps = [];
  for (const c of arch.caps) caps.push(...extrudeSolids(c.solids, c.door.height, MAX_H));
  const floors = {};
  let claimed = [];
  for (const [wi, wing] of ['Kings', 'Temple', 'Library', 'Shared'].entries()) {
    let wingFloor = [];
    for (const r of regions) {
      if (r.wing === wing && r.id !== 'K1' && r.id !== 'K2' && r.id !== 'K3') wingFloor = union(wingFloor, solid(r.poly));
    }
    for (const d of layout.doors) {
      if (d.kind === 'arch' || !d.floorPoly) continue;
      const target = regions.find((r) => r.id === d.to);
      const source = regions.find((r) => r.id === d.from);
      if ((target && target.wing === wing) || (source && source.wing === wing)) wingFloor = union(wingFloor, solid(d.floorPoly));
    }
    wingFloor = difference(wingFloor, claimed);
    claimed = union(claimed, wingFloor);
    let skirt = offset(wingFloor, 0.3);
    if (wing === 'Kings') {
      const k2 = regions.find((r) => r.id === 'K2');
      const k3 = regions.find((r) => r.id === 'K3');
      if (k2) skirt = difference(skirt, solid(k2.poly));
      if (k3) skirt = difference(skirt, solid(k3.poly));
    }
    floors[wing] = extrudeSolids(skirt, -0.25, wi * 0.002);
  }
  const ceilings = [];
  for (const r of regions) {
    if (r.ceiling === false || r.id === 'K1') continue;
    let poly = solid(r.poly);
    if (r.id === 'L4') poly = difference(poly, solid(polyCircle(r.bbox.cx, r.bbox.cz, 2.5, 32)));
    ceilings.push({ id: r.id, positions: extrudeSolids(poly, r.height, r.height + 0.25) });
    if (r.id === 'L4') {
      const ring = difference(solid(polyCircle(r.bbox.cx, r.bbox.cz, 3.0, 32)), solid(polyCircle(r.bbox.cx, r.bbox.cz, 2.5, 32)));
      ceilings.push({ id: 'L4-oculus-shaft', positions: extrudeSolids(ring, r.height, r.height + 3) });
      ceilings.push({ id: 'L4-oculus-dark-cap', positions: extrudeSolids(solid(polyCircle(r.bbox.cx, r.bbox.cz, 3.0, 32)), r.height + 3, r.height + 3.25) });
    }
  }
  return {
    layout,
    wallVerts: (wall.length + caps.length) / 3,
    wall,
    caps,
    floors,
    ceilings,
    wallSolids: visualWall,
    colliderSolids: arch.baseWall,
    doorCaps: arch.caps
  };
}
