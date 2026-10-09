import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { box, cyl, merge, plankFloor, ring, type G } from './geo';
import { Instances, type InstanceItem } from './Instances';
import { makeChairGeos } from './SeatingArea';
import { TroughPlanters, Trees, troughFlowerRow, type TroughSpec, type TreeSpec } from './Plants';
import { PODIUM, TERRACE_EXIT, TOWER } from './dims';

/**
 * First-floor (podium) roof terrace — group origin = podium roof surface: world [0, PODIUM.h, 0].
 *
 * The roof is solid (full-footprint core + roof band), the wood deck runs right up to the
 * kerb and the tower plinth, and the glass guardrail stands on the kerb. Tables and chairs
 * only: no sofas, no benches, no table lights.
 */

const FRONT = PODIUM.d / 2; // 15
const TOWER_FRONT = 10; // tower front face (the exit door sits here)
const HALF_W = PODIUM.w / 2; // 17
const HALF_D = PODIUM.d / 2; // 15
/** Tower plinth outer faces (kept in step with MainBuilding). */
const PLINTH_X = 12.75;
const PLINTH_Z = 10.75;

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** Glass guardrail standing on the kerb top (kerb: ±17.0…17.25, 0.4 high). */
export function PodiumTerraceRailing() {
  const glass = useMemo(() => merge(ring(34.3, 30.3, 0.045, 0.75, 0, 0.775, 0)), []);
  const cap = useMemo(() => merge(ring(34.34, 30.34, 0.07, 0.05, 0, 1.175, 0)), []);
  return (
    <group name="PodiumRoofGlassRailing" position={[0, PODIUM.h, 0]}>
      <mesh name="Podium_Roof_Glass_Railing" geometry={glass} material={MAT.glass} renderOrder={10} />
      <mesh name="Podium_Roof_Railing_Cap" geometry={cap} material={MAT.darkMetal} castShadow />
    </group>
  );
}

/* ---------------- Tables & chairs ---------------- */

const TABLES: [number, number][] = [
  [-13.2, 12.9],
  [-9.8, 12.9],
  [-6.4, 12.9],
  [6.4, 12.9],
  [9.8, 12.9],
  [13.2, 12.9],
  [-14.8, 5.0],
  [-14.8, -2.0],
  [-14.8, -9.0],
  [14.8, 5.0],
  [14.8, -2.0],
  [14.8, -9.0],
];

function buildChairItems(): InstanceItem[] {
  const items: InstanceItem[] = [];
  TABLES.forEach(([tx, tz], ti) => {
    const base = Math.PI / 4 + (ti % 2 === 0 ? 0 : Math.PI / 8);
    for (let k = 0; k < 4; k++) {
      const a = base + (k * Math.PI * 2) / 4;
      const x = tx + Math.cos(a) * 0.74;
      const z = tz + Math.sin(a) * 0.74;
      items.push({ p: [x, 0.05, z], r: [0, Math.atan2(tx - x, tz - z), 0] });
    }
  });
  return items;
}

/* ---------------- Wood deck: continuous from the tower plinth to the kerb ---------------- */

function buildWoodDeck(): G {
  const Y = 0.025; // plank centre → top sits 0.05 above the roof surface
  const depth = HALF_D - PLINTH_Z; // 4.25
  const sideW = HALF_W - PLINTH_X; // 4.25
  // ONE continuous plank field from the glazing line out to the kerb. The plinth
  // covers it where it is not notched, so there is no seam at the lobby edge —
  // two separate blocks left a ~30 cm dark line across the deck there.
  return merge([
    plankFloor(HALF_W * 2, 5.38, 0, Y, 12.305), // front strip (glazing line → kerb)
    plankFloor(HALF_W * 2, depth, 0, Y, -(PLINTH_Z + depth / 2)), // back strip (full width)
    plankFloor(sideW, PLINTH_Z * 2, PLINTH_X + sideW / 2, Y, 0, false), // east strip
    plankFloor(sideW, PLINTH_Z * 2, -(PLINTH_X + sideW / 2), Y, 0, false), // west strip
  ]);
}

