import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MAT } from './materials';
import { box, cyl, merge, type G } from './geo';
import { FACE_Z } from './dims';
import { ENTRY, SITE } from './layout';
import { getPavingMaterial, mergeSite, ramp, siteSurface } from './siteGeometry';

/**
 * Main entrance (world space).
 *
 * Portal piers + lintel frame the grand opening.
 * Full continuous window framing across the entire 15.3m glazed front.
 * The entrance features refined architectural honed stone paving (NO wood),
 * with a shallow step-free transition to the forecourt, open and free of clutter.
 */
const E = {
  face: FACE_Z, // 15
  // The glass and mullions terminate directly under the exterior fascia.
  glassTop: 4.15,
  // 1 cm above the finished hall/landing floor at y=0.22, so moving leaves
  // clear the floor as they swing without appearing to float.
  glassBottom: 0.23,
  doorHalfWidth: 2.05,
  // Black mullions intersect the fixed/operable glass in the same facade plane.
  doorZ: 15.04,
  portalZ: 15.35,
};
const HEAD_BOTTOM = E.glassTop;

/** Canopy: between the pier inner faces (±7.7), from the sill band face (z 15.4) outward. */
const CANOPY = { x: 7.7, y0: 4.65, y1: 4.95, z0: 15.4, z1: 22.1 };

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

function buildConcrete(): G {
  // Front face sits at z=16.25 (preserving the exact ASTARA/SEAWAYS signage
  // alignment), with the rear face stopping just outside the glass plane (z=15.05).
  // The lintel's width matches the outer pier faces (-9.5 to +9.5 = 19.0 m wide),
  // completely eliminating the tiny 30 cm overhang on the left and right.
  const portalDepth = 1.2;
  const portalCenterZ = E.portalZ + 0.3;
  return merge([
    // Left & right portal piers
    box(1.8, 6.6, portalDepth, -8.6, 3.3, portalCenterZ),
    box(1.8, 6.6, portalDepth, 8.6, 3.3, portalCenterZ),
    // Lintel spanning cleanly from pier outer edge to pier outer edge
    box(19.0, 1.4, portalDepth, 0, 7.1, portalCenterZ),
  ]);
}

function buildStonePaving(): G {
  const e = ENTRY;
  // One continuous landing; the 4 cm transition to the forecourt is sloped, not stepped.
  return mergeSite([
    siteSurface([
      [-11, 12.8], [11, 12.8], [11, e.back], [e.halfWidth, e.back],
      [e.halfWidth, e.landingFront], [-e.halfWidth, e.landingFront],
      [-e.halfWidth, e.back], [-11, e.back],
    ], -0.06, e.surfaceY),
    ramp({ x0: -e.halfWidth, x1: e.halfWidth, z0: e.landingFront, z1: e.rampFront }, e.surfaceY, SITE.pavingY),
  ]);
}

function buildDark(): G {
  const p: G[] = [];
  p.push(bx(-CANOPY.x, CANOPY.x, CANOPY.y0, CANOPY.y1, CANOPY.z0, CANOPY.z1));
  // Head frame flush with the glass top, spanning the entrance facade.
  p.push(box(22, 0.08, 0.16, 0, E.glassTop - 0.04, E.doorZ));
  // Vertical mullions run cleanly from floor up to the underside of the head frame.
  const mullionH = (E.glassTop - 0.08) - E.glassBottom;
  for (const x of [-11, -9.5, -7.7, -5.9, -4.2, -E.doorHalfWidth,
    E.doorHalfWidth, 4.2, 5.9, 7.7, 9.5, 11]) {
    p.push(box(0.08, mullionH, 0.14, x, E.glassBottom + mullionH / 2, E.doorZ));
  }
  return merge(p);
}

function buildBronze(): G {
  const p: G[] = [];
  // Only the front pair supports the canopy extension. The two rear columns
  // nearest the building are intentionally omitted to keep the entrance clear.
  for (const [x, z] of [
    [-6.8, 21.3],
    [6.8, 21.3],
  ]) {
    p.push(cyl(0.11, 0.11, CANOPY.y1 - 0.2 - 0.22, x, (CANOPY.y1 - 0.2 + 0.22) / 2, z, 10));
  }
  return merge(p);
}

/** Fixed glass is split around the entrance: nothing blocks an open door. */
function buildLobbyGlass(): G {
  const panes: Array<[number, number]> = [
    [-11, -9.5], [-7.7, -E.doorHalfWidth],
    [E.doorHalfWidth, 7.7], [9.5, 11],
  ];
  return merge(panes.map(([left, right]) =>
    bx(left, right, E.glassBottom, HEAD_BOTTOM, 15.0, 15.025)));
}

