export function sinUrl(rel) {
  return '/sin-babylon-view/original/' + String(rel).split('/').map((part) => encodeURIComponent(part)).join('/');
}

export const DOOR_URL = sinUrl('assets/مجسم الباب.glb');
