import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { box, cyl, merge, sphere, rng, type G } from './geo';
import { Instances, type InstanceItem } from './Instances';
import { buildBarArtwork, disposeNeonArtwork } from './NeonArtwork';
import { NeonTubes } from './Signage';

/* Rooftop local space (origin = tower centre at deck level). */
export const BAR = {
  counter: { x0: 7.4, x1: 8.5, z0: -1.0, z1: 6.6, h: 1.15 },
  back: { x0: 9.6, x1: 11.0, z0: -1.0, z1: 6.6, h: 3.0 },
  canopy: { x0: 6.6, x1: 11.4, z0: -1.8, z1: 7.4, h: 3.2 },
};

/** Back-bar shelves project OUT of the cabinet face (toward the counter), so bottles are visible. */
const SHELF_Y = [0.95, 1.4, 1.85];
const SHELF_D = 0.25;
const SHELF_T = 0.045;

/** Centre-line height of the lantern's top rail; the suspension starts here. */
const PENDANT_TOP = 2.25;

const mid = (a: number, b: number) => (a + b) / 2;
const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** Counter body, on a flush plinth so it stands on the deck instead of hovering. */
function buildWood(): G {
  const c = BAR.counter;
  return bx(c.x0, c.x1, 0.1, c.h, c.z0, c.z1);
}

function buildDark(): G {
  const c = BAR.counter;
  const b = BAR.back;
  const k = BAR.canopy;
  const p: G[] = [];
  p.push(bx(c.x0, c.x1, 0, 0.1, c.z0, c.z1)); // plinth, flush with the body
  p.push(bx(c.x0 - 0.21, c.x1 + 0.09, c.h, c.h + 0.07, c.z0 - 0.12, c.z1 + 0.12)); // stone top
  p.push(bx(b.x0, b.x1, 0, b.h, b.z0, b.z1)); // back-bar cabinet
  p.push(bx(k.x0, k.x1, k.h, k.h + 0.13, k.z0, k.z1)); // canopy slab
  // Pendant suspension is built with the lanterns so every rod meets its
  // lantern and its ceiling rosette; no free-standing cords here.
  return merge(p);
}

/* ---------------- liquor bottles ---------------- */

