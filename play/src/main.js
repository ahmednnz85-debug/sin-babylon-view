import * as pc from '../vendor/playcanvas.mjs';
import { createRegistry } from './registry.js';
import { buildCity, buildRoyalDoor, setCityQuality, addCityCircle, resetCityCircles, cityCircles } from './city.js';
import { buildHall } from './hall.js';
import { buildWings } from './wings.js';
import { DOOR_URL } from './paths.js';
import { boundsOf } from './fit.js';
import { buildGround } from './grass.js';
import { buildVegetation, updateVegetation } from './grove.js';
import { carveDoor, indexShell, interiorVolume } from './shell.js';

const {
  Application,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  StandardMaterial,
  TONEMAP_ACES,
  Vec2,
  Vec3
} = pc;

const ASSET = '/sin-babylon-view/original/assets/';
const HERO_FILE = '\u200e\u2068\u0633\u064a\u0646_\u0648\u0642\u0648\u0641_\u0633\u0627\u0643\u0646_\u0633\u064a\u0646\u0645\u0627\u064a\u0654\u064a\u2069.glb';
const HERO_URL = ASSET + encodeURIComponent(HERO_FILE).replace(/%2F/g, '/');
const PAL = { s: 56, z: 186, x: 5.6, ry: Math.PI / 2 };
const PL_Z0 = 76;
const PL_FRONT = PAL.z - 0.4586 * PAL.s - 0.1;
const PL_PATH_W = 12;
const PL_MED = 24;
const PL_MED_Z = PL_FRONT - 14;
const PL_POOL0 = 91;
const PL_POOL1 = 115;
const PAL_BOX = {
  x0: PAL.x - 0.5 * PAL.s - 2,
  x1: PAL.x + 0.5 * PAL.s + 2,
  z0: PAL.z - 0.47 * PAL.s - 3,
  z1: PAL.z + 0.47 * PAL.s + 3
};
const GATE_S = 16 / 0.502;
const GATE_HD = 0.197 * GATE_S;
const GATE_HW = 0.5 * GATE_S;
const PASS = 1.35;
const CAM_LOOK = 1.18;
const CAM_DIST = 3.45;
const CAM_PITCH = 0.22;
const WALK = 1.7;
const RUN = 7.15;

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const app = new Application(canvas, {
  graphicsDeviceOptions: { antialias: true, alpha: false, preserveDrawingBuffer: true }
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();

const registry = createRegistry(app);
const world = new Entity('world');
app.root.addChild(world);

const camera = new Entity('camera');
camera.addComponent('camera', {
  clearColor: new Color(0.2373, 0.1285, 0.0522),
  fov: 42,
  nearClip: 0.1,
  farClip: 3000
});
camera.camera.toneMapping = TONEMAP_ACES;
app.root.addChild(camera);

const sun = new Entity('sun');
sun.addComponent('light', {
  type: 'directional',
  color: new Color(1, 0.70, 0.38),
  intensity: 3.6,
  castShadows: true,
  shadowResolution: 2048,
  shadowDistance: 90
});
app.root.addChild(sun);
const fill = new Entity('fill');
fill.addComponent('light', {
  type: 'directional',
  color: new Color(0.32, 0.55, 0.85),
  intensity: 0.55,
  castShadows: false
});
app.root.addChild(fill);
const skyDown = new Entity('skyDown');
skyDown.addComponent('light', {
  type: 'directional',
  color: new Color(0.40, 0.60, 0.82),
  intensity: 0.9,
  castShadows: false
});
app.root.addChild(skyDown);
app.scene.ambientLight = new Color(0.9 * 0.5 * (0.40 + 0.56), 0.9 * 0.5 * (0.60 + 0.38), 0.9 * 0.5 * (0.82 + 0.20));
app.scene.exposure = 1.1;
app.scene.fog.type = 'exp2';
app.scene.fog.color = new Color(0.2373, 0.1285, 0.0522);
app.scene.fog.density = 0.0062;

const SUN0 = new Vec3(-0.45, 0.3, -0.84).normalize();
const SKY_THETA = Math.atan2(SUN0.z, SUN0.x);
const SKY_ROT = 0.3825 - 0.5 - SKY_THETA / (2 * Math.PI);
const SUN_EL = 0.1527;
const sunFlat = Math.cos(SUN_EL);
const SUN = new Vec3(sunFlat * Math.cos(SKY_THETA), Math.sin(SUN_EL), sunFlat * Math.sin(SKY_THETA));
let high = localStorage.getItem('sin-pc-quality') !== 'low';
let playing = false;
let hero = null;
let heroYaw = 0;
let yaw = 0;
let pitch = CAM_PITCH;
let dist = CAM_DIST;
let speed = 0;
const keys = new Set();
const stick = { x: 0, y: 0, run: false };
const zones = { avenue: 'idle', palace: 'idle', interior: 'idle' };
const zoneRoots = { avenue: null, palace: null };
let palaceHeld = false;
let interiorHeld = false;
let interiorRoot = null;
const interiorUrls = [];
let portal = null;
let doorRig = null;
let shell = null;
let interiorVol = null;
let groundY = 0;
const KNOWN_HERO_CLIPS = [
  'walk_relaxed',
  'climb_ladder_up',
  'push_object',
  'monstertransformation_quaternius',
  'bandage_loop_quaternius',
  'push_enter_quaternius',
  'idle_impatient',
  'sprint_loop_quaternius',
  'walk_casual'
];
const clipByName = new Map();
let animState = 'idle';
let holdCam = false;
let skyRoot = null;

function setStatus(text, ratio) {
  $('status').textContent = text;
  if (ratio != null) $('fill').style.width = Math.round(ratio * 100) + '%';
}

function applyQuality() {
  $('qual').textContent = high ? 'الجودة: عالية' : 'الجودة: منخفضة';
  const light = sun.light;
  light.castShadows = high;
  light.shadowResolution = high ? 2048 : 1024;
  app.graphicsDevice.maxPixelRatio = 1;
  setCityQuality(high);
}

function resize() {
  app.resizeCanvas();
  const portrait = window.innerHeight > window.innerWidth + 8;
  document.documentElement.classList.toggle('portrait-lock', portrait);
}

addEventListener('resize', resize);
resize();
applyQuality();

$('qual').onclick = () => {
  high = !high;
  localStorage.setItem('sin-pc-quality', high ? 'high' : 'low');
  applyQuality();
};

function bindInput() {
  const touch = document.body;
  const stickEl = $('stick');
  const knob = $('knob');
  let sid = null;
  let cid = null;
  let lx = 0;
  let ly = 0;
  const sens = 0.005;
  touch.addEventListener('pointerdown', (e) => {
    if (!playing) return;
    const r = stickEl.getBoundingClientRect();
    if (sid === null && e.clientX < window.innerWidth * 0.48) {
      sid = e.pointerId;
    } else if (cid === null) {
      cid = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    }
    if (e.pointerId === sid) moveStick(e, r, knob);
  });
  touch.addEventListener('pointermove', (e) => {
    if (e.pointerId === sid) moveStick(e, stickEl.getBoundingClientRect(), knob);
    else if (e.pointerId === cid) {
      yaw -= (e.clientX - lx) * sens;
      pitch = Math.max(-0.1, Math.min(1.1, pitch + (e.clientY - ly) * sens * 0.8));
      lx = e.clientX;
      ly = e.clientY;
    }
  });
  const up = (e) => {
    if (e.pointerId === sid) {
      sid = null;
      stick.x = 0;
      stick.y = 0;
      knob.style.left = '32px';
      knob.style.top = '32px';
    }
    if (e.pointerId === cid) cid = null;
  };
  touch.addEventListener('pointerup', up);
  touch.addEventListener('pointercancel', up);
  $('run').addEventListener('pointerdown', (e) => { e.preventDefault(); stick.run = true; });
  const endRun = () => { stick.run = false; };
  $('run').addEventListener('pointerup', endRun);
  $('run').addEventListener('pointercancel', endRun);
  addEventListener('keydown', (e) => keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); stick.x = stick.y = 0; stick.run = false; });
}

