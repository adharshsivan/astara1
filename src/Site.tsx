import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MAT } from './materials';
import { box, merge, rng, type G } from './geo';
import { Instances, type InstanceItem } from './Instances';
import {
  SITE, PARK, DRIVE_INNER, BUILDING_AND_ENTRY, COURT_BEDS,
  PERIMETER_BEDS, OCCUPIED_BAYS, PARKING_BAYS, PEDESTRIAN_ROUTES,
  gateState, vehicleCircuit, validateSiteLayout, type Point2, type SiteRect,
} from './layout';
import { getPavingMaterial, insetRect, mergeSite, ramp, rampX, rectPoints, roundedRect, siteSurface } from './siteGeometry';

const rect = (x0: number, x1: number, z0: number, z1: number): SiteRect => ({ x0, x1, z0, z1 });
const slab = (area: SiteRect, top: number, bottom = -0.06) => siteSurface(rectPoints(area), bottom, top);
const reflect = (points: Point2[], side: number): Point2[] => points.map(([x, z]) => [side * x, z]);
const roadPaint = (w: number, d: number, x: number, z: number) => box(w, 0.005, d, x, 0.0055, z);

function buildDrive() {
  return mergeSite([
    siteSurface(rectPoints(rect(-PARK.outerEdge, PARK.outerEdge, SITE.driveBack, SITE.driveFront)), -0.08, SITE.roadY, [DRIVE_INNER]),
    slab(rect(-SITE.driveHalfWidth, SITE.driveHalfWidth, SITE.driveFront, SITE.streetNear), SITE.roadY, -0.08),
    slab(rect(-100, 100, SITE.streetNear, SITE.streetFar), SITE.roadY, -0.08),
  ]);
}

function buildPaving() {
  // Notches reserve real sloped connections instead of overlaying ramps on a flat path.
  const court: Point2[] = [
    [-21.2, -17.8], [21.2, -17.8], [21.2, 19.2], [19.8, 19.2],
    [19.8, 22.2], [21.2, 22.2], [21.2, 23.5], [18.9, 25.8],
    [8.25, 25.8], [8.25, 24.4], [5.25, 24.4], [5.25, 25.8],
    [-5.25, 25.8], [-5.25, 24.4], [-8.25, 24.4], [-8.25, 25.8],
    [-18.9, 25.8], [-21.2, 23.5], [-21.2, 22.2], [-19.8, 22.2],
    [-19.8, 19.2], [-21.2, 19.2],
  ];
  const parts: G[] = [siteSurface(court, -0.06, SITE.pavingY, [
    BUILDING_AND_ENTRY, ...COURT_BEDS.map((bed) => roundedRect(bed)),
  ])];

  for (const side of [-1, 1]) {
    const positiveWalk: Point2[] = [
      [PARK.outerWalkX0, -14.4], [PARK.outerWalkX1, -14.4],
      [PARK.outerWalkX1, 22.2], [41.25, 22.2], [41.25, 19.2], [PARK.outerWalkX0, 19.2],
    ];
    parts.push(siteSurface(reflect(positiveWalk, side), -0.06, SITE.pavingY));
    parts.push(side > 0
      ? rampX(rect(19.8, PARK.innerEdge, 19.2, 22.2), SITE.pavingY, SITE.roadY)
      : rampX(rect(-PARK.innerEdge, -19.8, 19.2, 22.2), SITE.roadY, SITE.pavingY));
    parts.push(side > 0
      ? rampX(rect(PARK.outerEdge, 41.25, 19.2, 22.2), SITE.roadY, SITE.pavingY)
      : rampX(rect(-41.25, -PARK.outerEdge, 19.2, 22.2), SITE.pavingY, SITE.roadY));

    const xa = side > 0 ? 5.25 : -8.25;
    const xb = side > 0 ? 8.25 : -5.25;
    parts.push(ramp(rect(xa, xb, 24.4, 26), SITE.pavingY, SITE.roadY));
    parts.push(ramp(rect(xa, xb, SITE.driveFront, 34.9), SITE.roadY, SITE.pavingY));
    parts.push(slab(rect(xa, xb, 34.9, 40.5), SITE.pavingY));
  }
  // The city sidewalk has a real 10.5 m opening at the driveway.
  parts.push(slab(rect(-100, -5.25, 40.5, 42.78), SITE.pavingY));
  parts.push(slab(rect(5.25, 100, 40.5, 42.78), SITE.pavingY));
  parts.push(slab(rect(-100, 100, 57.22, 59.5), SITE.pavingY));
  return mergeSite(parts);
}

