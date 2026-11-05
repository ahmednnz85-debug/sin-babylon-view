function bbox(poly) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]);
    z0 = Math.min(z0, p[1]);
    x1 = Math.max(x1, p[0]);
    z1 = Math.max(z1, p[1]);
  }
  return { x0, z0, x1, z1, cx: (x0 + x1) * 0.5, cz: (z0 + z1) * 0.5 };
}

function rectRegion(id, wing, name, x, z, w, d, h, kind) {
  const poly = [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
  return { id, wing, name, poly, height: h, kind: kind || 'room', bbox: bbox(poly) };
}

function circleRegion(id, wing, name, cx, cz, r, n, h) {
  const poly = [];
  for (let i = 0; i < n; i += 1) {
    const a = i * Math.PI * 2 / n;
    poly.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return { id, wing, name, poly, height: h, kind: 'room', bbox: bbox(poly) };
}

// Same room graph as wings.js solveLayout. Coordinates are metres in the hall's local frame.
export function solveLayout(hall) {
  const passages = {};
  for (const p of hall.passages) passages[p.id.replace('passage-', '')] = p;
  const need = ['L2', 'R2', 'R0'];
  for (const id of need) {
    if (!passages[id]) throw new Error('باب الجناح ' + id + ' غير موجود في القاعة');
  }
  const zK = passages.L2.position[2];
  const zT = passages.R2.position[2];
  const zL = passages.R0.position[2];
  const back = hall.width * 0.5 + hall.wallThickness + hall.alcoveDepth;
  const rooms = [];
  const connectors = [];
  const doors = [];
  const links = [];
  const addRoom = (r) => { rooms.push(r); return r; };
  const addCon = (r) => { connectors.push(r); return r; };
  function door(id, a, b, x, z, axis, width, kind) {
    const ra = rooms.concat(connectors).find((r) => r.id === a);
    const rb = rooms.concat(connectors).find((r) => r.id === b);
    const h = kind === 'arch'
      ? (passages[a] ? passages[a].height : 7.8)
      : Math.min(6, (ra ? ra.height : 6) - 0.5, (rb ? rb.height : 6) - 0.5);
    const d = { id, from: a, to: b, x, z, axis, width: width || 4.5, height: Math.max(3.8, h), kind: kind || 'door' };
    doors.push(d);
    links.push([a, b, id]);
    return d;
  }

  const K1 = addRoom(rectRegion('K1', 'Kings', 'reception hall', -back - 39, zK - 14, 39, 28, 8.5));
  const KC12 = addCon(rectRegion('KC12', 'Kings', 'Kings corridor', K1.bbox.x0 - 8, zK - 3, 8, 6, 6, 'corridor'));
  const K2 = addRoom(rectRegion('K2', 'Kings', 'council hall', KC12.bbox.x0 - 31, zK, 30, 24, 9));
  door('K1-KC12', 'K1', 'KC12', K1.bbox.x0 - 0.5, zK, 'x');
  door('KC12-K2', 'KC12', 'K2', K2.bbox.x1 + 0.5, zK, 'x');

  const KC1x = K2.bbox.cx;
  const rearZ = hall.length + 5;
  const REAR = addCon(rectRegion('REAR', 'Shared', 'Rear Gallery', -28, rearZ, back + 44, 6, 7, 'gallery'));
  const K5 = addRoom(rectRegion('K5', 'Kings', 'king private wing', -28, rearZ + 12, 22, 16, 6));
  const KC2 = addCon(rectRegion('KC2', 'Kings', 'Kings L corridor', KC1x - 3, K5.bbox.z1 + 1, K5.bbox.cx - KC1x + 3, 6, 6, 'corridor'));
  const KC1 = addCon(rectRegion('KC1', 'Kings', 'Kings L corridor', KC1x - 3, K2.bbox.z1 + 1, 6, KC2.bbox.z1 - K2.bbox.z1 - 1, 6, 'corridor'));
  door('K2-KC1', 'K2', 'KC1', KC1x, K2.bbox.z1 + 0.5, 'z');
  links.push(['KC1', 'KC2', 'KC1-KC2']);
  door('KC2-K5', 'KC2', 'K5', K5.bbox.cx, K5.bbox.z1 + 0.5, 'z');

  const K3 = addRoom(rectRegion('K3', 'Kings', 'map room', KC1.bbox.x0 - 17, KC1.bbox.z0 + 5, 16, 12, 5.5));
  const KC3 = addCon(rectRegion('KC3', 'Kings', 'Map corridor', K3.bbox.x1, K3.bbox.cz - 3, KC1.bbox.x0 - K3.bbox.x1, 6, 6, 'corridor'));
  door('K3-KC3', 'K3', 'KC3', K3.bbox.x1 + 0.5, K3.bbox.cz, 'x');
  links.push(['KC3', 'KC1', 'KC3-KC1']);
  const K4 = addRoom(rectRegion('K4', 'Kings', 'royal treasury', KC1x + 17, KC2.bbox.z1 + 3, 14, 12, 5));
  const KC4 = addCon(rectRegion('KC4', 'Kings', 'Treasury corridor', K4.bbox.cx - 3, KC2.bbox.z1, 6, K4.bbox.z0 - KC2.bbox.z1, 6, 'corridor'));
  door('KC4-K4', 'KC4', 'K4', K4.bbox.cx, K4.bbox.z0 - 0.5, 'z');
  links.push(['KC4', 'KC2', 'KC4-KC2']);
  const KC5R = addCon(rectRegion('KC5R', 'Kings', 'Rear approach', K5.bbox.cx - 3, REAR.bbox.z1, 6, K5.bbox.z0 - REAR.bbox.z1, 6, 'corridor'));
  door('K5-KC5R', 'K5', 'KC5R', K5.bbox.cx, K5.bbox.z0 - 0.5, 'z');
  links.push(['KC5R', 'REAR', 'KC5R-REAR']);

  const T1 = addRoom(rectRegion('T1', 'Temple', 'sacred entrance', back, zT - 6, 16, 12, 8.5));
  const TR1 = addCon(rectRegion('TR1', 'Temple', 'Rear temple approach', T1.bbox.cx - 3, T1.bbox.z1, 6, REAR.bbox.z0 - T1.bbox.z1, 6, 'corridor'));
  door('T1-TR1', 'T1', 'TR1', T1.bbox.cx, T1.bbox.z1 + 0.5, 'z');
  links.push(['TR1', 'REAR', 'TR1-REAR']);
  const T2 = addRoom(rectRegion('T2', 'Temple', 'purification hall', T1.bbox.x1 + 7, zT - 8, 20, 16, 8));
  const TC12 = addCon(rectRegion('TC12', 'Temple', 'Temple corridor', T1.bbox.x1, zT - 3, T2.bbox.x0 - T1.bbox.x1, 6, 6, 'corridor'));
  door('T1-TC12', 'T1', 'TC12', T1.bbox.x1 + 0.5, zT, 'x');
  door('TC12-T2', 'TC12', 'T2', T2.bbox.x0 - 0.5, zT, 'x');
  const T3 = addRoom(rectRegion('T3', 'Temple', 'sacred columns', T2.bbox.x1 + 6, zT - 12, 44, 24, 12));
  const TC23 = addCon(rectRegion('TC23', 'Temple', 'Temple corridor', T2.bbox.x1, zT - 3, T3.bbox.x0 - T2.bbox.x1, 6, 6, 'corridor'));
  door('T2-TC23', 'T2', 'TC23', T2.bbox.x1 + 0.5, zT, 'x');
  door('TC23-T3', 'TC23', 'T3', T3.bbox.x0 - 0.5, zT, 'x');
  const T4 = addRoom(rectRegion('T4', 'Temple', 'holy sanctuary', T3.bbox.x1 + 6, zT - 10, 24, 20, 10));
  const TC34 = addCon(rectRegion('TC34', 'Temple', 'Sanctuary corridor', T3.bbox.x1, zT - 3, T4.bbox.x0 - T3.bbox.x1, 6, 6, 'corridor'));
  door('T3-TC34', 'T3', 'TC34', T3.bbox.x1 + 0.5, zT, 'x');
  door('TC34-T4', 'TC34', 'T4', T4.bbox.x0 - 0.5, zT, 'x');
  const T5 = addRoom(rectRegion('T5', 'Temple', 'offering room', T3.bbox.cx - 9, T3.bbox.z1 + 7, 18, 14, 5.5));
  const TC5 = addCon(rectRegion('TC5', 'Temple', 'Offering side passage', T3.bbox.cx - 3, T3.bbox.z1, 6, T5.bbox.z0 - T3.bbox.z1, 6, 'corridor'));
  door('T3-TC5', 'T3', 'TC5', T3.bbox.cx, T3.bbox.z1 + 0.5, 'z');
  door('TC5-T5', 'TC5', 'T5', T3.bbox.cx, T5.bbox.z0 - 0.5, 'z');

  const L1 = addRoom(rectRegion('L1', 'Library', 'great library', back, zL - 13, 40, 26, 11));
  const L2 = addRoom(rectRegion('L2', 'Library', 'archive', back + 5, L1.bbox.z0 - 21, 18, 14, 5.5));
  const LC2 = addCon(rectRegion('LC2', 'Library', 'Archive corridor', L2.bbox.cx - 3, L2.bbox.z1, 6, L1.bbox.z0 - L2.bbox.z1, 6, 'corridor'));
  door('L1-LC2', 'L1', 'LC2', L2.bbox.cx, L1.bbox.z0 - 0.5, 'z');
  door('LC2-L2', 'LC2', 'L2', L2.bbox.cx, L2.bbox.z1 + 0.5, 'z');
  const L3 = addRoom(rectRegion('L3', 'Library', 'scribes room', back + 30, L1.bbox.z0 - 21, 20, 14, 5.5));
  const LC3 = addCon(rectRegion('LC3', 'Library', 'Scribes corridor', L3.bbox.cx - 3, L3.bbox.z1, 6, L1.bbox.z0 - L3.bbox.z1, 6, 'corridor'));
  door('L1-LC3', 'L1', 'LC3', L3.bbox.cx, L1.bbox.z0 - 0.5, 'z');
  door('LC3-L3', 'LC3', 'L3', L3.bbox.cx, L3.bbox.z1 + 0.5, 'z');
  const L4 = addRoom(circleRegion('L4', 'Library', 'observatory', L1.bbox.x1 + 18, zL, 12, 32, 11));
  const LC4 = addCon(rectRegion('LC4', 'Library', 'Observatory opening', L1.bbox.x1, zL - 3, L4.bbox.x0 - L1.bbox.x1 + 1, 6, 6, 'corridor'));
  door('L1-LC4', 'L1', 'LC4', L1.bbox.x1 + 0.5, zL, 'x');
  door('LC4-L4', 'LC4', 'L4', L4.bbox.x0 + 0.5, zL, 'x', 6, 'opening');

  const MP1 = addCon(rectRegion('MP1', 'Shared', 'Moon Passage', T4.bbox.cx - 3, zL - 3, 6, T4.bbox.z0 - zL + 3, 6, 'corridor'));
  const MP2 = addCon(rectRegion('MP2', 'Shared', 'Moon Passage', L4.bbox.x1 - 1, zL - 3, T4.bbox.cx - L4.bbox.x1 + 4, 6, 6, 'corridor'));
  links.push(['MP1', 'MP2', 'MP1-MP2']);
  door('T4-MP1', 'T4', 'MP1', T4.bbox.cx, T4.bbox.z0 - 0.5, 'z');
  door('MP2-L4', 'MP2', 'L4', L4.bbox.x1 - 0.5, zL, 'x', 6, 'opening');

  doors.unshift(
    { id: 'PalaceL3', from: 'Palace', to: 'K1', x: passages.L2.position[0], z: zK, axis: 'x', width: passages.L2.width, height: passages.L2.height, kind: 'arch' },
    { id: 'PalaceR3', from: 'Palace', to: 'T1', x: passages.R2.position[0], z: zT, axis: 'x', width: passages.R2.width, height: passages.R2.height, kind: 'arch' },
    { id: 'PalaceR1', from: 'Palace', to: 'L1', x: passages.R0.position[0], z: zL, axis: 'x', width: passages.R0.width, height: passages.R0.height, kind: 'arch' }
  );
  return { rooms, connectors, doors, links, back };
}