function moveStick(e, r, knob) {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const max = r.width * 0.36;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy) || 1;
  if (len > max) { dx *= max / len; dy *= max / len; }
  stick.x = dx / max;
  stick.y = -dy / max;
  knob.style.left = (32 + dx * 0.7) + 'px';
  knob.style.top = (32 + dy * 0.7) + 'px';
}

async function placeContainer(url, parent, configure) {
  const asset = await registry.retain(url, 'container');
  const entity = asset.resource.instantiateRenderEntity({ castShadows: false });
  parent.addChild(entity);
  if (configure) configure(entity, asset);
  return { asset, entity };
}

function groundFromEntity(entity) {
  entity.syncHierarchy();
  let minY = Infinity;
  const renders = entity.findComponents('render') || [];
  for (const render of renders) {
    for (const mi of render.meshInstances) {
      const box = mi.aabb;
      minY = Math.min(minY, box.center.y - box.halfExtents.y);
    }
  }
  return Number.isFinite(minY) ? minY : 0;
}

async function texturedPlane(url, w, d, x, z, y, color, repeatX, repeatY, rough) {
  const asset = await registry.retain(url, 'texture');
  const tex = asset.resource;
  const mat = new StandardMaterial();
  mat.diffuseMap = tex;
  mat.diffuse = color;
  mat.roughness = rough == null ? 0.9 : rough;
  mat.metalness = 0;
  mat.useMetalness = true;
  if (repeatX) {
    tex.addressU = pc.ADDRESS_REPEAT;
    tex.addressV = pc.ADDRESS_REPEAT;
    mat.diffuseMapTiling = new Vec2(repeatX, repeatY || 1);
  }
  mat.update();
  const ent = new Entity(url);
  ent.addComponent('render', { type: 'plane', material: mat });
  ent.setLocalScale(w, 1, d);
  ent.setPosition(x, y, z);
  return ent;
}

