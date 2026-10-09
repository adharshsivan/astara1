import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type G = THREE.BufferGeometry;

/* ------------------------------------------------------------------ */
/*  Primitive builders (already positioned in local space)             */
/* ------------------------------------------------------------------ */

export function box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): G {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function cyl(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  seg = 12,
): G {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return g;
}

export function sphere(r: number, x: number, y: number, z: number, ws = 8, hs = 6): G {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.translate(x, y, z);
  return g;
}

/** Flat quad facing +Y (floor pad). */
export function pad(w: number, d: number, x: number, y: number, z: number): G {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Merge many primitives into a single geometry => 1 draw call per material. */
export function merge(parts: G[]): G {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const out = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!out) return new THREE.BufferGeometry();
  out.computeBoundingSphere();
  return out;
}

/** Ring of 4 boxes (parapet / railing / frame). cx,cz = centre; w,d = outer size. */
export function ring(
  w: number,
  d: number,
  t: number,
  h: number,
  cx: number,
  y: number,
  cz: number,
): G[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    box(w, h, t, cx, y, cz + hd - t / 2),
    box(w, h, t, cx, y, cz - hd + t / 2),
    box(t, h, d - 2 * t, cx + hw - t / 2, y, cz),
    box(t, h, d - 2 * t, cx - hw + t / 2, y, cz),
  ];
}

/* ------------------------------------------------------------------ */
/*  Segment "neon tube" font                                           */
/* ------------------------------------------------------------------ */

// Each glyph = list of segments [x1,y1,x2,y2] on a 4 x 6 grid.
const FONT: Record<string, number[][]> = {
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [0.8, 2.2, 3.2, 2.2]],
  B: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 3, 3.2], [0, 3.2, 3, 3.2], [3, 3.2, 4, 1.6], [4, 1.6, 3, 0], [3, 0, 0, 0]],
  C: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0]],
  D: [[0, 0, 0, 6], [0, 6, 2.6, 6], [2.6, 6, 4, 4.4], [4, 4.4, 4, 1.6], [4, 1.6, 2.6, 0], [2.6, 0, 0, 0]],
  E: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [0, 3, 3, 3]],
  F: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 3, 3, 3]],
  G: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 2, 3]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  I: [[2, 0, 2, 6]],
  K: [[0, 0, 0, 6], [0, 3, 4, 6], [0, 3, 4, 0]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0]],
  P: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3]],
  R: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [1, 3, 4, 0]],
  S: [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 6]],
  V: [[0, 6, 2, 0], [2, 0, 4, 6]],
  W: [[0, 6, 1, 0], [1, 0, 2, 3], [2, 3, 3, 0], [3, 0, 4, 6]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]],
  Z: [[4, 6, 0, 6], [0, 6, 4, 0], [4, 0, 0, 0]],
  ' ': [],
};

export interface NeonTextResult {
  geometry: G;
  width: number;
  height: number;
}

/**
 * Builds merged tube-letter geometry for a string.
 * Text is centred on origin, lies in the XY plane and faces +Z.
 */
export function neonText(text: string, height: number, tube = 0.1, letterGap = 1.6): NeonTextResult {
  const s = height / 6;
  const advance = (4 + letterGap) * s;
  const total = text.length * advance - letterGap * s;
  const parts: G[] = [];
  let cursor = -total / 2;

  for (const ch of text.toUpperCase()) {
    const segs = FONT[ch] ?? [];
    for (const [x1, y1, x2, y2] of segs) {
      const dx = (x2 - x1) * s;
      const dy = (y2 - y1) * s;
      const len = Math.hypot(dx, dy) + tube;
      const g = new THREE.BoxGeometry(len, tube, tube);
      g.rotateZ(Math.atan2(dy, dx));
      g.translate(cursor + ((x1 + x2) / 2) * s, ((y1 + y2) / 2) * s - height / 2, 0);
      parts.push(g);
    }
    cursor += advance;
  }
  return { geometry: merge(parts), width: total, height };
}

/* ------------------------------------------------------------------ */
/*  String-light helper                                                */
/* ------------------------------------------------------------------ */

export type V3 = [number, number, number];

/** Points along a sagging catenary-ish curve between two anchors. */
export function catenary(a: V3, b: V3, spacing = 0.5, sag = 0.35): V3[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / spacing));
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const drop = sag * 4 * t * (1 - t);
    pts.push([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - drop,
      a[2] + (b[2] - a[2]) * t,
    ]);
  }
  return pts;
}

/**
 * Wooden plank deck panel. Planks run along X and stack along Z
 * (or the reverse when alongZ = false). Matches the rooftop deck.
 */
export function plankFloor(
  w: number,
  d: number,
  cx: number,
  y: number,
  cz: number,
  alongZ = true,
): G {
  const pw = 0.3;
  const gap = 0.03;
  const parts: G[] = [];
  if (alongZ) {
    const n = Math.floor((d - 0.1) / (pw + gap));
    const start = cz - (n * (pw + gap)) / 2 + pw / 2;
    for (let i = 0; i < n; i++) parts.push(box(w, 0.05, pw, cx, y, start + i * (pw + gap)));
  } else {
    const n = Math.floor((w - 0.1) / (pw + gap));
    const start = cx - (n * (pw + gap)) / 2 + pw / 2;
    for (let i = 0; i < n; i++) parts.push(box(pw, 0.05, d, start + i * (pw + gap), y, cz));
  }
  return merge(parts);
}

/** Simple seeded RNG for deterministic window patterns. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
