import { useMemo } from 'react';
import { GROUND_TREES, COURT_SHRUBS, SITE } from './layout';
import { Instances, type InstanceItem } from './Instances';
import {
  TroughPlanters,
  Trees,
  plantAssets,
  troughFlowerRow,
  LEAF_TONES,
  type TroughSpec,
  type TreeSpec,
} from './Plants';
import { MAT } from './materials';

/* ================================================================== */
/*  ROOFTOP (roof-local space)                                         */
/*  Planting stays OFF the circulation loop: one back-east planter and  */
/*  three corner accent trees. Nothing encroaches on the walkways.     */
/* ================================================================== */

const ROOF_TROUGH: TroughSpec[] = [{ x: 11.3, y: 0, z: -7.8, len: 3.2, alongZ: true, tone: 1 }];

const ROOF_TREES: TreeSpec[] = [
  // back-east corner accent
  { p: [11.1, 0, -5.2], ry: 0.4, s: 1.0, v: 0, leaf: 2, pot: 0, potShape: 0, potTone: 0, potScale: 2.1 },
  // paired trees frame the pool approach without occupying its walkways
  { p: [-10.65, 0, 14.4], ry: 1.15, s: 0.95, v: 1, leaf: 1, pot: 0, potShape: 1, potTone: 2, potScale: 2.1 },
  { p: [10.65, 0, 14.4], ry: 2.3, s: 0.95, v: 0, leaf: 3, pot: 0, potShape: 2, potTone: 5, potScale: 2.2 },
];

export function RooftopDecor() {
  const plant = useMemo(
    () => (t: TroughSpec) => troughFlowerRow(t, 881, { tones: [0, 3] }),
    [],
  );
  return (
    <group name="Decor_Rooftop">
      <TroughPlanters name="Roof_Planters" troughs={ROOF_TROUGH} planting={plant} />
      <Trees name="Roof_Trees" items={ROOF_TREES} />
    </group>
  );
}

/* ================================================================== */
/*  GROUND / FORECOURT (world space)                                   */
/* ================================================================== */

/** Forecourt + perimeter trees planted straight into the shared lawn beds. */
export const SITE_TREES: TreeSpec[] = GROUND_TREES.map(([x, z], i) => ({
  p: [x, SITE.lawnY, z],
  ry: i * 1.37,
  s: i < 2 ? 1.18 : 1.42,
  v: i % 2,
  leaf: (i * 2 + 1) % LEAF_TONES.length,
}));

/**
 * Low shrub masses tucked into the court lawn beds, plus a light understory
 * along the perimeter tree line. Stays inside the existing planting beds.
 */
const EXTRA_SHRUBS: [number, number][] = [
  [-15.8, 19.6], [-14.8, 18.2], [15.8, 19.6], [14.8, 18.2],
  [-45.4, 4], [-45.4, 22], [45.4, 4], [45.4, 22],
];
const SHRUB_ITEMS: InstanceItem[] = [...COURT_SHRUBS, ...EXTRA_SHRUBS].map(([x, z], i) => ({
  p: [x, SITE.lawnY, z],
  r: [0, i * 2.1, 0],
  s: 1.4 + (i % 3) * 0.28,
  c: LEAF_TONES[(i * 3) % LEAF_TONES.length],
}));

export function SiteDecor() {
  const shrub = plantAssets().leaf[2];
  return (
    <group name="Decor_Site">
      <Trees name="Site_Trees" items={SITE_TREES} castShadow={false} />
      <Instances
        name="Site_Shrub_Foliage"
        geometry={shrub}
        material={MAT.foliage}
        items={SHRUB_ITEMS}
        castShadow={false}
      />
    </group>
  );
}