async function buildAvenue() {
  zones.avenue = 'loading';
  resetCityCircles();
  const root = new Entity('avenue');
  world.addChild(root);
  zoneRoots.avenue = root;
  setStatus('جارٍ تحميل الأرض والساحة…', 0.25);
  const grass = await buildGround(registry);
  root.addChild(grass);
  const stone = '/sin-babylon-view/play/embedded/road-stone.jpg';
  root.addChild(await texturedPlane(stone, 9, 160, 0, 0, 0.02, new Color(1, 1, 1), 3, 53, 0.9));
  const tileX = 9 / 3;
  const tileZ = 160 / 53;
  const slabW = 9.08;
  const z0 = -8.55;
  const z1 = 8.45;
  const slabD = z1 - z0;
  const cz = (z0 + z1) / 2;
  const gateFloor = await texturedPlane(stone, slabW, slabD, 0, cz, 0.06, new Color(1, 1, 1), slabW / tileX, slabD / tileZ, 0.9);
  const gateMat = gateFloor.render.meshInstances[0].material;
  gateMat.diffuseMapOffset = new Vec2((-slabW / 2 + 4.5) / tileX, (80 - (cz + slabD / 2)) / tileZ);
  gateMat.update();
  root.addChild(gateFloor);
  const panel = await texturedPlane('/sin-babylon-view/play/embedded/gate-panel.jpg', 8.4, 8.4, 0, -17, 0.04, new Color(1, 1, 1), 1, 1, 0.85);
  panel.setEulerAngles(0, 180, 0);
  root.addChild(panel);
  const L = PL_FRONT - PL_Z0;
  root.addChild(await texturedPlane(ASSET + 'plaza_stone.jpg', 64, L, 0, PL_Z0 + L / 2, 0.02, new Color(0.80, 0.76, 0.68), 64 / 4.5, L / 4.5, 0.92));
  const zA = 79;
  const zB = PL_MED_Z - PL_MED / 2 + 0.3;
  root.addChild(await texturedPlane(ASSET + 'plaza_paving.jpg', PL_PATH_W, zB - zA, 0, (zA + zB) / 2, 0.03, new Color(0.82, 0.78, 0.69), 1, (zB - zA) / PL_PATH_W, 0.9));
  root.addChild(await texturedPlane(ASSET + 'plaza_mosaic.jpg', PL_MED, PL_MED, 0, PL_MED_Z, 0.04, new Color(0.85, 0.81, 0.73), 1, 1, 0.85));
  root.addChild(await texturedPlane(ASSET + 'canal_water.jpg', 5, 24, -14.5, 103, 0.2, new Color(1, 1, 1)));
  root.addChild(await texturedPlane(ASSET + 'canal_water.jpg', 5, 24, 14.5, 103, 0.2, new Color(1, 1, 1)));

  setStatus('جارٍ تحميل النخيل…', 0.55);
  const palmUrl = ASSET + 'palm.glb';
  const palmAsset = await registry.retain(palmUrl, 'container');
  const probe = palmAsset.resource.instantiateRenderEntity();
  root.addChild(probe);
  probe.setLocalScale(1, 1, 1);
  const baseMin = groundFromEntity(probe);
  const baseHeight = (() => {
    let maxY = -Infinity;
    for (const render of probe.findComponents('render') || []) {
      for (const mi of render.meshInstances) maxY = Math.max(maxY, mi.aabb.center.y + mi.aabb.halfExtents.y);
    }
    return Math.max(0.01, maxY - baseMin);
  })();
  probe.destroy();
  const PALM_X = 7.9;
  const PALM_STEP = 8;
  const PALM_H = 9.4;
  const STATUE_Z = 121;
  const start = 78.4;
  const end = PL_FRONT - 1;
  for (let k = -40; k <= 40; k += 1) {
    const z = STATUE_Z + (k + 0.5) * PALM_STEP;
    if (z < start + 2.5 || z > end - 1.5) continue;
    for (const side of [-1, 1]) {
      const ent = palmAsset.resource.instantiateRenderEntity();
      const sc = PALM_H / baseHeight;
      ent.setLocalScale(sc, sc, sc);
      ent.setLocalPosition(0, -baseMin * sc, 0);
      const g = new Entity('palm');
      g.addChild(ent);
      g.setPosition(side * PALM_X, 0, z);
      root.addChild(g);
      addCityCircle(side * PALM_X, z, 0.85);
    }
  }
  setStatus('جارٍ تركيب البوابة والسوق…', 0.7);
  await buildCity(registry, root);
  zones.avenue = 'ready';
  if (window.__shotInteriorOnly) {
    window.__vegGaps = ['لقطة الداخل تخطت البستان حتى لا يمتلئ ذاكرة الرسوم أثناء التصوير.'];
    window.__groveOld = 0;
    return;
  }
  setStatus('جارٍ غرس البستان…', 0.85);
    const veg = await buildVegetation(app, registry, root);
    window.__vegGaps = veg.gaps;
    window.__groveOld = veg.old;
}

