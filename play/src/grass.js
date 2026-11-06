import * as pc from '../vendor/playcanvas.mjs';

const { Entity, StandardMaterial, Color } = pc;
const ASSET = '/sin-babylon-view/original/assets/';

// Same blend as index.html ground v2. Textures stay linear and the shader
// applies the original pow(2.2) decode. Zone weights are not decoded.
const DIFFUSE = `
uniform sampler2D gLawn;
uniform sampler2D gDark;
uniform sampler2D gMoss;
uniform sampler2D gZone;
vec3 gDec(vec3 c){ return pow(c, vec3(2.2)); }
vec3 gTex(sampler2D t, vec2 p, float tile, vec3 av){
  vec2 uv = p / tile;
  vec3 a = gDec(texture2D(t, uv).rgb);
  vec2 uv2 = mat2(0.8572, 0.5150, -0.5150, 0.8572) * uv * 0.713 + vec2(0.37, 0.61);
  vec3 b = gDec(texture2D(t, uv2).rgb);
  return max(av + ((a - av) + (b - av)) * 0.7071, vec3(0.0));
}
void getAlbedo() {
  vec2 gp = vPositionW.xz;
  vec3 zn = texture2D(gZone, gp * (1.0 / 640.0) + 0.5).rgb;
  float wW = zn.r;
  float wD = zn.g;
  float onRoad = (1.0 - smoothstep(4.55, 5.35, abs(gp.x))) * (1.0 - smoothstep(80.0, 82.0, abs(gp.y)));
  float onPlaza = step(75.0, gp.y) * step(gp.y, 162.0) * (1.0 - smoothstep(32.0, 34.0, abs(gp.x)));
  wW *= max(onRoad, onPlaza);
  float wL = max(1.0 - wW - wD, 0.0);
  const vec3 gAvL = vec3(0.05565, 0.08838, 0.01358);
  const vec3 gAvD = vec3(0.02277, 0.03581, 0.00556);
  const vec3 gAvM = vec3(0.08536, 0.08075, 0.03578);
  const vec3 gLW = vec3(0.2126, 0.7152, 0.0722);
  vec3 cL = gTex(gLawn, gp, 2.8, gAvL);
  vec3 cD = gTex(gDark, gp, 3.0, gAvD);
  vec3 cM = gTex(gMoss, gp, 2.4, gAvM);
  float hL = wL + (dot(cL, gLW) / 0.07602 - 1.0) * 0.45;
  float hD = wD + (dot(cD, gLW) / 0.03085 - 1.0) * 0.45;
  float hM = wW + (dot(cM, gLW) / 0.07848 - 1.0) * 0.45;
  float ma = max(max(hL, hD), hM) - 0.35;
  float bL = max(hL - ma, 0.0);
  float bD = max(hD - ma, 0.0);
  float bM = max(hM - ma, 0.0);
  float bs = bL + bD + bM + 0.00001;
  vec3 gc = (cL * bL + cD * bD + cM * bM) / bs;
  gc *= (0.82 + 0.36 * zn.b) * mix(vec3(0.97, 0.99, 1.03), vec3(1.03, 1.01, 0.97), zn.b);
  vec3 av = (gAvL * bL + gAvD * bD + gAvM * bM) / bs;
  gc = mix(gc, av, smoothstep(40.0, 260.0, length(vPositionW - view_position)) * 0.55);
  dAlbedo = gc;
}
`;

function linear(tex, repeat) {
  tex.srgb = false;
  tex.flipY = true;
  tex.addressU = repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE;
  tex.addressV = repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE;
  return tex;
}

export async function buildGround(registry) {
  const lawn = linear((await registry.retain(ASSET + 'grass_lawn.jpg', 'texture')).resource, true);
  const dark = linear((await registry.retain(ASSET + 'grass_dark.jpg', 'texture')).resource, true);
  const moss = linear((await registry.retain(ASSET + 'grass_moss.jpg', 'texture')).resource, true);
  const zone = linear((await registry.retain(ASSET + 'ground_zones.png', 'texture')).resource, false);
  const mat = new StandardMaterial();
  mat.chunks.diffusePS = DIFFUSE;
  mat.diffuse = new Color(1, 1, 1);
  mat.roughness = 1;
  mat.metalness = 0;
  mat.useMetalness = true;
  mat.setParameter('gLawn', lawn);
  mat.setParameter('gDark', dark);
  mat.setParameter('gMoss', moss);
  mat.setParameter('gZone', zone);
  mat.update();
  const ent = new Entity('ground');
  ent.addComponent('render', { type: 'plane', material: mat });
  ent.setLocalScale(1200, 1, 1200);
  ent.setPosition(0, 0, 0);
  return ent;
}