function buildLandscape() {
  const grass: G[] = [];
  const edging: G[] = [];
  for (const bed of [...COURT_BEDS, ...PERIMETER_BEDS]) {
    const inner = insetRect(bed, SITE.curbWidth);
    const radius = COURT_BEDS.includes(bed) ? 0.6 : 0.9;
    const outerPoints = roundedRect(bed, radius);
    const innerPoints = roundedRect(inner, radius - SITE.curbWidth);
    grass.push(siteSurface(innerPoints, -0.06, SITE.lawnY));
    edging.push(siteSurface(outerPoints, -0.06, SITE.pavingY, [innerPoints]));
  }
  return { grass: mergeSite(grass), edging: mergeSite(edging) };
}

function buildCurbs() {
  const parts: G[] = [];
  const add = (area: SiteRect) => parts.push(slab(area, SITE.pavingY));
  add(rect(-21.45, 21.45, -18, -17.8));
  for (const side of [-1, 1]) {
    const mirrored = (area: SiteRect) => side > 0 ? area : rect(-area.x1, -area.x0, area.z0, area.z1);
    add(mirrored(rect(21.2, 21.45, -17.8, 19.2)));
    add(mirrored(rect(21.2, 21.45, 22.2, 23.5)));
    parts.push(siteSurface(reflect([
      [21.2, 23.5], [21.45, 23.5], [21.45, 23.6], [19.1, 26], [18.9, 25.8],
    ], side), -0.06, SITE.pavingY));
    add(mirrored(rect(PARK.outerEdge, PARK.outerWalkX0, -14.62, 19.2)));
    add(mirrored(rect(PARK.outerWalkX0, PARK.outerWalkX1, -14.62, -14.4)));
    add(mirrored(rect(PARK.outerWalkX1, PARK.outerWalkX1 + 0.22, -14.62, 22.42)));
    add(mirrored(rect(PARK.outerEdge, PARK.outerWalkX1, 22.2, 22.42)));
    add(mirrored(rect(5, 5.25, SITE.driveFront, SITE.streetNear)));
    add(mirrored(rect(5.25, 100, 42.78, SITE.streetNear)));
  }
  for (const [x0, x1] of [[-19.1, -8.25], [-5.25, 5.25], [8.25, 19.1]]) add(rect(x0, x1, 25.8, 26));
  add(rect(-100, 100, SITE.streetFar, 57.22));
  return mergeSite(parts);
}

function arrow(x: number, z: number, angle: number): G {
  const local: Point2[] = [[-0.13, 1.15], [0.13, 1.15], [0.13, -0.28], [0.58, -0.28], [0, -1.15], [-0.58, -0.28], [-0.13, -0.28]];
  const points: Point2[] = local.map(([px, pz]) => [x + px * Math.cos(angle) - pz * Math.sin(angle), z + px * Math.sin(angle) + pz * Math.cos(angle)]);
  return siteSurface(points, 0.003, 0.008);
}

function buildTrafficMarkings() {
  const parts: G[] = [];
  for (let x = -96; x < 100; x += 8) parts.push(roadPaint(3.4, 0.14, x, 50));
  for (const side of [-1, 1]) {
    // Full pedestrian links across the parking aisle, beyond the last parking bay.
    for (let x = PARK.innerEdge + 0.2; x < PARK.outerEdge - 0.1; x += 0.95) {
      parts.push(roadPaint(0.48, 2.8, side * x, 20.7));
    }
    // Gate footways cross the front drive via marked, flush crossings.
    for (let z = 26.3; z < SITE.driveFront - 0.2; z += 0.95) {
      parts.push(roadPaint(2.8, 0.48, side * 6.75, z));
    }
    parts.push(arrow(side * PARK.aisleCenter, 8.5, side > 0 ? 0 : Math.PI));
  }
  parts.push(arrow(-2.5, 38, 0), arrow(2.5, 38, Math.PI));
  return mergeSite(parts);
}