function armHero(asset) {
  const model = asset.resource.instantiateRenderEntity({ castShadows: false });
  const hs = 1.85;
  model.setLocalScale(hs, hs, hs);
  const sole = groundFromEntity(model);
  model.setLocalPosition(0, -sole, 0);
  hero = new Entity('hero');
  hero.addChild(model);
  hero.setPosition(0, 0, -30);
  world.addChild(hero);
  const anims = asset.resource.animations || [];
  hero.addComponent('anim', { activate: true });
  let i = 0;
  for (const animAsset of anims) {
    const track = animAsset.resource;
    const fromTrack = track?.name && !String(track.name).includes('/') ? track.name : '';
    const name = fromTrack || (anims.length === KNOWN_HERO_CLIPS.length ? KNOWN_HERO_CLIPS[i] : '');
    i += 1;
    if (!name || !track) continue;
    clipByName.set(name, track);
    const loop = name === 'idle_impatient' || name === 'walk_casual' || name === 'walk_relaxed' || name === 'sprint_loop_quaternius' || name === 'bandage_loop_quaternius';
    const speed = name === 'walk_casual' ? 1.5 : 1;
    try { hero.anim.assignAnimation(name, track, undefined, speed, loop); } catch (err) { console.warn(name, err); }
  }
  playAnim('idle_impatient');
}

function playAnim(name) {
  if (!hero?.anim || !clipByName.has(name) || animState === name) return;
  try {
    hero.anim.baseLayer.transition(name, 0.12);
    animState = name;
  } catch (err) {
    console.warn('anim', name, err);
  }
}

let streamLock = 0;

async function ensurePalace() {
  if (palaceHeld || zones.palace === 'loading' || zones.palace === 'ready') return;
  zones.palace = 'loading';
  streamLock += 1;
  try {
    const root = new Entity('palace');
    world.addChild(root);
    zoneRoots.palace = root;
    const { entity } = await placeContainer(ASSET + 'palace.glb', root, (ent) => {
      ent.setLocalScale(PAL.s, PAL.s, PAL.s);
    });
    const minY = groundFromEntity(entity);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const render of entity.findComponents('render') || []) {
      for (const mi of render.meshInstances) {
        const c = mi.aabb.center;
        const h = mi.aabb.halfExtents;
        minX = Math.min(minX, c.x - h.x);
        maxX = Math.max(maxX, c.x + h.x);
        minZ = Math.min(minZ, c.z - h.z);
        maxZ = Math.max(maxZ, c.z + h.z);
      }
    }
    entity.setLocalPosition(-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2);
    root.setEulerAngles(0, PAL.ry * 180 / Math.PI, 0);
    root.setPosition(PAL.x, 0, PAL.z);
    calmPalaceMetals(entity);
    palaceHeld = true;
    zones.palace = 'ready';
    const door = await buildRoyalDoor(registry, world);
    doorRig = door;
    window.__door = door;
    const hb = boundsOf(hero);
    portal = { x: 1, y: door.floorY, z: door.frontZ, H: Math.max(1.2, hb.sy), doorWidth: door.width };
    const carved = carveDoor(root, door.frontZ);
    window.__doorHole = carved;
    shell = indexShell(root);
    window.__shellTris = shell.triangles;
  } catch (err) {
    zones.palace = 'error';
    console.error(err);
  } finally {
    streamLock -= 1;
  }
}

function calmPalaceMetals(root) {
  for (const render of root.findComponents('render') || []) {
    for (const mi of render.meshInstances || []) {
      const material = mi.material;
      if (!material || material.metalness == null) continue;
      if ((material.metalness || 0) > 0.35 || material.metalnessMap) {
        material.metalness = Math.min(material.metalness || 0, 0.22);
        material.metalnessMap = null;
        material.update();
      }
    }
  }
}

function freeOwnedMaterials(root) {
  if (!root) return 0;
  const seen = new Set();
  let n = 0;
  for (const render of root.findComponents('render') || []) {
    for (const mi of render.meshInstances || []) {
      const material = mi.material;
      if (!material || !material._sinOwned || seen.has(material)) continue;
      seen.add(material);
      try { material.destroy(); n += 1; } catch (err) { console.warn('material', err); }
    }
  }
  return n;
}

