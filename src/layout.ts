export type Point2 = [number, number];
export interface SiteRect { x0: number; x1: number; z0: number; z1: number }

// All site surfaces use this plan; paths, planting and cars cannot drift independently.
export const SITE = {
  halfWidth: 48,
  back: -25,
  gateZ: 34,
  gatePierX: 9,
  driveHalfWidth: 5,
  roadY: 0,
  pavingY: 0.18,
  lawnY: 0.11,
  curbWidth: 0.22,
  streetNear: 43,
  streetFar: 57,
  driveFront: 33.4,
  driveBack: -24.2,
  courtFront: 25.8,
} as const;

export const ENTRY = {
  halfWidth: 12.4,
  back: 15.6,
  landingFront: 21.8,
  rampFront: 23,
  surfaceY: 0.22,
} as const;

export const PARK = {
  innerEdge: 21.45,
  innerAisleEdge: 26.85,
  outerAisleEdge: 34.05,
  outerEdge: 39.45,
  aisleCenter: 30.45,
  aisleWidth: 7.2,
  innerRow: 24.15,
  outerRow: 36.75,
  bayDepth: 5.4,
  bayWidth: 3,
  startZ: -12.4,
  count: 10,
  crossingZ0: 19.2,
  crossingZ1: 22.2,
  outerWalkX0: 39.67,
  outerWalkX1: 42.67,
} as const;

export const COURT_OUTLINE: Point2[] = [
  [-21.2, -17.8], [21.2, -17.8], [21.2, 23.5],
  [18.9, SITE.courtFront], [-18.9, SITE.courtFront], [-21.2, 23.5],
];

export const DRIVE_INNER: Point2[] = [
  [-21.45, -18], [21.45, -18], [21.45, 23.6],
  [19.1, 26], [-19.1, 26], [-21.45, 23.6],
];

export const BUILDING_AND_ENTRY: Point2[] = [
  [-17.6, -15.6], [17.6, -15.6], [17.6, 15.6],
  [ENTRY.halfWidth, 15.6], [ENTRY.halfWidth, ENTRY.rampFront],
  [-ENTRY.halfWidth, ENTRY.rampFront], [-ENTRY.halfWidth, 15.6], [-17.6, 15.6],
];

export const COURT_BEDS: SiteRect[] = [
  { x0: -17.3, x1: -13.1, z0: 16.6, z1: 21.3 },
  { x0: 13.1, x1: 17.3, z0: 16.6, z1: 21.3 },
];

export const PERIMETER_BEDS: SiteRect[] = [
  { x0: -47.4, x1: -43.15, z0: -20.8, z1: 29 },
  { x0: 43.15, x1: 47.4, z0: -20.8, z1: 29 },
];

/** Street / court trees, planted directly into the lawn beds (no pots, no clutter). */
export const GROUND_TREES: Point2[] = [
  [-15.2, 18.9], [15.2, 18.9],
  [-45.4, -6], [-45.4, 14], [45.4, -6], [45.4, 14],
];

/**
 * Low shrub groups tucked into the court lawn beds. They replace the old
 * copy-pasted block planter: a soft, varied massing that reads as planting.
 */
export const COURT_SHRUBS: Point2[] = [
  [-16.6, 17.6], [-15.4, 20.3], [-14.2, 17.4],
  [16.6, 17.6], [15.4, 20.3], [14.2, 17.4],
];

export const SITE_LAMPS: Point2[] = [
  [-44.2, -13], [-44.2, 4], [-44.2, 26],
  [44.2, -13], [44.2, 4], [44.2, 26],
];

/**
 * Gate runtime state. Toggled from the inspector, animated in PerimeterWall.
 * Mutable on purpose: read in the frame loop without re-rendering the scene.
 */
export const gateState = { open: true };

export interface ParkingBay extends SiteRect {
  id: string;
  side: -1 | 1;
  row: 'inner' | 'outer';
  index: number;
  cx: number;
  cz: number;
  rotation: number;
}

export const PARKING_BAYS: ParkingBay[] = ([-1, 1] as const).flatMap((side) =>
  (['inner', 'outer'] as const).flatMap((row) =>
    Array.from({ length: PARK.count }, (_, index) => {
      const cx = side * (row === 'inner' ? PARK.innerRow : PARK.outerRow);
      const cz = PARK.startZ + (index + 0.5) * PARK.bayWidth;
      return {
        id: `${side < 0 ? 'W' : 'E'}-${row}-${index + 1}`,
        side, row, index, cx, cz,
        x0: cx - PARK.bayDepth / 2,
        x1: cx + PARK.bayDepth / 2,
        z0: cz - PARK.bayWidth / 2,
        z1: cz + PARK.bayWidth / 2,
        rotation: side * (row === 'inner' ? 1 : -1) * Math.PI / 2,
      };
    }),
  ),
);

const OCCUPIED = new Set([
  'W-inner-2', 'W-inner-5', 'W-inner-8', 'W-outer-1', 'W-outer-4', 'W-outer-6', 'W-outer-9',
  'E-inner-1', 'E-inner-3', 'E-inner-6', 'E-inner-9', 'E-outer-2', 'E-outer-5', 'E-outer-8', 'E-outer-10',
]);
export const OCCUPIED_BAYS = PARKING_BAYS.filter((bay) => OCCUPIED.has(bay.id));