export function Ground({ lighting }: { night: boolean; lighting: boolean }) {
  const terrain = useMemo(() => new THREE.PlaneGeometry(230, 180).rotateX(-Math.PI / 2).translate(0, -0.06, 12), []);
  const drive = useMemo(buildDrive, []);
  const paving = useMemo(buildPaving, []);
  const landscape = useMemo(buildLandscape, []);
  const curbs = useMemo(buildCurbs, []);
  const markings = useMemo(buildTrafficMarkings, []);
  const material = useMemo(getPavingMaterial, []);
  const checks = useMemo(validateSiteLayout, []);
  const navigation = useMemo(() => ({
    units: 'metres', vehicleWidth: 2.16, vehicleLength: 4.6,
    aisleWidth: PARK.aisleWidth, minimumTurnRadius: 6,
    drivingCircuit: vehicleCircuit().map(({ x, z }) => [x, SITE.roadY, z]),
    pedestrianRoutes: PEDESTRIAN_ROUTES,
    validationErrors: checks,
  }), [checks]);
  void lighting;

  return (
    <group name="Site_Ground" userData={{ lokamNavigation: navigation }}>
      <mesh name="Context_Ground" geometry={terrain} material={MAT.plaza} receiveShadow />
      <mesh name="Continuous_Drive_And_Street" geometry={drive} material={MAT.ground} receiveShadow userData={{ surface: 'drivable' }} />
      <mesh name="Forecourt_And_Pedestrian_Paving" geometry={paving} material={material} receiveShadow userData={{ surface: 'walkable' }} />
      <mesh name="Contained_Lawn_Beds" geometry={landscape.grass} material={MAT.lawn} receiveShadow />
      <mesh name="Landscape_Edging" geometry={landscape.edging} material={MAT.concrete} receiveShadow />
      <mesh name="Continuous_Curbs_With_Crossing_Gaps" geometry={curbs} material={MAT.concrete} receiveShadow />
      <mesh name="Traffic_And_Crosswalk_Markings" geometry={markings} material={MAT.white} />
    </group>
  );
}

function buildBayLines() {
  const parts: G[] = [];
  for (const side of [-1, 1]) {
    for (const rowCenter of [PARK.innerRow, PARK.outerRow]) {
      for (let i = 0; i <= PARK.count; i++) parts.push(roadPaint(PARK.bayDepth, 0.085, side * rowCenter, PARK.startZ + i * PARK.bayWidth));
      const head = rowCenter === PARK.innerRow ? PARK.innerEdge : PARK.outerEdge;
      parts.push(roadPaint(0.085, PARK.count * PARK.bayWidth, side * head, PARK.startZ + PARK.count * PARK.bayWidth / 2));
    }
  }
  return merge(parts);
}

function buildWheelStops() {
  return merge(PARKING_BAYS.map((bay) => {
    const x = bay.side * (bay.row === 'inner' ? PARK.innerEdge + 0.45 : PARK.outerEdge - 0.45);
    return box(0.16, 0.09, 1.65, x, 0.045, bay.cz);
  }));
}

function carParts() {
  const body = merge([
    box(1.95, 0.66, 4.45, 0, 0.62, 0),
    box(1.86, 0.16, 2.6, 0, 0.98, -0.25),
    box(1.72, 0.56, 2.35, 0, 1.3, -0.3),
  ]);
  const glass = box(1.76, 0.5, 2.25, 0, 1.32, -0.3);
  const wheels = [[-0.94, 1.42], [0.94, 1.42], [-0.94, -1.42], [0.94, -1.42]].map(([x, z]) => {
    const geometry = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 10);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(x, 0.35, z);
    return geometry;
  });
  const dark = merge([...wheels, box(1.9, 0.14, 4.3, 0, 0.3, 0)]);
  const headlights = merge([-0.62, 0.62].map((x) => box(0.42, 0.16, 0.07, x, 0.86, 2.24)));
  const rearLights = merge([-0.62, 0.62].map((x) => box(0.42, 0.14, 0.07, x, 0.86, -2.24)));
  return { body, glass, dark, headlights, rearLights };
}