function releaseInterior() {
  if (!interiorHeld && zones.interior !== 'ready') return;
  const meshes = (window.__fireMeshes || []).concat(window.__wingMeshes || []);
  window.__fireMeshes = null;
  window.__fireMats = null;
  window.__wingMeshes = null;
  window.__wingBlock = null;
  interiorVol = null;
  const freed = freeOwnedMaterials(interiorRoot);
  interiorRoot?.destroy();
  for (const mesh of meshes) {
    try { mesh.destroy(); } catch (err) { console.warn('mesh', err); }
  }
  interiorRoot = null;
  for (const url of interiorUrls) registry.release(url);
  interiorUrls.length = 0;
  interiorHeld = false;
  zones.interior = 'released';
  window.__lastFreedMaterials = freed;
}

async function ensureInterior() {
  if (interiorHeld || zones.interior === 'loading' || zones.interior === 'ready') return;
  if (!palaceHeld) await ensurePalace();
  if (!portal) return;
  zones.interior = 'loading';
  streamLock += 1;
  try {
    const hall = await buildHall(registry, interiorUrls, world, portal);
    let wings = { gaps: [], rooms: [] };
    try {
      wings = await buildWings(registry, interiorUrls, hall.root, hall.metrics);
    } catch (err) {
      wings = { gaps: ['تعذّر إكمال الأجنحة: ' + (err && err.message ? err.message : err)], rooms: [] };
      console.error(err);
    }
    interiorRoot = hall.root;
    interiorHeld = true;
    zones.interior = 'ready';
    interiorVol = interiorVolume(portal, {
      boxes: hall.boxes,
      ramp: hall.ramp,
      H: hall.metrics.H,
      width: hall.metrics.width,
      length: hall.metrics.length
    }, wings);
    window.__wingMeshes = wings.meshes || [];
    window.__gaps = (hall.gaps || []).concat(wings.gaps || []);
    window.__hall = { ...hall.metrics, rooms: wings.rooms, boxes: (hall.boxes || []).length, wingBoxes: (wings.boxes || []).length };
    window.__shellTris = shell ? shell.triangles : 0;
  } catch (err) {
    zones.interior = 'error';
    console.error(err);
    window.__gaps = [String(err && err.stack ? err.stack : err)];
  } finally {
    streamLock -= 1;
  }
}

function releasePalace() {
  releaseInterior();
  if (!palaceHeld && zones.palace !== 'ready') return;
  doorRig?.entity?.destroy();
  doorRig = null;
  zoneRoots.palace?.destroy();
  zoneRoots.palace = null;
  registry.release(ASSET + 'palace.glb');
  registry.release(DOOR_URL);
  palaceHeld = false;
  portal = null;
  shell = null;
  zones.palace = 'released';
}

function readMove() {
  let fw = stick.y;
  let st = stick.x;
  let run = stick.run;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fw += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fw -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) st += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) st -= 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) run = true;
  if (keys.has('KeyQ')) yaw += 0;
  return { fw, st, run };
}

function syncExteriorShell() {
  if (!hero) return;
  const p = hero.getPosition();
  const inside = !!(portal && interiorVol && interiorVol.owns(p.x, p.z) && p.z > portal.z + 0.4);
  if (zoneRoots.palace) zoneRoots.palace.enabled = !inside;
  if (zoneRoots.avenue) zoneRoots.avenue.enabled = !inside;
  window.__shellHidden = inside;
}

function palGround(x, z, y0) {
  if (!shell || x < PAL_BOX.x0 || x > PAL_BOX.x1 || z < PAL_BOX.z0 || z > PAL_BOX.z1) return 0;
  return shell.ground(x, z, y0);
}

function palaceBlocked(x, z) {
  if (doorRig && (doorRig.open() || doorRig.passing())) {
    const portalDoor = doorRig.portal();
    if (Math.abs(x - portalDoor.x) < portalDoor.width * 0.48 && z > portalDoor.frontZ - 0.35 && z < portalDoor.frontZ + 9) return false;
  }
  if (z > PL_Z0 + 2 && Math.abs(x) > 50) return true;
  if (z > PAL.z + 32) return true;
  if (z > PL_POOL0 && z < PL_POOL1 && Math.abs(x) > 10.4 && Math.abs(x) < 18) return true;
  const p = hero.getPosition();
  if (shell && shell.wallAhead(p.x, p.y, p.z, x, z)) return true;
  return palGround(x, z, p.y) - p.y > 0.6;
}

function blocked(x, z) {
  if (interiorVol && interiorVol.owns(x, z)) return interiorVol.blocks(x, z);
  if (doorRig && doorRig.blocks(x, z)) return true;
  if (palaceHeld && palaceBlocked(x, z)) return true;
  if (Math.abs(z) < GATE_HD + 0.4 && Math.abs(x) > PASS && Math.abs(x) < GATE_HW + 0.3) return true;
  const list = cityCircles();
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    const dx = x - c[0];
    const dz = z - c[1];
    if (dx * dx + dz * dz < c[2] * c[2]) return true;
  }
  return false;
}