/** Both leaves meet at x=0 when closed; each swings inward about its jamb. */
function doorLeaf(side: -1 | 1): { glass: G; stile: G; handle: G } {
  const half = E.doorHalfWidth;
  const centerX = side * half / 2;
  const height = HEAD_BOTTOM - E.glassBottom;
  return {
    glass: box(half, height, 0.025, centerX, E.glassBottom + height / 2, 0),
    // The two narrow black meeting stiles touch at x=0, covering the former
    // centre gap without adding a stationary pillar in the doorway.
    stile: box(0.04, height, 0.045, side * (half - 0.02),
      E.glassBottom + height / 2, 0.015),
    handle: box(0.045, 1.1, 0.065, side * (half - 0.18), 1.65, 0.075),
  };
}

function EntranceDoors({ open }: { open: boolean }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const leaves = useMemo(() => ({ left: doorLeaf(1), right: doorLeaf(-1) }), []);
  useFrame((_, dt) => {
    const target = open ? Math.PI * 0.42 : 0;
    if (left.current) left.current.rotation.y = THREE.MathUtils.damp(left.current.rotation.y, target, 5, dt);
    if (right.current) right.current.rotation.y = THREE.MathUtils.damp(right.current.rotation.y, -target, 5, dt);
  });
  return (
    <group name="Entrance_Operable_Double_Doors">
      <group name="Door_Left_Hinge" ref={left} position={[-E.doorHalfWidth, 0, E.doorZ]}>
        <mesh name="Door_Left_Glass" geometry={leaves.left.glass} material={MAT.lobbyGlass} renderOrder={12} />
        <mesh name="Door_Left_Black_Stile" geometry={leaves.left.stile} material={MAT.darkMetal} />
        <mesh name="Door_Left_Pull" geometry={leaves.left.handle} material={MAT.bronze} />
      </group>
      <group name="Door_Right_Hinge" ref={right} position={[E.doorHalfWidth, 0, E.doorZ]}>
        <mesh name="Door_Right_Glass" geometry={leaves.right.glass} material={MAT.lobbyGlass} renderOrder={12} />
        <mesh name="Door_Right_Black_Stile" geometry={leaves.right.stile} material={MAT.darkMetal} />
        <mesh name="Door_Right_Pull" geometry={leaves.right.handle} material={MAT.bronze} />
      </group>
    </group>
  );
}

/** Architectural down-lights flush under the canopy slab (underside y = 4.65). */
function buildDownLights(): G {
  const y0 = CANOPY.y0 - 0.03;
  const y1 = CANOPY.y0;
  return merge([
    bx(-6.4, 6.4, y0, y1, 17.03, 17.27),
    bx(-6.4, 6.4, y0, y1, 20.23, 20.47),
    bx(-6.4, -6.0, y0, y1, 17.27, 20.23),
    bx(6.0, 6.4, y0, y1, 17.27, 20.23),
  ]);
}

export function Entrance({ doorOpen }: { doorOpen: boolean }) {
  const concrete = useMemo(buildConcrete, []);
  const paving = useMemo(buildStonePaving, []);
  const stone = useMemo(getPavingMaterial, []);
  const dark = useMemo(buildDark, []);
  const bronze = useMemo(buildBronze, []);
  const lobbyGlass = useMemo(buildLobbyGlass, []);
  const downLights = useMemo(buildDownLights, []);

  return (
    <group name="Entrance">
      <mesh name="Entrance_Portal_Concrete" geometry={concrete} material={MAT.concrete} castShadow receiveShadow />
      <mesh name="Entrance_StepFree_Stone_Landing" geometry={paving} material={stone} receiveShadow userData={{ surface: 'walkable' }} />
      <mesh name="Entrance_Canopy_Dark" geometry={dark} material={MAT.darkMetal} castShadow receiveShadow />
      <mesh name="Entrance_Frames_Bronze" geometry={bronze} material={MAT.bronze} castShadow />
      <mesh name="Entrance_Lobby_Fixed_Glass" geometry={lobbyGlass} material={MAT.lobbyGlass} renderOrder={11} />
      <EntranceDoors open={doorOpen} />
      <mesh name="Entrance_Canopy_Lights" geometry={downLights} material={MAT.neonAmber} />
      {/* Placeholder lighting so the plain white hall reads through the glass
          instead of sitting in darkness. Plain white, not the warm amber used
          elsewhere. Three lights because the hall is now the whole podium
          footprint (~33 × 29 m): one per third of the depth, so no corner
          falls to black and the space reads as one continuous bright volume. */}
      <pointLight name="PL_Hall_Front" position={[0, 5, 10]} color="#ffffff" intensity={26} distance={26} decay={2} />
      <pointLight name="PL_Hall_Mid" position={[0, 5, -2]} color="#ffffff" intensity={26} distance={26} decay={2} />
      <pointLight name="PL_Hall_Back" position={[0, 5, -11]} color="#ffffff" intensity={26} distance={26} decay={2} />
    </group>
  );
}