/** Lathe a bottle silhouette from a [radius, y] profile, closed at the neck. */
function latheBottle(profile: [number, number][], seg = 14): G {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const top = pts[pts.length - 1];
  if (top.x > 0.0001) pts.push(new THREE.Vector2(0, top.y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

/** Bake a flat colour so the label band can read lighter than its glass. */
function tint(g: G, value: number): G {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  col.fill(value);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Foil cap: a short band with a slightly domed top, seated on the neck. */
function foilCap(neckR: number, h: number, seatY: number): G {
  const g = latheBottle(
    [
      [0, 0], [neckR * 1.16, 0], [neckR * 1.26, h * 0.2],
      [neckR * 1.26, h], [neckR * 0.84, h], [neckR * 0.56, h * 1.12], [0, h * 1.12],
    ],
    12,
  );
  g.translate(0, seatY, 0);
  return g;
}

interface BottleVariant {
  name: string;
  /** [radius, y] silhouette from base centre up to the neck */
  profile: [number, number][];
  /** label band as [radius, y0, height] — sits just proud of the body */
  label: [number, number, number];
  neckR: number;
  capH: number;
  /** shelf footprint; drives how far apart bottles sit */
  radius: number;
  /** muted glass / liquid tones */
  glass: string[];
}

/**
 * Five recognisable silhouettes rather than one bottle resized. Whisky is the
 * wide-shouldered short one, gin and vodka are the tall slim pair, tequila is
 * the squat rounded one and wine has the classic sloped shoulder.
 */
const BOTTLE_VARIANTS: BottleVariant[] = [
  // Whisky — wide-shouldered and short, the heaviest pour on the shelf.
  {
    name: 'Whisky',
    profile: [
      [0, 0], [0.0445, 0], [0.0465, 0.012], [0.0465, 0.14], [0.0445, 0.17],
      [0.032, 0.202], [0.0195, 0.222], [0.0175, 0.236], [0.0175, 0.264], [0.0148, 0.27],
    ],
    label: [0.0478, 0.042, 0.078],
    neckR: 0.0175,
    capH: 0.032,
    radius: 0.0478,
    glass: ['#7c4a1c', '#5b3612', '#8b5726'],
  },
  // Gin — tall and slim with a soft shoulder.
  {
    name: 'Gin',
    profile: [
      [0, 0], [0.0395, 0], [0.0415, 0.01], [0.0415, 0.238], [0.0385, 0.272],
      [0.0255, 0.3], [0.0195, 0.316], [0.0195, 0.35], [0.0165, 0.356],
    ],
    label: [0.0428, 0.075, 0.098],
    neckR: 0.0195,
    capH: 0.03,
    radius: 0.0428,
    glass: ['#3f6b46', '#2f5a3c', '#6f8f74'],
  },
  // Vodka — the tallest and slimmest of the set.
  {
    name: 'Vodka',
    profile: [
      [0, 0], [0.0335, 0], [0.0355, 0.01], [0.0355, 0.262], [0.033, 0.292],
      [0.0222, 0.316], [0.0172, 0.332], [0.0172, 0.374], [0.0142, 0.379],
    ],
    label: [0.0368, 0.088, 0.108],
    neckR: 0.0172,
    capH: 0.028,
    radius: 0.0368,
    glass: ['#c8cfd2', '#b7c3c9', '#d6dbdd'],
  },
  // Tequila — squat, rounded belly, short neck.
  {
    name: 'Tequila',
    profile: [
      [0, 0], [0.0405, 0], [0.0472, 0.022], [0.0488, 0.078], [0.0462, 0.128],
      [0.0368, 0.158], [0.0248, 0.178], [0.0223, 0.192], [0.0223, 0.216], [0.019, 0.221],
    ],
    label: [0.0499, 0.048, 0.058],
    neckR: 0.0223,
    capH: 0.032,
    radius: 0.0499,
    glass: ['#c9c0a4', '#b6ab8c', '#d9d2b6'],
  },
  // Wine — classic sloped shoulder on a long slim body.
  {
    name: 'Wine',
    profile: [
      [0, 0], [0.0325, 0], [0.0345, 0.01], [0.0345, 0.158], [0.0335, 0.204],
      [0.0278, 0.246], [0.0188, 0.28], [0.015, 0.3], [0.015, 0.326], [0.0126, 0.33],
    ],
    label: [0.0358, 0.062, 0.072],
    neckR: 0.015,
    capH: 0.026,
    radius: 0.0358,
    glass: ['#2f4a2e', '#3b5a38', '#26402a'],
  },
];

/** Body plus its own foil cap, per variant. */
function buildBottleShapes(): { body: G; cap: G }[] {
  return BOTTLE_VARIANTS.map((v) => {
    const body = merge([
      tint(latheBottle(v.profile), 1),
      tint(cyl(v.label[0], v.label[0], v.label[2], 0, v.label[1] + v.label[2] / 2, 0, 16), 2),
    ]);
    return { body, cap: foilCap(v.neckR, v.capH, v.profile[v.profile.length - 1][1]) };
  });
}

function buildBronze(): G {
  const b = BAR.back;
  const k = BAR.canopy;
  const c = BAR.counter;
  const p: G[] = [];
  // Shelves attach to the cabinet face (shorter than the glow panel so no coplanar ends)
  for (const y of SHELF_Y) {
    p.push(bx(b.x0 - SHELF_D, b.x0, y - SHELF_T / 2, y + SHELF_T / 2, b.z0 + 0.15, b.z1 - 0.15));
  }
  // Canopy posts + slats whose tops touch the slab underside
  for (const [x, z] of [
    [k.x0 + 0.12, k.z0 + 0.12],
    [k.x0 + 0.12, k.z1 - 0.12],
    [k.x1 - 0.12, k.z0 + 0.12],
    [k.x1 - 0.12, k.z1 - 0.12],
  ]) {
    p.push(box(0.14, k.h, 0.14, x, k.h / 2, z));
  }
  for (let z = k.z0 + 0.3; z < k.z1 - 0.1; z += 0.45) {
    p.push(box(k.x1 - k.x0 - 0.12, 0.1, 0.07, mid(k.x0, k.x1), k.h - 0.05, z));
  }
  // Foot rail runs against the counter front
  const rail = new THREE.CylinderGeometry(0.028, 0.028, c.z1 - c.z0 - 0.2, 6);
  rail.rotateX(Math.PI / 2);
  rail.translate(c.x0 - 0.028, 0.24, mid(c.z0, c.z1));
  p.push(rail);
  return merge(p);
}

/**
 * Bar pendant style — a compact open wooden-frame lantern.
 *
 * Four corner posts and two rings of rails make a small box frame in warm oak,
 * with a warm bulb suspended inside. The lantern is deliberately kept small
 * (30 cm across, 38 cm tall) so it reads as a bar fitting rather than a bulk.
 *
 * Suspension is built alongside the frame instead of as a separate hairline
 * cord: two rods rise from a collar seated on the lantern's top plate to a
 * ceiling rosette buried in the canopy slab. That makes each fixture read as
 * one attached object — collar, rods, lantern and rosette are contiguous.
 *
 * Frame returns one wood mesh, the suspension one dark-metal mesh and the bulb
 * one emissive mesh: three draw calls for the whole row of five.
 */
function buildPendantFrames(): { frame: G; suspension: G; bulb: G } {
  const c = BAR.counter;
  const k = BAR.canopy;
  const xc = mid(c.x0, c.x1);
  const S = 0.30;      // lantern outer width — compact, not bulk
  const H = 0.38;      // lantern height
  const P = 0.040;     // post / rail thickness
  const topY = PENDANT_TOP; // 2.25 — centre of the lantern's top rail
  const frameParts: G[] = [];
  const suspensionParts: G[] = [];
  const bulbParts: G[] = [];
  const half = S / 2 - P / 2;
  const slabY = k.h; // 3.2 — canopy slab underside
  for (let i = 0; i < 5; i++) {
    const cz = c.z0 + 0.6 + i * 1.65;
    // Four corner posts.
    for (const dx of [-half, half]) {
      for (const dz of [-half, half]) {
        frameParts.push(box(P, H, P, xc + dx, topY - H / 2, cz + dz));
      }
    }
    // Top and bottom rings only — a compact lattice, not a heavy box.
    for (const yy of [topY, topY - H]) {
      frameParts.push(box(S, P, P, xc, yy, cz - half));
      frameParts.push(box(S, P, P, xc, yy, cz + half));
      frameParts.push(box(P, P, S, xc - half, yy, cz));
      frameParts.push(box(P, P, S, xc + half, yy, cz));
    }
    // Warm bulb seated in the upper half of the lantern.
    bulbParts.push(sphere(0.062, xc, topY - H * 0.3, cz, 10, 7));

    // A solid top plate closes the lantern: the rods land on this, not on the
    // open lattice, so the fixture reads as one attached object.
    frameParts.push(box(S, P, S, xc, topY, cz));

    // Suspension: two slim rods rise from the top plate into the canopy slab,
    // and a rosette overlaps the slab. Rod bottoms are buried in the plate
    // (below its top face) so there is no visible break at either end.
    const rodR = 0.008;
    const rodH = slabY - topY + 0.05; // overlaps plate and slab
    for (const dx of [-0.085, 0.085]) {
      suspensionParts.push(cyl(rodR, rodR, rodH, xc + dx, topY + rodH / 2 - 0.025, cz, 8));
    }
    suspensionParts.push(cyl(0.052, 0.070, 0.035, xc, slabY - 0.017, cz, 14));
  }
  return { frame: merge(frameParts), suspension: merge(suspensionParts), bulb: merge(bulbParts) };
}

function buildLed(): G {
  const c = BAR.counter;
  const b = BAR.back;
  return merge([
    // toe-kick strip on the plinth face
    bx(c.x0 - 0.03, c.x0, 0.035, 0.065, c.z0 + 0.1, c.z1 - 0.1),
    // under the stone overhang
    bx(c.x0 - 0.17, c.x0 - 0.14, c.h - 0.03, c.h, c.z0 + 0.1, c.z1 - 0.1),
    // under each shelf front edge
    ...SHELF_Y.map((y) =>
      bx(b.x0 - SHELF_D + 0.02, b.x0 - SHELF_D + 0.05, y - SHELF_T / 2 - 0.03, y - SHELF_T / 2, b.z0 + 0.2, b.z1 - 0.2),
    ),
  ]);
}

/** Pink panel lying on the cabinet face, behind the bottles. */
function buildBackPanel(): G {
  const b = BAR.back;
  return bx(b.x0 - 0.03, b.x0, 0.4, 2.35, b.z0 + 0.1, b.z1 - 0.1);
}

/** Whisky and gin lead the stock, with wine and tequila as the rarer pours. */
function pickVariant(rand: () => number): number {
  const r = rand();
  return r < 0.3 ? 0 : r < 0.56 ? 1 : r < 0.77 ? 2 : r < 0.9 ? 3 : 4;
}

/**
 * Walk each shelf picking a variant in short runs, so similar bottles cluster
 * the way they do on a real back bar. Advance is driven by each bottle's own
 * footprint, so wide whisky bottles get their space and slim vodka ones crowd
 * in a touch tighter.
 */
function buildBottleItems(): { bodies: InstanceItem[][]; caps: InstanceItem[][] } {
  const b = BAR.back;
  const rand = rng(42);
  const bodies = BOTTLE_VARIANTS.map(() => [] as InstanceItem[]);
  const caps = BOTTLE_VARIANTS.map(() => [] as InstanceItem[]);
  let current = 0;
  let run = 0;
  for (const y of SHELF_Y) {
    let z = b.z0 + 0.34;
    while (z < b.z1 - 0.32) {
      if (rand() < 0.14) {
        z += 0.24;
        continue;
      }
      if (run <= 0) {
        current = pickVariant(rand);
        run = 2 + Math.floor(rand() * 5);
      }
      run--;
      const v = BOTTLE_VARIANTS[current];
      const s = 0.9 + rand() * 0.2;
      const p: [number, number, number] = [
        b.x0 - SHELF_D / 2 + (rand() - 0.5) * 0.05,
        y + SHELF_T / 2 + 0.012,
        z + (rand() - 0.5) * 0.028,
      ];
      bodies[current].push({ p, s, c: v.glass[Math.floor(rand() * v.glass.length)] });
      caps[current].push({ p, s });
      z += v.radius * 2 * s + 0.032 + rand() * 0.03;
    }
  }
  return { bodies, caps };
}

function buildStoolItems(): InstanceItem[] {
  const c = BAR.counter;
  const items: InstanceItem[] = [];
  for (let i = 0; i < 8; i++) items.push({ p: [c.x0 - 0.62, 0, c.z0 + 0.55 + i * 1.0] });
  return items;
}

export function RooftopBar() {
  const wood = useMemo(buildWood, []);
  const dark = useMemo(buildDark, []);
  const bronze = useMemo(buildBronze, []);
  const pendantFrames = useMemo(buildPendantFrames, []);
  const led = useMemo(buildLed, []);
  const panel = useMemo(buildBackPanel, []);
  // BAR wordmark centred on the back-bar cabinet face, above the top shelf
  // bottles (top out ~2.3) and clear of the canopy slab (3.2).
  const barArt = useMemo(() => buildBarArtwork(0.42), []);
  useEffect(() => () => disposeNeonArtwork(barArt), [barArt]);
  const bottles = useMemo(buildBottleItems, []);
  const shapes = useMemo(buildBottleShapes, []);
  const stoolItems = useMemo(buildStoolItems, []);
  const stoolFrame = useMemo(
    () => merge([cyl(0.025, 0.025, 0.72, 0, 0.36, 0, 8), cyl(0.2, 0.22, 0.03, 0, 0.015, 0, 12), cyl(0.12, 0.12, 0.02, 0, 0.3, 0, 10)]),
    [],
  );
  const stoolSeat = useMemo(() => new THREE.CylinderGeometry(0.19, 0.17, 0.09, 12).translate(0, 0.77, 0), []);

  return (
    <group name="RooftopBar">
      <mesh name="Bar_Counter_Wood" geometry={wood} material={MAT.woodLight} castShadow receiveShadow />
      <mesh name="Bar_Structure_Dark" geometry={dark} material={MAT.darkMetal} castShadow receiveShadow />
      <mesh name="Bar_Details_Bronze" geometry={bronze} material={MAT.bronze} castShadow />
      <mesh name="Bar_Pendant_WoodFrames" geometry={pendantFrames.frame} material={MAT.wood} castShadow />
      <mesh name="Bar_Pendant_Suspension" geometry={pendantFrames.suspension} material={MAT.darkMetal} castShadow />
      <mesh name="Bar_Pendant_Bulbs" geometry={pendantFrames.bulb} material={MAT.bulbWarm} />
      <mesh name="Bar_LED_Cyan" geometry={led} material={MAT.neonCyan} />
      <mesh name="Bar_BackPanel_Dark" geometry={panel} material={MAT.darkMetal} />
      <group
        name="Bar_Sign"
        position={[BAR.back.x0 - 0.055, 2.38, (BAR.back.z0 + BAR.back.z1) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <NeonTubes art={barArt} color="warm" night />
      </group>
      {shapes.map((s, i) =>
        bottles.bodies[i].length > 0 && (
          <Instances
            key={`body${i}`}
            name={`Bar_Bottles_${BOTTLE_VARIANTS[i].name}`}
            geometry={s.body}
            material={MAT.bottles}
            items={bottles.bodies[i]}
          />
        ),
      )}
      {shapes.map((s, i) =>
        bottles.caps[i].length > 0 && (
          <Instances
            key={`cap${i}`}
            name={`Bar_BottleCaps_${BOTTLE_VARIANTS[i].name}`}
            geometry={s.cap}
            material={MAT.darkMetal}
            items={bottles.caps[i]}
          />
        ),
      )}
      <Instances name="Bar_Stool_Frames" geometry={stoolFrame} material={MAT.darkMetal} items={stoolItems} castShadow />
      <Instances name="Bar_Stool_Seats" geometry={stoolSeat} material={MAT.teal} items={stoolItems} castShadow />
    </group>
  );
}