/* ---------------- Planters & trees ---------------- */

/**
 * Same eight planter positions as before (nothing moved, circulation untouched) but
 * each one is now a tapered cast-stone trough with a proud rim and a mixed row of
 * properly modelled plants instead of a single green block.
 */
const PLANTERS: TroughSpec[] = [
  // front, behind the table row (gap in the middle for the exit walkway)
  { x: -9.8, y: 0.05, z: 14.55, len: 10.6, tone: 0 },
  { x: 9.8, y: 0.05, z: 14.55, len: 10.6, tone: 2 },
  // sides, against the kerb
  { x: -16.62, y: 0.05, z: 6.0, len: 5.0, alongZ: true, tone: 1 },
  { x: -16.62, y: 0.05, z: -3.0, len: 5.0, alongZ: true, tone: 2 },
  { x: 16.62, y: 0.05, z: 6.0, len: 5.0, alongZ: true, tone: 2 },
  { x: 16.62, y: 0.05, z: -3.0, len: 5.0, alongZ: true, tone: 1 },
  // back
  { x: -8.0, y: 0.05, z: -14.6, len: 9.0, tone: 1 },
  { x: 8.0, y: 0.05, z: -14.6, len: 9.0, tone: 0 },
];

/**
 * Flower tones per terrace planter — each trough keeps one or two colours so
 * the beds read as designed, and neighbouring troughs differ.
 */
const PLANTER_TONES: number[][] = [
  [0, 2],
  [1, 3],
  [2, 1],
  [4, 0],
];

const TREES: TreeSpec[] = [
  { p: [-15.9, 0.05, 13.7], ry: 0.3, s: 1.0, v: 0, leaf: 1, pot: 0, potShape: 0, potTone: 0, potScale: 2.2 },
  { p: [15.9, 0.05, 13.7], ry: 2.1, s: 1.0, v: 1, leaf: 2, pot: 0, potShape: 1, potTone: 1, potScale: 2.2 },
  { p: [-15.9, 0.05, -13.7], ry: 4.0, s: 1.1, v: 1, leaf: 0, pot: 0, potShape: 2, potTone: 5, potScale: 2.3 },
  { p: [15.9, 0.05, -13.7], ry: 5.3, s: 1.1, v: 0, leaf: 3, pot: 0, potShape: 0, potTone: 3, potScale: 2.3 },
];

/* ---------------- Glazed exit onto the terrace ---------------- */
/*
 * Flush shopfront door in the same plane as the first-floor sidelights (tower
 * face −0.3 = z 9.7). The glass fills the whole opening from the deck to the
 * window head — no projecting bulkhead, no dark head panel, no brass cap or
 * sill — so the door reads as part of the continuous first-floor glazing.
 * Only slim dark mullions divide it, as on the main entrance.
 *
 * Depth layering, each layer just proud of the one behind it:
 *   glow 9.65 → glass 9.685…9.715 → mullions 9.72…9.80 → pulls 9.72…9.78
 */

const GLASS_Z = TOWER_FRONT - 0.3; // 9.7 — the window plane
const DECK = TERRACE_EXIT.doorBottom;
/** Level with the first-floor window head, so both read as one glazed wall. */
const GLASS_TOP = TOWER.fh - 0.08;
const HALF = TERRACE_EXIT.doorHalfWidth + 0.17; // 1.22 — meets the sidelights
const MULL = 0.075;
const FRAME_Z0 = GLASS_Z + 0.02;
const FRAME_Z1 = GLASS_Z + 0.1;

/** Warm interior glow behind the glass, inside the tower core. */
function buildExitGlow(): G {
  return bx(-HALF + 0.03, HALF - 0.03, DECK + 0.02, GLASS_TOP - 0.02, GLASS_Z - 0.05, GLASS_Z - 0.02);
}