function applyGround(frame) {
  const p = hero.getPosition();
  const inside = interiorVol && interiorVol.owns(p.x, p.z);
  const gy = inside ? interiorVol.y(p.x, p.z) : palGround(p.x, p.z, p.y);
  groundY += (gy - groundY) * Math.min(1, frame * (inside ? 8 : 12));
  hero.setPosition(p.x, groundY, p.z);
}

let last = 0;
let fpsEma = 0;
let frames = 0;
let fps = 0;
let acc = 0;
app.on('update', (dt) => {
  const now = performance.now();
  const frame = Math.min(0.05, Math.max(0.001, (now - last) / 1000 || dt));
  last = now;
  frames += 1;
  acc += frame;
  if (acc >= 0.5) {
    fps = frames / acc;
    frames = 0;
    acc = 0;
    fpsEma = fpsEma ? fpsEma * 0.7 + fps * 0.3 : fps;
  }
  if (skyRoot) {
    const c = camera.getPosition();
    skyRoot.setPosition(c.x, c.y, c.z);
  }
  updateVegetation(camera.getPosition(), high);
  syncExteriorShell();
  const fireMats = window.__fireMats;
  if (fireMats) {
    const t = now / 1000;
    for (const material of fireMats) {
      try { material.setParameter('uTime', t); } catch (err) { /* shader not ready */ }
    }
  }
  if (!playing || !hero || holdCam || document.documentElement.classList.contains('portrait-lock')) {
    paintStats(frame);
    return;
  }
  if (keys.has('KeyQ')) yaw += frame * 1.8;
  if (keys.has('KeyE')) yaw -= frame * 1.8;
  const { fw, st, run } = readMove();
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const pushFrac = () => {
    const layer = hero.anim && hero.anim.baseLayer;
    if (!layer) return 0;
    const dur = layer.activeStateDuration || 0;
    return dur > 0 ? layer.activeStateCurrentTime / dur : 0;
  };
  const doorState = doorRig ? doorRig.update(frame, hero, () => playAnim('push_object'), pushFrac) : null;
  if (doorState && doorState.yaw != null) {
    heroYaw = doorState.yaw;
    yaw = doorState.yaw;
    hero.setEulerAngles(0, 0, 0);
  }
  if (!(doorState && doorState.lock)) {
    let mx = sy * fw - cy * st;
    let mz = cy * fw + sy * st;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.1;
    speed = 0;
    if (moving) {
      mx /= len;
      mz /= len;
      const sp = run ? RUN : WALK;
      speed = sp;
      const p = hero.getPosition();
      let nx = p.x + mx * sp * frame;
      if (blocked(nx, p.z)) nx = p.x;
      let nz = p.z + mz * sp * frame;
      if (blocked(nx, nz)) nz = p.z;
      hero.setPosition(nx, p.y, nz);
      let d = Math.atan2(mx, mz) - heroYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heroYaw += d * Math.min(1, frame * 10);
      hero.setEulerAngles(0, heroYaw * 180 / Math.PI, 0);
      playAnim(run ? 'sprint_loop_quaternius' : 'walk_casual');
    } else {
      playAnim('idle_impatient');
    }
  }
  applyGround(frame);
  const z = hero.getPosition().z;
  if (z > 10) ensurePalace();
  if (portal && z > portal.z - 30) ensureInterior();
  if (portal && z < portal.z - 90 && interiorHeld) releaseInterior();
  if (z < -20 && palaceHeld && streamLock === 0) releasePalace();
  const pos = hero.getPosition();
  const cp = Math.cos(pitch);
  const hx = pos.x;
  const hy = pos.y + CAM_LOOK;
  const hz = pos.z;
  camera.setPosition(hx - Math.sin(yaw) * cp * dist, hy + Math.sin(pitch) * dist, hz - Math.cos(yaw) * cp * dist);
  camera.lookAt(hx, hy, hz);
  sun.setPosition(hx + SUN.x * 80, hy + SUN.y * 80, hz + SUN.z * 80);
  sun.lookAt(hx, hy, hz);
  fill.setPosition(hx - SUN.x * 60, 38, hz - SUN.z * 60);
  fill.lookAt(hx, hy, hz);
  skyDown.setPosition(hx, hy + 48, hz);
  skyDown.lookAt(hx, hy, hz);
  paintStats(frame);
});

function paintStats(frame) {
  const el = $('stats');
  if (!el || el.style.display === 'none') return;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const draws = app.stats?.drawCalls?.total ?? app.stats?.drawCalls ?? '—';
  el.textContent = [
    'FPS ' + fpsEma.toFixed(1) + '  إطار ' + (frame * 1000).toFixed(1) + ' ms',
    'المناطق: الشارع ' + zones.avenue + ' / القصر ' + zones.palace + ' / الداخل ' + zones.interior,
    'أصول مثبتة ' + registry.snapshot().filter((r) => r.ready).length,
    'Draw ' + draws + (heap == null ? '' : '  JS ' + heap + ' MB'),
    'الحركات: ' + [...clipByName.keys()].join('، ')
  ].join('\n');
}

