import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { box, cyl, merge, type G } from './geo';
import { Instances, type InstanceItem } from './Instances';

/* Rooftop local space. */
/** [x, z, chairCount?] — chairCount defaults to 3. */
export const TABLES: [number, number, number?][] = [
  // under the mid-terrace pergola
  [-2.8, 0.2],
  [0.4, 0.2],
  [3.6, 0.2],
  [-2.8, 3.2],
  [0.4, 3.2],
  [3.6, 3.2],
  [-2.8, 6.2],
  [0.4, 6.2],
  [3.6, 6.2],
  // inside the glass pavilion
  [-1.2, -6.3],
  [2.2, -6.3],
  [5.6, -6.3],
];
/** Lounge cluster on the cantilevered sky terrace. */
export const FIRE_PIT: [number, number] = [-8.2, 10.6];

/**
 * Tables that carry a folded menu card. A deliberate subset — most tables are
 * left bare, so the dining terrace does not read as uniformly dressed. The
 * list is fixed rather than randomised so the result is identical on reload.
 */
const MENU_TABLES = [1, 4, 6, 9, 11];

/** Table-top surface height: tops are cylinders centred at 0.74, 0.05 thick. */
const TABLE_TOP_Y = 0.766; // 1 mm clear of the surface to avoid z-fighting

/**
 * Folded tent-card menu: two cream panels leaning together under a dark spine.
 * Built in local space with the feet at y=0, then instanced onto tables.
 */
function buildMenuCardGeometry(): { panel: G; spine: G } {
  const W = 0.17;   // card width
  const H = 0.20;   // panel length
  const T = 0.006;  // panel thickness
  const A = 0.30;   // lean angle (rad)
  const cos = Math.cos(A);
  const sin = Math.sin(A);
  const panel = (sign: number) => {
    const g = new THREE.BoxGeometry(W, H, T);
    g.rotateX(sign * -A);
    g.translate(0, H / 2 * cos, sign * H / 2 * sin);
    return g;
  };
  return {
    panel: merge([panel(1), panel(-1)]),
    // Spine caps the ridge, so the card reads as folded rather than two sheets.
    spine: new THREE.BoxGeometry(W + 0.008, 0.014, 0.032).translate(0, H * cos, 0),
  };
}

/** One item per dressed table, with a small deterministic orientation spread. */
function buildMenuItems(): InstanceItem[] {
  return MENU_TABLES.map((ti) => {
    const [x, z] = TABLES[ti];
    return { p: [x, TABLE_TOP_Y, z], r: [0, (ti * 0.73) % (Math.PI * 2), 0] };
  });
}

/** Shared chair geometry so the stage seating reuses the same shapes. */
export function makeChairGeos() {
  return {
    soft: merge([box(0.42, 0.06, 0.42, 0, 0.46, 0), box(0.42, 0.44, 0.05, 0, 0.72, -0.19)]),
    frame: merge([
      box(0.03, 0.44, 0.03, -0.18, 0.22, -0.18),
      box(0.03, 0.44, 0.03, 0.18, 0.22, -0.18),
      box(0.03, 0.44, 0.03, -0.18, 0.22, 0.18),
      box(0.03, 0.44, 0.03, 0.18, 0.22, 0.18),
    ]),
  };
}

function buildChairItems(): InstanceItem[] {
  const items: InstanceItem[] = [];
  TABLES.forEach(([tx, tz, n = 3], ti) => {
    const base = n === 4 ? Math.PI / 4 : ti % 2 === 0 ? 0 : Math.PI / 3;
    for (let k = 0; k < n; k++) {
      const a = base + (k * Math.PI * 2) / n + Math.PI / 2;
      const r = 0.74;
      const x = tx + Math.cos(a) * r;
      const z = tz + Math.sin(a) * r;
      const ry = Math.atan2(tx - x, tz - z);
      items.push({ p: [x, 0, z], r: [0, ry, 0] });
    }
  });
  return items;
}

function buildLoungeDark(): G {
  const [fx, fz] = FIRE_PIT;
  const p: G[] = [];
  // Sofa bases
  p.push(box(0.85, 0.36, 3.6, -10.5, 0.18, fz)); // west sofa
  p.push(box(3.2, 0.36, 0.85, fx, 0.18, fz - 2.3)); // north sofa
  p.push(box(3.2, 0.36, 0.85, fx, 0.18, fz + 2.3)); // south sofa
  // Side tables
  p.push(box(0.45, 0.42, 0.45, -10.5, 0.21, fz - 2.2));
  p.push(box(0.45, 0.42, 0.45, -10.5, 0.21, fz + 2.2));
  // Coffee table ring around the fire pit
  p.push(cyl(1.0, 1.0, 0.12, fx, 0.34, fz, 22));
  return merge(p);
}