/** Two full-height glass leaves filling the whole opening. */
function buildExitDoors(): G {
  const seam = 0.018;
  return merge([
    bx(-HALF, -seam, DECK, GLASS_TOP, GLASS_Z - 0.015, GLASS_Z + 0.015),
    bx(seam, HALF, DECK, GLASS_TOP, GLASS_Z - 0.015, GLASS_Z + 0.015),
  ]);
}

/** Slim dark mullions only: two outer jambs plus the meeting stile. */
function buildExitDark(): G {
  return merge(
    [-HALF, 0, HALF].map((x) => bx(x - MULL / 2, x + MULL / 2, DECK, GLASS_TOP, FRAME_Z0, FRAME_Z1)),
  );
}

/** Paired bronze pulls, matching the entrance doors. No caps, no sill. */
function buildExitBronze(): G {
  return merge([-0.14, 0.14].map((x) => bx(x - 0.025, x + 0.025, 0.95, 1.85, GLASS_Z + 0.02, GLASS_Z + 0.08)));
}

/* ------------------------------------------------------------------ */

export function PodiumTerrace() {
  const wood = useMemo(buildWoodDeck, []);
  const exitDark = useMemo(buildExitDark, []);
  const doors = useMemo(buildExitDoors, []);
  const exitBronze = useMemo(buildExitBronze, []);
  const exitGlow = useMemo(buildExitGlow, []);

  const plant = useMemo(
    () =>
      (t: TroughSpec, i: number) =>
        troughFlowerRow(t, 1207 + i * 53, {
          tones: PLANTER_TONES[i % PLANTER_TONES.length],
        }),
    [],
  );

  const chairs = useMemo(makeChairGeos, []);
  const chairItems = useMemo(buildChairItems, []);
  const tableItems = useMemo<InstanceItem[]>(() => TABLES.map(([x, z]) => ({ p: [x, 0.05, z] })), []);

  const tableTop = useMemo(() => new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18).translate(0, 0.74, 0), []);
  const tableBase = useMemo(
    () => merge([cyl(0.035, 0.035, 0.7, 0, 0.36, 0, 8), cyl(0.26, 0.28, 0.04, 0, 0.02, 0, 14)]),
    [],
  );

  return (
    <group name="PodiumTerrace" position={[0, PODIUM.h, 0]}>
      <mesh name="Terrace_Deck_Wood" geometry={wood} material={MAT.wood} receiveShadow />

      <mesh name="Terrace_Exit_Bulkhead" geometry={exitDark} material={MAT.darkMetal} castShadow receiveShadow />
      <mesh name="Terrace_Exit_Glow" geometry={exitGlow} material={MAT.interiorGlow} />
      <mesh name="Terrace_Exit_Doors" geometry={doors} material={MAT.glass} renderOrder={12} />
      <mesh name="Terrace_Exit_Frames" geometry={exitBronze} material={MAT.bronze} castShadow />

      <Instances name="Terrace_TableTops" geometry={tableTop} material={MAT.white} items={tableItems} castShadow />
      <Instances name="Terrace_TableBases" geometry={tableBase} material={MAT.darkMetal} items={tableItems} />
      <Instances name="Terrace_Chairs_Seat" geometry={chairs.soft} material={MAT.cream} items={chairItems} castShadow />
      <Instances name="Terrace_Chairs_Frame" geometry={chairs.frame} material={MAT.darkMetal} items={chairItems} />

      <TroughPlanters name="Terrace_Planters" troughs={PLANTERS} planting={plant} />
      <Trees name="Terrace_Trees" items={TREES} />

      <pointLight name="PL_Terrace" position={[0, 2.6, FRONT - 3]} color="#ffcf9c" intensity={22} distance={16} decay={2} />
    </group>
  );
}