export function inPolygon([x, z]: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

export function isDrivable([x, z]: Point2): boolean {
  const loop = Math.abs(x) <= PARK.outerEdge && z >= SITE.driveBack && z <= SITE.driveFront
    && !inPolygon([x, z], DRIVE_INNER);
  const throat = Math.abs(x) <= SITE.driveHalfWidth && z >= SITE.driveFront && z <= SITE.streetNear;
  const street = Math.abs(x) <= 100 && z >= SITE.streetNear && z <= SITE.streetFar;
  return loop || throat || street;
}

interface RoutePose { x: number; z: number; dx: number; dz: number }

/** A 6 m centreline-radius circuit used for clearance checks and optional game navigation. */
export function vehicleCircuit(): RoutePose[] {
  const route: RoutePose[] = [];
  const straight = (a: Point2, b: Point2) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(length / 0.5);
    for (let i = 0; i <= n; i++) route.push({
      x: a[0] + (b[0] - a[0]) * i / n,
      z: a[1] + (b[1] - a[1]) * i / n,
      dx: (b[0] - a[0]) / length, dz: (b[1] - a[1]) / length,
    });
  };
  const arc = (x: number, z: number, a: number, b: number) => {
    const sign = Math.sign(b - a);
    for (let i = 0; i <= 32; i++) {
      const t = a + (b - a) * i / 32;
      route.push({ x: x + 6 * Math.cos(t), z: z + 6 * Math.sin(t), dx: -Math.sin(t) * sign, dz: Math.cos(t) * sign });
    }
  };
  straight([-2.5, 43], [-2.5, 35.7]);
  arc(3.5, 35.7, Math.PI, Math.PI * 1.5);
  straight([3.5, 29.7], [24.45, 29.7]);
  arc(24.45, 23.7, Math.PI / 2, 0);
  straight([30.45, 23.7], [30.45, -15.1]);
  arc(24.45, -15.1, 0, -Math.PI / 2);
  straight([24.45, -21.1], [-24.45, -21.1]);
  arc(-24.45, -15.1, -Math.PI / 2, -Math.PI);
  straight([-30.45, -15.1], [-30.45, 23.7]);
  arc(-24.45, 23.7, Math.PI, Math.PI / 2);
  straight([-24.45, 29.7], [-3.5, 29.7]);
  arc(-3.5, 35.7, -Math.PI / 2, 0);
  straight([2.5, 35.7], [2.5, 43]);
  return route;
}

export const PEDESTRIAN_ROUTES: Point2[][] = [
  [[-41.1, -10], [-41.1, 20.7], [-19.3, 20.7], [-19.3, 22.5], [0, 22.5], [0, 16.5]],
  [[41.1, -10], [41.1, 20.7], [19.3, 20.7], [19.3, 22.5], [0, 22.5], [0, 16.5]],
  [[-6.75, 42], [-6.75, 24], [0, 24], [0, 16.5]],
  [[6.75, 42], [6.75, 24], [0, 24], [0, 16.5]],
];

function within([x, z]: Point2, area: SiteRect): boolean {
  return x >= area.x0 && x <= area.x1 && z >= area.z0 && z <= area.z1;
}

function isPedestrianSurface(point: Point2): boolean {
  const [x, z] = point;
  const ax = Math.abs(x);
  const building = ax < 17.6 && z > -15.6 && z < 15.6;
  const court = inPolygon(point, COURT_OUTLINE) && !building;
  const outerWalk = ax >= PARK.outerWalkX0 && ax <= PARK.outerWalkX1 && z >= -14.4 && z <= PARK.crossingZ1;
  const crossing = ax >= 19.8 && ax <= PARK.outerWalkX1 && z >= PARK.crossingZ0 && z <= PARK.crossingZ1;
  const gateWalk = ax >= 5.25 && ax <= 8.25 && z >= 24.4 && z <= 43;
  if (!(court || outerWalk || crossing || gateWalk)) return false;
  if (COURT_BEDS.some((bed) => within(point, bed))) return false;
  return true;
}

/** Analytical checks only; the host game still owns physics/collision integration. */
export function validateSiteLayout(): string[] {
  const errors: string[] = [];
  for (const bay of OCCUPIED_BAYS) {
    if (bay.cx - 2.3 < bay.x0 || bay.cx + 2.3 > bay.x1
      || bay.cz - 1.08 < bay.z0 || bay.cz + 1.08 > bay.z1) errors.push(`Car outside bay ${bay.id}`);
  }
  for (const pose of vehicleCircuit()) {
    for (const length of [-2.3, 0, 2.3]) {
      for (const width of [-1.08, 0, 1.08]) {
        const point: Point2 = [pose.x + pose.dx * length - pose.dz * width, pose.z + pose.dz * length + pose.dx * width];
        if (!isDrivable(point)) {
          errors.push(`Drive clearance at ${point[0].toFixed(2)}, ${point[1].toFixed(2)}`);
          return errors;
        }
        if (OCCUPIED_BAYS.some((bay) => within(point, {
          x0: bay.cx - 2.3, x1: bay.cx + 2.3, z0: bay.cz - 1.08, z1: bay.cz + 1.08,
        }))) {
          errors.push(`Car overlap at ${point[0].toFixed(2)}, ${point[1].toFixed(2)}`);
          return errors;
        }
      }
    }
  }
  for (const route of PEDESTRIAN_ROUTES) {
    for (const point of route) {
      if (!isPedestrianSurface(point)) {
        errors.push(`Walk route at ${point[0].toFixed(2)}, ${point[1].toFixed(2)}`);
        return errors;
      }
    }
  }
  return errors;
}