window.__app = app;
window.__hero = () => hero;
window.__controlsTest = {
  getYaw: () => heroYaw,
  getSpeed: () => speed,
  getPos: () => {
    const p = hero ? hero.getPosition() : { x: 0, y: 0, z: 0 };
    return { x: p.x, z: p.z };
  },
  setKeys: (codes) => {
    keys.clear();
    for (const code of codes || []) keys.add(code);
  }
};
window.__physics = {
  ground: (x, z, y) => palGround(x, z, y == null ? 0 : y),
  blocked: (x, z) => blocked(x, z),
  place: (x, y, z) => {
    if (!hero) return;
    hero.setPosition(x, y, z);
    groundY = y;
  },
  owns: (x, z) => !!(interiorVol && interiorVol.owns(x, z)),
  floor: (x, z) => (interiorVol ? interiorVol.y(x, z) : 0),
  circles: () => cityCircles().length
};
window.__look = (x, y, z, tx, ty, tz) => {
  holdCam = true;
  camera.setPosition(x, y, z);
  camera.lookAt(tx, ty, tz);
  if (skyRoot) skyRoot.setPosition(x, y, z);
  const p = hero ? hero.getPosition() : { x: (x + tx) * 0.5, y: 0, z: (z + tz) * 0.5 };
  const hy = p.y + CAM_LOOK;
  sun.setPosition(p.x + SUN.x * 80, hy + SUN.y * 80, p.z + SUN.z * 80);
  sun.lookAt(p.x, hy, p.z);
  fill.setPosition(p.x - SUN.x * 60, 38, p.z - SUN.z * 60);
  fill.lookAt(p.x, hy, p.z);
  skyDown.setPosition(p.x, hy + 48, p.z);
  skyDown.lookAt(p.x, p.y, p.z);
};
window.__shot = () => new Promise((resolve) => {
  app.renderNextFrame = true;
  app.once('frameend', () => {
    const p = camera.getPosition();
    resolve({
      cam: { x: p.x, y: p.y, z: p.z },
      url: canvas.toDataURL('image/jpeg', 0.62)
    });
  });
});
window.__avenue = (on) => {
  if (zoneRoots.avenue) zoneRoots.avenue.enabled = !!on;
};
window.__mem = {
  zones: () => ({ ...zones }),
  assets: () => registry.snapshot(),
  fps: () => fpsEma,
  releasePalace,
  ensurePalace,
  ensureInterior,
  releaseInterior,
  portal: () => portal,
  sample: () => {
    const heap = performance.memory || {};
    const vram = app.graphicsDevice._vram || {};
    let gpu = null;
    try {
      const gl = app.graphicsDevice.gl;
      gpu = {
        available: gl.getParameter(0x9049),
        total: gl.getParameter(0x9048)
      };
      if (gpu.available == null && gpu.total == null) gpu = null;
    } catch (err) {
      gpu = null;
    }
    const rows = registry.snapshot();
    return {
      assetsReady: rows.filter((r) => r.ready).length,
      assetRecords: rows.length,
      zones: { ...zones },
      jsUsed: heap.usedJSHeapSize || null,
      jsTotal: heap.totalJSHeapSize || null,
      jsLimit: heap.jsHeapSizeLimit || null,
      vramTex: vram.tex || 0,
      vramVb: vram.vb || 0,
      vramIb: vram.ib || 0,
      vramUb: vram.ub || 0,
      gpu,
      fps: fpsEma,
      draws: app.stats?.drawCalls?.total ?? null
    };
  }
};
window.__cycle = async () => {
  const t0 = performance.now();
  await ensurePalace();
  const palaceMs = performance.now() - t0;
  const t1 = performance.now();
  await ensureInterior();
  const interiorMs = performance.now() - t1;
  const loaded = window.__mem.sample();
  releasePalace();
  if (window.gc) window.gc();
  const released = window.__mem.sample();
  return {
    palaceMs: Math.round(palaceMs),
    interiorMs: Math.round(interiorMs),
    loaded,
    released,
    freedMaterials: window.__lastFreedMaterials || 0,
    gaps: window.__gaps || []
  };
};

$('go').onclick = () => {
  playing = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !window.__audio) {
    try {
      window.__audio = new AC();
      window.__audio.resume();
    } catch (err) { window.__audio = null; }
  } else if (window.__audio) {
    window.__audio.resume();
  }
  $('load').style.display = 'none';
  $('stick').style.display = 'block';
  $('run').style.display = 'block';
  $('qual').style.display = 'block';
  $('stats').style.display = 'block';
};

