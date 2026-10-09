import * as THREE from 'three';
import { merge, type G } from './geo';

type Command =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number];
type Stroke = Command[];

export interface NeonArtwork {
  shell: G;
  core: G;
  width: number;
  height: number;
  bounds: THREE.Box3;
  point: (x: number, y: number) => [number, number];
}

// Reference-style monoline glyphs, not substituted or asynchronously loaded fonts.
const ENTRANCE_GLYPHS: Record<string, Stroke[]> = {
  S: [[
    ['M', 23, 3], ['C', 18, -1, 2, -2, 1, 8],
    ['C', 0, 14, 9, 15, 13, 16], ['C', 22, 18, 26, 21, 24, 27],
    ['C', 22, 34, 7, 34, 1, 29],
  ]],
  E: [
    [['M', 23, 0], ['L', 4, 0], ['Q', 0, 0, 0, 4], ['L', 0, 28], ['Q', 0, 32, 4, 32], ['L', 23, 32]],
    [['M', 0, 16], ['L', 19, 16]],
  ],
  A: [[['M', 0, 32], ['L', 12, 0], ['L', 24, 32]]],
  T: [
    [['M', 1, 1], ['L', 23, 1]],
    [['M', 12, 1], ['L', 12, 32]],
  ],
  R: [
    [['M', 1, 32], ['L', 1, 1], ['L', 15, 1], ['Q', 22, 1, 22, 8.5], ['Q', 22, 16, 15, 16], ['L', 1, 16]],
    [['M', 13, 16], ['L', 22, 32]],
  ],
  W: [[['M', 0, 0], ['L', 6, 32], ['L', 15, 7], ['L', 24, 32], ['L', 30, 0]]],
  Y: [
    [['M', 0, 0], ['L', 12, 17], ['L', 24, 0]],
    [['M', 12, 17], ['L', 12, 32]],
  ],
  B: [
    [['M', 1, 32], ['L', 1, 1], ['L', 14, 1], ['Q', 21, 1, 21, 8], ['Q', 21, 15, 14, 15], ['L', 1, 15]],
    [['M', 14, 15], ['L', 15, 15], ['Q', 23, 15, 23, 23], ['Q', 23, 32, 15, 32], ['L', 1, 32]],
  ],
  I: [
    [['M', 2, 1], ['L', 22, 1]],
    [['M', 12, 1], ['L', 12, 32]],
    [['M', 2, 32], ['L', 22, 32]],
  ],
  L: [[['M', 1, 1], ['L', 1, 28], ['Q', 1, 32, 5, 32], ['L', 22, 32]]],
  V: [[['M', 0, 0], ['L', 12, 32], ['L', 24, 0]]],
};

function transformStroke(stroke: Stroke, x: number, y: number, sx = 1, sy = 1): Stroke {
  return stroke.map((command) => {
    const result = [...command];
    for (let i = 1; i < result.length; i += 2) {
      result[i] = (command[i] as number) * sx + x;
      result[i + 1] = (command[i + 1] as number) * sy + y;
    }
    return result as Command;
  });
}

function meghamStrokes(): Stroke[] {
  return [
    // The sweeping M flows into the underline, as in the supplied logo.
    [
      ['M', 7, 76], ['C', 29, 57, 55, 34, 70, 22],
      ['C', 83, 12, 76, 27, 68, 42], ['L', 56, 62],
      ['C', 49, 75, 58, 66, 65, 61], ['L', 131, 7],
      ['C', 139, 0, 136, 6, 131, 12], ['C', 111, 36, 91, 64, 82, 81],
      ['C', 74, 97, 78, 94, 89, 86], ['L', 108, 74],
      ['Q', 112, 72, 117, 72], ['L', 313, 72],
    ],
    ...ENTRANCE_GLYPHS.E.map((s) => transformStroke(s, 116, 32, 30 / 23, 28 / 32)),
    [
      ['M', 184, 32], ['L', 160, 32], ['Q', 155, 32, 155, 37],
      ['L', 155, 55], ['Q', 155, 60, 160, 60], ['L', 181, 60],
      ['Q', 185, 60, 185, 56], ['L', 185, 46], ['L', 171, 46],
    ],
    [['M', 194, 32], ['L', 194, 60]],
    [['M', 225, 32], ['L', 225, 60]],
    [['M', 194, 46], ['L', 225, 46]],
    [['M', 234, 60], ['L', 249, 32], ['L', 264, 60]],
    [['M', 241, 49], ['L', 257, 49]],
    [['M', 273, 60], ['L', 273, 32], ['L', 293, 49], ['L', 313, 32], ['L', 313, 60]],
  ];
}

