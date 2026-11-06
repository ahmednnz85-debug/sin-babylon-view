export function boundsOf(entity) {
  const chain = [];
  let node = entity.parent;
  while (node) {
    chain.push(node);
    node = node.parent;
  }
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const parent = chain[i];
    if (parent._dirtyLocal || parent._dirtyWorld) parent._sync();
  }
  entity.syncHierarchy();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const renders = entity.findComponents('render') || [];
  for (const render of renders) {
    if (render.enabled === false) continue;
    for (const mi of render.meshInstances) {
      if (mi.node) mi.node._aabbVer = (mi.node._aabbVer || 0) + 1;
      mi._updateAabb = true;
      const box = mi.aabb;
      if (!box || !box.center || !box.halfExtents) continue;
      const c = box.center;
      const h = box.halfExtents;
      minX = Math.min(minX, c.x - h.x);
      minY = Math.min(minY, c.y - h.y);
      minZ = Math.min(minZ, c.z - h.z);
      maxX = Math.max(maxX, c.x + h.x);
      maxY = Math.max(maxY, c.y + h.y);
      maxZ = Math.max(maxZ, c.z + h.z);
    }
  }
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    sx: maxX - minX, sy: maxY - minY, sz: maxZ - minZ,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, cz: (minZ + maxZ) / 2
  };
}

export function yaw(entity, radians) {
  entity.setEulerAngles(0, radians * 180 / Math.PI, 0);
}

// Shift an unparented, unrotated entity so its bottom sits on Y=0 and its XZ center on the origin.
export function recenterBottom(entity) {
  const b = boundsOf(entity);
  const p = entity.getLocalPosition();
  entity.setLocalPosition(p.x - b.cx, p.y - b.minY, p.z - b.cz);
  return boundsOf(entity);
}