function domeMesh(device, radius, rot) {
  const stacks = 18;
  const slices = 48;
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (let y = 0; y <= stacks; y += 1) {
    const v = y / stacks;
    const el = v * Math.PI / 2;
    const sy = Math.sin(el);
    const cy = Math.cos(el);
    for (let x = 0; x <= slices; x += 1) {
      const u = x / slices;
      const phi = (u - 0.5 - rot) * Math.PI * 2;
      pos.push(Math.cos(phi) * cy * radius, sy * radius, Math.sin(phi) * cy * radius);
      uv.push(u, v);
      nrm.push(0, -1, 0);
    }
  }
  const row = slices + 1;
  for (let y = 0; y < stacks; y += 1) {
    for (let x = 0; x < slices; x += 1) {
      const a = y * row + x;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const mesh = new Mesh(device);
  mesh.setPositions(pos);
  mesh.setNormals(nrm);
  mesh.setUvs(0, uv);
  mesh.setIndices(idx);
  mesh.update();
  return mesh;
}

function ringMesh(device, extra) {
  const R = 1100;
  const W = 5024;
  const H = 418;
  const YB = -18;
  const HGT = R * Math.PI * H / (W / 2);
  const start = -(728 / W) * 2 * Math.PI + extra;
  const N = 64;
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  const TOP = 1;
  for (let i = 0; i <= N; i += 1) {
    const u = i / N;
    const b = start + u * Math.PI;
    const x = -R * Math.sin(b);
    const z = R * Math.cos(b);
    pos.push(x, YB, z, x, YB + HGT, z);
    uv.push(u, 1, u, 0);
    nrm.push(0, 0, 1, 0, 0, 1);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const mesh = new Mesh(device);
  mesh.setPositions(pos);
  mesh.setNormals(nrm);
  mesh.setUvs(0, uv);
  mesh.setIndices(idx);
  mesh.update();
  return mesh;
}

async function buildSky() {
  const skyTex = (await registry.retain('/sin-babylon-view/play/embedded/sky.jpg', 'texture')).resource;
  skyTex.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  skyTex.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
  const skyMat = new StandardMaterial();
  skyMat.useLighting = false;
  skyMat.useFog = false;
  skyMat.emissiveMap = skyTex;
  skyMat.emissive = new Color(1, 1, 1);
  skyMat.diffuse = new Color(0, 0, 0);
  skyMat.cull = pc.CULLFACE_NONE;
  skyMat.depthWrite = false;
  skyMat.update();
  const sky = new Entity('SkyPhoto');
  const skyMi = new MeshInstance(domeMesh(app.graphicsDevice, 1400, SKY_ROT), skyMat);
  skyMi.cull = false;
  sky.addComponent('render', { meshInstances: [skyMi] });
  const ringMat = async (file) => {
    const tex = (await registry.retain('/sin-babylon-view/original/assets/' + file, 'texture')).resource;
    tex.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
    tex.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
    const mat = new StandardMaterial();
    mat.useLighting = false;
    mat.useFog = false;
    mat.emissiveMap = tex;
    mat.emissive = new Color(1, 1, 1);
    mat.diffuse = new Color(0, 0, 0);
    mat.opacity = 1;
    mat.blendType = pc.BLEND_NORMAL;
    mat.cull = pc.CULLFACE_NONE;
    mat.depthWrite = false;
    mat.chunks.opacityPS = `
uniform float material_opacity;
void getOpacity() {
  float v = 1.0 - {STD_EMISSIVE_TEXTURE_UV}.y;
  dAlpha = material_opacity * (1.0 - smoothstep(0.70, 0.95, v));
}
`;
    mat.update();
    return mat;
  };
  const a = new Entity('skyline-a');
  const aMi = new MeshInstance(ringMesh(app.graphicsDevice, 0), await ringMat('skyline_ring_a.jpg'));
  aMi.cull = false;
  a.addComponent('render', { meshInstances: [aMi] });
  const b = new Entity('skyline-b');
  const bMi = new MeshInstance(ringMesh(app.graphicsDevice, Math.PI), await ringMat('skyline_ring_b.jpg'));
  bMi.cull = false;
  b.addComponent('render', { meshInstances: [bMi] });
  sky.addChild(a);
  sky.addChild(b);
  app.root.addChild(sky);
  skyRoot = sky;
}

async function boot() {
  try {
    setStatus('جارٍ تحميل البطل…', 0.08);
    const heroAsset = await registry.retain(HERO_URL, 'container');
    armHero(heroAsset);
    await buildSky();
    await buildAvenue();
    setStatus('الشارع جاهز. القصر يُحمَّل عند الاقتراب، ويُفرَّغ إذا عدت للخلف.', 1);
    $('go').disabled = false;
    window.__bootDone = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    camera.setPosition(3.2, 2.1, -36.2);
    camera.lookAt(0, CAM_LOOK, -30);
  } catch (err) {
    console.error(err);
    setStatus('تعذّر التحميل: ' + (err && err.message ? err.message : err), 0);
  }
}

bindInput();
boot();