function seawaysStrokes(): Stroke[] {
  return [...'SEAWAYS'].flatMap((letter, i) => {
    const glyph = ENTRANCE_GLYPHS[letter];
    if (!glyph) throw new Error(`Missing neon glyph: ${letter}`);
    const width = letter === 'W' ? 30 : letter === 'E' ? 23 : 24;
    return glyph.map((s) => transformStroke(s, -width / 2, i * 45));
  });
}

/** Wide-tracked ASTARA wordmark for the entrance beam. */
function astaraStrokes(): Stroke[] {
  return [...'ASTARA'].flatMap((letter, i) => {
    const glyph = ENTRANCE_GLYPHS[letter];
    if (!glyph) throw new Error(`Missing neon glyph: ${letter}`);
    return glyph.map((s) => transformStroke(s, i * 32, 0));
  });
}

function sparkle(core: boolean, z: number): G {
  const shape = new THREE.Shape();
  const scale = core ? 0.63 : 1;
  const cx = 334;
  const cy = -65;
  const rx = 15 * scale;
  const ry = 18 * scale;
  const k = 2.2 * scale;
  shape.moveTo(cx, cy + ry);
  shape.quadraticCurveTo(cx + k, cy + k, cx + rx, cy);
  shape.quadraticCurveTo(cx + k, cy - k, cx, cy - ry);
  shape.quadraticCurveTo(cx - k, cy - k, cx - rx, cy);
  shape.quadraticCurveTo(cx - k, cy + k, cx, cy + ry);
  shape.closePath();
  const depth = core ? 0.38 : 0.65;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, steps: 1, curveSegments: 5,
  });
  geometry.translate(0, 0, z - depth / 2);
  return geometry;
}

function tubeLayer(strokes: Stroke[], radius: number, z: number, hasStar: boolean): G {
  const parts: G[] = [];
  const joints = new Map<string, THREE.Vector3>();
  const point = (x: number, y: number) => new THREE.Vector3(x, -y, z);
  const rememberJoint = (v: THREE.Vector3) => {
    joints.set(`${v.x.toFixed(5)},${v.y.toFixed(5)}`, v);
  };

  for (const stroke of strokes) {
    let cursor: THREE.Vector3 | null = null;
    for (const command of stroke) {
      if (command[0] === 'M') {
        cursor = point(command[1], command[2]);
        rememberJoint(cursor);
        continue;
      }
      if (!cursor) throw new Error('Neon stroke must start with a move command.');
      let curve: THREE.Curve<THREE.Vector3>;
      if (command[0] === 'L') {
        curve = new THREE.LineCurve3(cursor, point(command[1], command[2]));
      } else if (command[0] === 'Q') {
        curve = new THREE.QuadraticBezierCurve3(
          cursor, point(command[1], command[2]), point(command[3], command[4]),
        );
      } else {
        curve = new THREE.CubicBezierCurve3(
          cursor, point(command[1], command[2]), point(command[3], command[4]), point(command[5], command[6]),
        );
      }
      const divisions = command[0] === 'L' ? 1 : Math.max(4, Math.min(40, Math.ceil(curve.getLength() / 3)));
      parts.push(new THREE.TubeGeometry(curve, divisions, radius, 6, false));
      cursor = curve.getPoint(1);
      rememberJoint(cursor);
    }
  }

  // One rounded cap per junction, not duplicate coincident end faces.
  for (const v of joints.values()) {
    parts.push(new THREE.SphereGeometry(radius, 6, 4).translate(v.x, v.y, v.z));
  }
  if (hasStar) parts.push(sparkle(radius < 0.7, z));
  return merge(parts.map((part) => {
    if (!part.index) return part;
    const flat = part.toNonIndexed();
    part.dispose();
    return flat;
  }));
}