export function Parking() {
  const lines = useMemo(buildBayLines, []);
  const stops = useMemo(buildWheelStops, []);
  const cars = useMemo(carParts, []);
  const items = useMemo<InstanceItem[]>(() => {
    const random = rng(45821);
    const colors = ['#e8e7e1', '#364955', '#92382d', '#647b7a', '#bb9360', '#252a33'];
    return OCCUPIED_BAYS.map((bay) => ({ p: [bay.cx, SITE.roadY, bay.cz], r: [0, bay.rotation, 0], c: colors[Math.floor(random() * colors.length)] }));
  }, []);
  const transforms = useMemo(() => items.map(({ p, r }) => ({ p, r })), [items]);
  return (
    <group name="Site_Parking" userData={{ bays: PARKING_BAYS, parked: OCCUPIED_BAYS.map(({ id }) => id) }}>
      <mesh name="Parking_Bay_Markings" geometry={lines} material={MAT.white} />
      <mesh name="Parking_Head_WheelStops" geometry={stops} material={MAT.concreteDark} />
      <Instances name="Cars_Bodies" geometry={cars.body} material={MAT.white} items={items} castShadow />
      <Instances name="Cars_Glass" geometry={cars.glass} material={MAT.glass} items={transforms} />
      <Instances name="Cars_Wheels" geometry={cars.dark} material={MAT.darkMetal} items={transforms} castShadow />
      <Instances name="Cars_Headlamps_Unlit" geometry={cars.headlights} material={MAT.white} items={transforms} />
      <Instances name="Cars_TailLamps_Unlit" geometry={cars.rearLights} material={MAT.coral} items={transforms} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Compound wall                                                      */
/*  Front: slatted panels, lit piers and the open gate.                  */
/*  Back and sides: plain solid white walls, without boundary lights.  */
/* ------------------------------------------------------------------ */

const WALL = {
  panelTop: 1.78,
  plinthH: 0.36,
  slatTop: 1.58,
  panelDepth: 0.28,
  plinthDepth: 0.46,
  pierW: 0.9,
  pierH: 2.42,
  capH: 0.14,
  slotW: 0.155,
  slotH: 1.92,
  slotBottom: 0.25,
};

/*
 * Gate assembly, sized around the actual 10 m driveway (x ±5, curbs ±5..5.25):
 *  - opening  ±5.43  → equal 0.18 m clearance to each curb, one car plus room
 *  - gate posts at ±5.7 (0.5 m posts) carry the leaves; the lit monument
 *    piers at ±9 stay a decorative entrance element, visually separate
 *  - leaves slide in a plane 0.31 m in front of the fence face (z 34.62),
 *    which clears the monument pier faces (z 34.46) by 0.12 m and the curb
 *    tops (y 0.18) by 0.07 m at every position of the travel
 */
const GATE = {
  halfOpen: 5.43,
  postX: 5.7,
  leafZ: 34.62,
  travel: 5.43,
} as const;

/** One sliding leaf, centred on its own origin so the group can translate it. */
function buildGateLeaf(): G {
  const w = GATE.halfOpen;
  const bars: G[] = [];
  const pitch = (w - 0.07 - 0.035) / 10;
  for (let i = 0; i <= 10; i++) {
    bars.push(box(0.035, 1.91, 0.08, -w / 2 + 0.035 + i * pitch, 1.325, 0));
  }
  return merge([
    ...bars,
    box(w, 0.12, 0.08, 0, 0.31, 0),  // bottom rail (0.25 sill above the road)
    box(w, 0.12, 0.08, 0, 2.34, 0),  // top rail
    box(w, 0.07, 0.075, 0, 1.32, 0), // mid rail
  ]);
}

/** Box placed at a local (lx, lz) offset around (cx, cz) and turned by ry. */
function placeBox(
  w: number, h: number, d: number,
  lx: number, y: number, lz: number,
  ry: number, cx: number, cz: number,
): G {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return box(w, h, d, cx + lx * c + lz * s, y, cz - lx * s + lz * c, ry);
}

/**
 * Stone pier with a genuine recessed light channel cut into both broad faces.
 * Built from five solid boxes so the groove is real geometry — the two light
 * inserts sit inside it, 8 mm behind the face, so nothing is ever coplanar.
 */
function addPier(
  stone: G[], caps: G[], lights: G[],
  cx: number, cz: number, ry: number,
  w = WALL.pierW, h = WALL.pierH, capH = WALL.capH,
  slotW = WALL.slotW, slotH = WALL.slotH, slotBottom = WALL.slotBottom,
) {
  const hw = w / 2;
  const sw = slotW / 2;
  const coreHd = hw - 0.055;
  const topH = h - slotBottom - slotH;

  // flanks either side of the channel
  stone.push(placeBox(hw - sw, h, w, -(hw + sw) / 2, h / 2, 0, ry, cx, cz));
  stone.push(placeBox(hw - sw, h, w, (hw + sw) / 2, h / 2, 0, ry, cx, cz));
  // stone above and below the channel
  stone.push(placeBox(slotW, topH, w, 0, slotBottom + slotH + topH / 2, 0, ry, cx, cz));
  stone.push(placeBox(slotW, slotBottom, w, 0, slotBottom / 2, 0, ry, cx, cz));
  // core between the two grooves
  stone.push(placeBox(slotW, slotH, coreHd * 2, 0, slotBottom + slotH / 2, 0, ry, cx, cz));

  // capH 0 = the pier is crowned by the gate header instead, which would
  // otherwise land its underside exactly on the cap's underside.
  if (capH > 0) caps.push(placeBox(w + 0.13, capH, w + 0.13, 0, h + capH / 2, 0, ry, cx, cz));

  for (const s of [-1, 1]) {
    lights.push(placeBox(slotW - 0.024, slotH - 0.06, 0.042, 0, slotBottom + slotH / 2, s * (hw - 0.03), ry, cx, cz));
  }
}

/** Panel bay: light plinth + top rail with dark horizontal slats between. */
function addPanel(stone: G[], slats: G[], cx: number, cz: number, ry: number, len: number) {
  stone.push(placeBox(len, WALL.plinthH, WALL.plinthDepth, 0, WALL.plinthH / 2, 0, ry, cx, cz));
  const railH = WALL.panelTop - WALL.slatTop;
  stone.push(placeBox(len, railH, WALL.plinthDepth, 0, WALL.slatTop + railH / 2, 0, ry, cx, cz));

  const zone = WALL.slatTop - WALL.plinthH;
  const n = 9;
  const pitch = zone / n;
  for (let i = 0; i < n; i++) {
    slats.push(placeBox(len - 0.035, pitch * 0.62, WALL.panelDepth, 0, WALL.plinthH + pitch * (i + 0.5), 0, ry, cx, cz));
  }
}

function buildPerimeter() {
  const stone: G[] = [];
  const slats: G[] = [];
  const caps: G[] = [];
  const lights: G[] = [];
  const thickness = WALL.plinthDepth;
  const bottom = -0.06;
  const height = WALL.panelTop - bottom;
  const centerY = bottom + height / 2;
  const backInside = SITE.back + thickness / 2;
  const sideEnd = SITE.gateZ - WALL.pierW / 2;
  // Side walls butt against the rear wall and the existing front corner piers.
  // No intersecting corner faces, decorative caps, slats or emissive inserts.
  const solidWalls = merge([
    box(SITE.halfWidth * 2 + thickness, height, thickness, 0, centerY, SITE.back),
    ...[-1, 1].map((side) => box(
      thickness, height, sideEnd - backInside,
      side * SITE.halfWidth, centerY, (backInside + sideEnd) / 2,
    )),
  ]);
  const posts = new Map<string, { p: Point2; ry: number }>();
  // The fence runs in four clean runs — wall → lit pier → gate post — so the
  // opening is exactly the gate width and every panel butts to a real element.
  const litPierFace = SITE.gatePierX + 0.67;   // 9.67  lit pier outer face
  const litPierInner = SITE.gatePierX - 0.67;  // 8.33  lit pier inner face
  const postFace = GATE.postX + 0.25;          // 5.95  gate post outer face
  const runs: [Point2, Point2][] = [
    [[-SITE.halfWidth, SITE.gateZ], [-litPierFace, SITE.gateZ]],
    [[litPierFace, SITE.gateZ], [SITE.halfWidth, SITE.gateZ]],
    [[-litPierInner, SITE.gateZ], [-postFace, SITE.gateZ]],
    [[postFace, SITE.gateZ], [litPierInner, SITE.gateZ]],
  ];
  for (const [[ax, az], [bx, bz]] of runs) {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.ceil(length / 6);
    const dx = (bx - ax) / count;
    const dz = (bz - az) / count;
    const angle = -Math.atan2(dz, dx);
    for (let i = 0; i <= count; i++) {
      posts.set(`${(ax + dx * i).toFixed(2)},${(az + dz * i).toFixed(2)}`, {
        p: [ax + dx * i, az + dz * i],
        ry: angle,
      });
    }
    for (let i = 0; i < count; i++) {
      // 3 cm reveal to whatever the panel butts against (pier, post, corner).
      const runLength = length / count;
      addPanel(stone, slats, ax + dx * (i + 0.5), az, angle, runLength - 0.06);
    }
  }
  for (const { p: [x, z], ry } of posts.values()) {
    // Run ends that terminate on a dedicated element (gate post at ±5.95, lit
    // pier faces at ±8.33 and ±9.67, side walls at the ±48 corners which keep
    // their corner piers) must not get a second, colliding pier.
    if (
      Math.abs(Math.abs(x) - postFace) < 0.01 ||
      Math.abs(Math.abs(x) - litPierInner) < 0.01 ||
      Math.abs(Math.abs(x) - litPierFace) < 0.01
    ) continue;
    addPier(stone, caps, lights, x, z, ry);
  }

  // Lit monument piers keep their position and identity as the entrance
  // markers; the gate is supported by its own smaller posts instead.
  addPier(stone, caps, lights, -9, 34, 0, 1.34, 4.2, 0.17, 0.26, 3.3, 0.46);
  addPier(stone, caps, lights, 9, 34, 0, 1.34, 4.2, 0.17, 0.26, 3.3, 0.46);

  // Dedicated gate posts (same dark metal as the leaves) with a proud cap.
  // They stand on the walkway ramp and clear the driveway curbs by 0.2 m.
  for (const s of [-1, 1]) {
    slats.push(box(0.5, 2.57, 0.5, s * GATE.postX, 1.315, 34));
    slats.push(box(0.62, 0.12, 0.62, s * GATE.postX, 2.66, 34));
  }

  return {
    solidWalls,
    stone: merge(stone),
    slats: merge(slats),
    caps: merge(caps),
    lights: merge(lights),
  };
}

export function PerimeterWall() {
  const geometry = useMemo(buildPerimeter, []);
  const leafGeo = useMemo(buildGateLeaf, []);
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);

  // Closed: leaves meet at x 0. Open: each parks 0.31 m in front of the fence
  // and 0.12 m clear of the lit pier faces — the travel crosses no geometry.
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 1.25);
    const target = gateState.open ? GATE.travel : 0;
    const left = leftRef.current;
    const right = rightRef.current;
    if (left) left.position.x += (-GATE.halfOpen / 2 - target - left.position.x) * k;
    if (right) right.position.x += (GATE.halfOpen / 2 + target - right.position.x) * k;
  });

  return (
    <group name="Site_Perimeter" userData={{ gateState: 'sliding', clearVehicleWidth: 10.86, footwayWidth: 2.3 }}>
      <mesh name="Wall_Solid_White_Back_And_Sides" geometry={geometry.solidWalls} material={MAT.white} castShadow receiveShadow />
      <mesh name="Wall_Stone" geometry={geometry.stone} material={MAT.concrete} castShadow receiveShadow />
      <mesh name="Wall_Slats" geometry={geometry.slats} material={MAT.darkMetal} castShadow receiveShadow />
      <mesh name="Wall_Pier_Caps" geometry={geometry.caps} material={MAT.concreteDark} castShadow receiveShadow />
      <mesh name="Wall_Pier_Channels" geometry={geometry.lights} material={MAT.ledWhite} />
      <group ref={leftRef} name="Gate_Leaf_Left" position={[-GATE.halfOpen / 2 - GATE.travel, 0, GATE.leafZ]}>
        <mesh name="Gate_Leaf_Left_Bars" geometry={leafGeo} material={MAT.darkMetal} castShadow />
      </group>
      <group ref={rightRef} name="Gate_Leaf_Right" position={[GATE.halfOpen / 2 + GATE.travel, 0, GATE.leafZ]}>
        <mesh name="Gate_Leaf_Right_Bars" geometry={leafGeo} material={MAT.darkMetal} castShadow />
      </group>
    </group>
  );
}

export function StreetLights({ night }: { night: boolean }) {
  return (
    <group name="Site_StreetLights">
      {/* Keep parking illumination, but no light fixtures along the solid walls. */}
      <pointLight name="PL_Parking_West" position={[-37, 6.5, 4]} color="#ffdfb1" intensity={night ? 95 : 0} distance={47} decay={2} />
      <pointLight name="PL_Parking_East" position={[37, 6.5, 4]} color="#ffdfb1" intensity={night ? 95 : 0} distance={47} decay={2} />
    </group>
  );
}