function buildLoungeCushions(): G {
  const [fx, fz] = FIRE_PIT;
  const p: G[] = [];
  p.push(box(0.8, 0.14, 3.5, -10.5, 0.43, fz));
  p.push(box(3.1, 0.14, 0.8, fx, 0.43, fz - 2.3));
  p.push(box(3.1, 0.14, 0.8, fx, 0.43, fz + 2.3));
  // Back cushions
  p.push(box(0.2, 0.46, 3.5, -10.82, 0.73, fz));
  p.push(box(3.1, 0.46, 0.2, fx, 0.73, fz - 2.62));
  p.push(box(3.1, 0.46, 0.2, fx, 0.73, fz + 2.62));
  return merge(p);
}

function buildAccentPillows(): G {
  const [fx, fz] = FIRE_PIT;
  return merge([
    box(0.12, 0.34, 0.34, -10.68, 0.68, fz - 1.1),
    box(0.12, 0.34, 0.34, -10.68, 0.68, fz + 1.1),
    box(0.34, 0.34, 0.12, fx - 1.0, 0.68, fz - 2.48),
    box(0.34, 0.34, 0.12, fx + 1.0, 0.68, fz + 2.48),
    box(0.34, 0.34, 0.12, fx - 1.0, 0.68, fz + 2.48),
    box(0.34, 0.34, 0.12, fx + 1.0, 0.68, fz - 2.48),
  ]);
}

function buildFirePitConcrete(): G {
  const [fx, fz] = FIRE_PIT;
  return merge([cyl(0.66, 0.72, 0.42, fx, 0.21, fz, 22)]);
}

function buildFireGlow(): G {
  const [fx, fz] = FIRE_PIT;
  return merge([cyl(0.46, 0.46, 0.04, fx, 0.43, fz, 18)]);
}

function buildPinkLed(): G {
  const [fx, fz] = FIRE_PIT;
  return merge([
    box(0.04, 0.04, 3.4, -10.08, 0.05, fz),
    box(3.0, 0.04, 0.04, fx, 0.05, fz - 1.88),
    box(3.0, 0.04, 0.04, fx, 0.05, fz + 1.88),
  ]);
}

export function SeatingArea() {
  const tableTop = useMemo(() => new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18).translate(0, 0.74, 0), []);
  const tableBase = useMemo(
    () => merge([cyl(0.035, 0.035, 0.7, 0, 0.36, 0, 8), cyl(0.26, 0.28, 0.04, 0, 0.02, 0, 14)]),
    [],
  );
  const chairSoft = useMemo(
    () => merge([box(0.42, 0.06, 0.42, 0, 0.46, 0), box(0.42, 0.44, 0.05, 0, 0.72, -0.19)]),
    [],
  );
  const chairFrame = useMemo(
    () =>
      merge([
        box(0.03, 0.44, 0.03, -0.18, 0.22, -0.18),
        box(0.03, 0.44, 0.03, 0.18, 0.22, -0.18),
        box(0.03, 0.44, 0.03, -0.18, 0.22, 0.18),
        box(0.03, 0.44, 0.03, 0.18, 0.22, 0.18),
      ]),
    [],
  );

  const tableItems = useMemo<InstanceItem[]>(() => TABLES.map(([x, z]) => ({ p: [x, 0, z] })), []);
  const chairItems = useMemo(buildChairItems, []);
  // Folded menu cards on a subset of the dining tables.
  const menuCard = useMemo(buildMenuCardGeometry, []);
  const menuItems = useMemo(buildMenuItems, []);

  const loungeDark = useMemo(buildLoungeDark, []);
  const cushions = useMemo(buildLoungeCushions, []);
  const pillows = useMemo(buildAccentPillows, []);
  const pitConcrete = useMemo(buildFirePitConcrete, []);
  const fire = useMemo(buildFireGlow, []);
  const pink = useMemo(buildPinkLed, []);

  return (
    <group name="SeatingArea">
      <Instances name="Dining_TableTops" geometry={tableTop} material={MAT.white} items={tableItems} castShadow />
      <Instances name="Dining_TableBases" geometry={tableBase} material={MAT.darkMetal} items={tableItems} />
      <Instances name="Dining_Chairs_Seat" geometry={chairSoft} material={MAT.cream} items={chairItems} castShadow />
      <Instances name="Dining_Chairs_Frame" geometry={chairFrame} material={MAT.darkMetal} items={chairItems} />
      <Instances name="Dining_Menu_Cards" geometry={menuCard.panel} material={MAT.cream} items={menuItems} castShadow />
      <Instances name="Dining_Menu_Spines" geometry={menuCard.spine} material={MAT.darkMetal} items={menuItems} />
      <mesh name="Lounge_Frames" geometry={loungeDark} material={MAT.darkMetal} castShadow receiveShadow />
      <mesh name="Lounge_Cushions" geometry={cushions} material={MAT.cream} castShadow />
      <mesh name="Lounge_Pillows" geometry={pillows} material={MAT.coral} />
      <mesh name="FirePit_Concrete" geometry={pitConcrete} material={MAT.concrete} castShadow />
      <mesh name="FirePit_Glow" geometry={fire} material={MAT.fire} />
      <mesh name="Lounge_LED_Pink" geometry={pink} material={MAT.neonPink} />
    </group>
  );
}