interface TubeRadii {
  shell: number;
  core: number;
}

function fitArtwork(
  strokes: Stroke[],
  target: { width?: number; height?: number },
  hasStar: boolean,
  radii: TubeRadii = hasStar ? { shell: 0.95, core: 0.48 } : { shell: 1.05, core: 0.57 },
): NeonArtwork {
  const shell = tubeLayer(strokes, radii.shell, 0, hasStar);
  // A forward filament gives a hot core without stacked transparent planes.
  const core = tubeLayer(strokes, radii.core, 0.9, hasStar);
  shell.computeBoundingBox();
  const designBounds = shell.boundingBox!;
  const designSize = designBounds.getSize(new THREE.Vector3());
  if (designSize.x <= 0 || designSize.y <= 0) throw new Error('Empty neon artwork.');
  const scale = target.width !== undefined ? target.width / designSize.x : target.height! / designSize.y;
  const tx = -(designBounds.min.x + designBounds.max.x) * scale / 2;
  const ty = -designBounds.min.y * scale;
  for (const geometry of [shell, core]) {
    geometry.scale(scale, scale, scale);
    geometry.translate(tx, ty, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      if (![positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)) {
        throw new Error('Non-finite neon geometry.');
      }
    }
  }
  const bounds = shell.boundingBox!.clone().union(core.boundingBox!);
  const size = bounds.getSize(new THREE.Vector3());
  return { shell, core, width: size.x, height: size.y, bounds, point: (x, y) => [x * scale + tx, -y * scale + ty] };
}

export function buildMeghamArtwork(width: number): NeonArtwork {
  const art = fitArtwork(meghamStrokes(), { width }, true);
  art.shell.name = 'Megham_Reference_Outline';
  art.core.name = 'Megham_Reference_Filament';
  return art;
}

export function buildAstaraArtwork(height: number): NeonArtwork {
  // Slightly fatter tube than SEAWAYS so the wordmark reads at beam distance.
  const art = fitArtwork(astaraStrokes(), { height }, false, { shell: 1.25, core: 0.62 });
  art.shell.name = 'Astara_Wordmark_Outline';
  art.core.name = 'Astara_Wordmark_Filament';
  return art;
}

export function buildSeawaysArtwork(height: number): NeonArtwork {
  const art = fitArtwork(seawaysStrokes(), { height }, false);
  art.shell.name = 'Seaways_Stacked_Outline';
  art.core.name = 'Seaways_Stacked_Filament';
  return art;
}

/** Horizontal wordmark on the same 32-unit tracking as ASTARA. */
function wordmarkStrokes(word: string): Stroke[] {
  return [...word].flatMap((letter, i) => {
    const glyph = ENTRANCE_GLYPHS[letter];
    if (!glyph) throw new Error(`Missing neon glyph: ${letter}`);
    return glyph.map((s) => transformStroke(s, i * 32, 0));
  });
}

function buildWordmarkArtwork(word: string, height: number, label: string): NeonArtwork {
  const art = fitArtwork(wordmarkStrokes(word), { height }, false);
  art.shell.name = `${label}_Outline`;
  art.core.name = `${label}_Filament`;
  return art;
}

export function buildBarArtwork(height: number): NeonArtwork {
  return buildWordmarkArtwork('BAR', height, 'Bar_Wordmark');
}

export function buildLiveArtwork(height: number): NeonArtwork {
  return buildWordmarkArtwork('LIVE', height, 'Live_Wordmark');
}

export function disposeNeonArtwork(art: NeonArtwork) {
  art.shell.dispose();
  art.core.dispose();
}
