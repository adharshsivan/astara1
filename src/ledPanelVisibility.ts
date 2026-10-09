import type { Object3D, Vector3Like } from 'three';

export interface LedPanelClip {
  visible: boolean;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** HTML portals do not inherit a THREE.Group's visibility. */
export function isWorldVisible(object: Object3D): boolean {
  for (let parent: Object3D | null = object; parent; parent = parent.parent) {
    if (!parent.visible) return false;
  }
  return true;
}

/**
 * Intersect the camera's view of the recessed display with its frame opening.
 * Camera coordinates are local to the video plane (+Z faces out). The frame
 * is a parallel rectangle `recess` metres in front of it. The resulting insets
 * are percentages in HTML coordinates, with Y inverted for CSS.
 */
export function calculateLedPanelClip(
  camera: Vector3Like,
  width: number,
  height: number,
  recess: number,
  result: LedPanelClip,
): LedPanelClip {
  result.visible = false;
  if (!Number.isFinite(camera.x + camera.y + camera.z)
    || width <= 0 || height <= 0 || camera.z <= recess + 0.0001) return result;

  const t = recess / camera.z;
  const remaining = 1 - t;
  const hw = width / 2;
  const hh = height / 2;
  const left = Math.max(-hw, (-hw - t * camera.x) / remaining);
  const right = Math.min(hw, (hw - t * camera.x) / remaining);
  const bottom = Math.max(-hh, (-hh - t * camera.y) / remaining);
  const top = Math.min(hh, (hh - t * camera.y) / remaining);
  if (right <= left || top <= bottom) return result;

  result.visible = true;
  result.left = (left + hw) / width * 100;
  result.right = (hw - right) / width * 100;
  result.top = (hh - top) / height * 100;
  result.bottom = (bottom + hh) / height * 100;
  return result;
}