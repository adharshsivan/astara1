import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MAT, registerDayMaterial } from './materials';
import { visualDay } from './visualProfiles';
import { box, merge, pad, type G } from './geo';
import { RX, Z1 } from './dims';

/**
 * Roof-side infinity pool (roof-local space, y = 0 is the deck walking surface).
 *
 * The pool is a real basin cut INTO the roof structure: MainBuilding builds the
 * crown fascia and roof slab around the rectangle exported here, and the basin
 * floor sits flush with the underside of the fascia. The water therefore has a
 * genuine ~1 m of depth instead of floating a few centimetres over solid slab.
 *
 *  - runs edge to edge between the side upstands (walls touch, no gaps)
 *  - 4.2 m wide entry steps open through the terrace-side wall
 *  - front edge is a clear glass weir; water appears to spill off the roof
 *  - no rails, trough or props inside the swimming volume
 */
const EDGE = 0.15;
export const POOL = {
  x0: -RX + EDGE,
  x1: RX - EDGE,
  z0: 15.55,
  z1: Z1 - 0.32,
  /** top of the structural floor slab (bottom of the slab = fascia underside) */
  floorY: -1.05,
  waterY: -0.06,
  /** coping sits on the walls: bottom 0.015, top 0.125 */
  copingY0: 0.015,
  copingY1: 0.125,
} as const;

const { x0: X0, x1: X1, z0: Z0P, z1: Z1P, floorY: FY, waterY: WY } = POOL;
const W = X1 - X0;
const D = Z1P - Z0P;
const CZ = (Z0P + Z1P) / 2;
const WALL = 0.22;
const TILE = 0.03;
const COPE = 0.36;

/** Entry steps: three treads walking in from the deck through the back wall. */
const STEP_W = 4.2;
const STEP_X0 = X0 + WALL + TILE;
const STEP_X1 = STEP_X0 + STEP_W;
const TREAD_TOPS = [-0.2, -0.48, -0.76];
const TREAD_Z = [Z0P, Z0P + 0.85, Z0P + 1.45, Z0P + 2.05];

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

function makeWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // Clean gradient only — no painted wave strokes. Surface variation comes
  // from the live normal ripple in the material, not baked lines.
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0a6d90');
  gradient.addColorStop(0.5, '#1cb3c6');
  gradient.addColorStop(1, '#075f84');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'InfinityPool_Water';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.6, 0.7);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Concrete shell: floor slab, walls and coping. No overlapping volumes. */
function buildBasin(): G {
  const wallTop = POOL.copingY0;
  const openEnd = STEP_X1; // back wall / coping stop where the entry steps begin
  return merge([
    // floor slab (bottom flush with the fascia underside)
    bx(X0, X1, FY - 0.12, FY, Z0P, Z1P),
    // side walls
    bx(X0, X0 + WALL, FY, wallTop, Z0P, Z1P),
    bx(X1 - WALL, X1, FY, wallTop, Z0P, Z1P),
    // terrace-side wall, open over the entry steps
    bx(openEnd, X1 - WALL, FY, wallTop, Z0P, Z0P + WALL),
    // coping on top of the walls
    bx(X0, X0 + COPE, POOL.copingY0, POOL.copingY1, Z0P, Z1P),
    bx(X1 - COPE, X1, POOL.copingY0, POOL.copingY1, Z0P, Z1P),
    bx(openEnd, X1 - COPE, POOL.copingY0, POOL.copingY1, Z0P, Z0P + COPE),
  ]);
}

function buildTile(): G {
  const top = WY + 0.04;
  return merge([
    bx(X0 + WALL + TILE, X1 - WALL - TILE, FY, FY + TILE, Z0P + WALL + TILE, Z1P - 0.04),
    // wall linings (inner faces only)
    bx(X0 + WALL, X0 + WALL + TILE, FY, top, Z0P, Z1P - 0.04),
    bx(X1 - WALL - TILE, X1 - WALL, FY, top, Z0P, Z1P - 0.04),
    bx(STEP_X1, X1 - WALL - TILE, FY, top, Z0P + WALL, Z0P + WALL + TILE),
  ]);
}

function buildSteps(): G {
  const parts: G[] = [];
  for (let i = 0; i < 3; i++) {
    parts.push(bx(STEP_X0, STEP_X1, FY, TREAD_TOPS[i], TREAD_Z[i], TREAD_Z[i + 1]));
  }
  return merge(parts);
}

/** Clear weir wall: top is level with the water so it reads as spilling over. */
function buildGlass(): G {
  return bx(X0 + WALL, X1 - WALL, FY, WY + 0.02, Z1P - 0.04, Z1P);
}

/* ------------------------------------------------------------------ */
/*  Water volume                                                       */
/* ------------------------------------------------------------------ */

/** Inner faces of the tile lining, inset 1 cm so the tint never z-fights. */
const VOL = {
  x0: X0 + WALL + TILE + 0.01,
  x1: X1 - WALL - TILE - 0.01,
  z0: Z0P + WALL + TILE + 0.01,
  z1: Z1P - 0.05, // 1 cm inside the glass weir's inner face
  y0: FY + TILE + 0.01,
  y1: WY - 0.002, // a hair under the surface plane
};

/**
 * The water body below the surface: a floor and four walls (no lid), each
 * vertex-shaded darker with depth. Seen through the surface it tints the tile
 * and steps so the pool reads as ~1 m of water; seen through the glass weir it
 * reads as a solid column of water. One draw call, 10 triangles.
 */
function buildWaterVolume(): G {
  const pos: number[] = [];
  const col: number[] = [];
  const shade = (y: number) => 0.52 + 0.48 * ((y - VOL.y0) / (VOL.y1 - VOL.y0));
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]);
      const s = shade(v[1]);
      col.push(s, s, s);
    }
  };
  const { x0, x1, z0, z1, y0, y1 } = VOL;
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // floor
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // west wall
  quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]); // east wall
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // weir side
  // Terrace wall only east of the entry steps: the steps stay open to the deck.
  quad([STEP_X1, y0, z0], [STEP_X1, y1, z0], [x1, y1, z0], [x1, y0, z0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/*  Swim rings                                                         */
/* ------------------------------------------------------------------ */

const RING_R = 0.34; // centre-line radius: 0.88 m overall, adult float scale
const RING_TUBE = 0.095;

/** Sky blue, yellow, sky blue — placed clear of the steps and the weir. */
const RINGS = [
  { x: 2.6, z: 19.1, color: '#7cc6ec', yaw: 0.4, phase: 0 },
  { x: 7.4, z: 21.3, color: '#f1c94e', yaw: 1.9, phase: 2.1 },
  { x: -4.6, z: 20.8, color: '#7cc6ec', yaw: 3.3, phase: 4.2 },
];

function buildRingBody(): G {
  const g = new THREE.TorusGeometry(RING_R, RING_TUBE, 10, 28);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Four slim white bands sitting proud of the body tube (no shared faces). */
function buildRingBands(): G {
  const parts: G[] = [];
  for (let i = 0; i < 4; i++) {
    const arc = 0.3;
    const g = new THREE.TorusGeometry(RING_R, RING_TUBE * 1.045, 10, 4, arc);
    g.rotateZ(i * (Math.PI / 2) - arc / 2);
    g.rotateX(Math.PI / 2);
    parts.push(g);
  }
  return merge(parts);
}

/**
 * LED strips form one connected underwater loop at a single depth. Each strip
 * overlaps its neighbours at the corners (same material, so the shared volume
 * reads as one continuous light with no dark gaps). The west run starts past
 * the entry steps and the back run starts at the steps' east edge, so the loop
 * is only broken where the stairs physically occupy the wall.
 */
function buildGlow(): G {
  const y0 = -0.915;
  const y1 = -0.885;
  const T = 0.03; // protrusion into the water from each tile face
  const eastX = X1 - WALL - TILE; // inner face of the east tile lining
  const westX = X0 + WALL + TILE; // inner face of the west tile lining
  const backZ = Z0P + WALL + TILE; // inner face of the back tile lining
  const frontZ = Z1P - 0.04; // inner face of the glass weir
  return merge([
    // east side: back corner to front corner
    bx(eastX - T, eastX, y0, y1, backZ, frontZ),
    // west side: entry steps to front corner
    bx(westX, westX + T, y0, y1, Z0P + 2.2, frontZ),
    // back: steps opening to east corner, overlapping the east strip
    bx(STEP_X1, eastX, y0, y1, backZ, backZ + T),
    // weir: full width, overlapping both side strips at the corners
    bx(westX, eastX, y0, y1, frontZ - T, frontZ),
  ]);
}

export function InfinityPool({ night }: { night: boolean }) {
  const basin = useMemo(buildBasin, []);
  const tile = useMemo(buildTile, []);
  const steps = useMemo(buildSteps, []);
  const glass = useMemo(buildGlass, []);
  const glow = useMemo(buildGlow, []);
  const waterGeo = useMemo(
    () => pad(W - 2 * WALL, D - 0.04, 0, WY, (Z0P + Z1P - 0.04) / 2),
    [],
  );
  const texture = useMemo(makeWaterTexture, []);
  const rippleTime = useMemo(() => ({ value: 0 }), []);
  const water = useMemo(
    () => {
      const material = new THREE.MeshStandardMaterial({
        name: 'InfinityPool_Water',
        map: texture,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        roughness: 0.12,
        metalness: 0.26,
        emissive: '#06708c',
        emissiveIntensity: 0.34,
        envMapIntensity: 1.5,
      });
      // Day-only normal perturbation reuses the existing UVs and colour texture.
      // The night normal path is unchanged; no normal map or displaced vertices.
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uDayWater = visualDay;
        shader.uniforms.uWaterTime = rippleTime;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uDayWater;
uniform float uWaterTime;`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uDayWater > 0.0001) {
  vec2 rippleUV = vMapUv * 6.283185;
  float rippleX = 0.019 * sin(rippleUV.y * 4.0 + uWaterTime * 0.24);
  float rippleZ = 0.014 * cos(rippleUV.x * 3.0 - uWaterTime * 0.18);
  vec3 rippleNormal = normalize(mat3(viewMatrix) * vec3(rippleX, 1.0, rippleZ));
  normal = normalize(mix(normal, rippleNormal, uDayWater));
}`);
      };
      material.customProgramCacheKey = () => 'pool-day-ripples-v1';
      return material;
    },
    [texture, rippleTime],
  );

  // Same colour as before; opacity lowered a touch so the water volume and
  // floor read through the surface — the pool now looks ~1 m deep.
  useLayoutEffect(() => registerDayMaterial(water, {
    color: '#79bdd0', roughness: 0.19, metalness: 0.16,
    opacity: 0.72, emissiveIntensity: 0.01, envMapIntensity: 1.1,
  }, {
    color: '#ffffff', roughness: 0.12, metalness: 0.26,
    opacity: 0.8, emissiveIntensity: 0.34, envMapIntensity: 1.5,
  }), [water]);
  useEffect(() => () => { water.dispose(); texture.dispose(); }, [water, texture]);

  const volumeGeo = useMemo(buildWaterVolume, []);
  const volumeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        name: 'InfinityPool_Water_Volume',
        color: '#3fc3d8',
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.05,
      }),
    [],
  );
  useEffect(() => () => { volumeGeo.dispose(); volumeMat.dispose(); }, [volumeGeo, volumeMat]);

  /* ---- swim rings: 2 instanced draws (body + white bands) ---- */
  const ringBody = useMemo(buildRingBody, []);
  const ringBands = useMemo(buildRingBands, []);
  const ringMat = useMemo(
    () => new THREE.MeshStandardMaterial({ name: 'Pool_SwimRing_Vinyl', color: '#ffffff', roughness: 0.42, metalness: 0 }),
    [],
  );
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const clock = useRef(0);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const bands = bandRef.current;
    if (!body || !bands) return;
    const c = new THREE.Color();
    RINGS.forEach((r, i) => {
      body.setColorAt(i, c.set(r.color));
      // Rest pose so the rings are placed even before the first frame ticks.
      dummy.position.set(r.x, WY + 0.02, r.z);
      dummy.rotation.set(0, r.yaw, 0);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      bands.setMatrixAt(i, dummy.matrix);
    });
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    bands.instanceMatrix.needsUpdate = true;
    body.computeBoundingSphere();
    bands.computeBoundingSphere();
  }, [dummy]);
  useEffect(() => () => { ringBody.dispose(); ringBands.dispose(); ringMat.dispose(); }, [ringBody, ringBands, ringMat]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    rippleTime.value += dt;
    texture.offset.x = (texture.offset.x + delta * 0.006) % 1;
    texture.offset.y = (texture.offset.y - delta * 0.011 + 1) % 1;

    // Gentle float: ~2.5 cm bob, ~0.6 m lazy drift, a few degrees of tilt and
    // a very slow continuous turn. Calm, but clearly alive.
    clock.current += dt;
    const t = clock.current;
    const body = bodyRef.current;
    const bands = bandRef.current;
    if (!body || !bands) return;
    RINGS.forEach((r, i) => {
      const p = r.phase;
      dummy.position.set(
        r.x + 0.32 * Math.sin(t * 0.11 + p),
        WY + 0.02 + 0.024 * Math.sin(t * 1.05 + p),
        r.z + 0.26 * Math.cos(t * 0.09 + p * 1.7),
      );
      dummy.rotation.set(
        0.05 * Math.sin(t * 0.85 + p * 1.3),
        r.yaw + t * 0.05 + 0.3 * Math.sin(t * 0.07 + p),
        0.045 * Math.cos(t * 0.75 + p * 0.9),
      );
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      bands.setMatrixAt(i, dummy.matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    bands.instanceMatrix.needsUpdate = true;
  });

  return (
    <group
      name="InfinityPool"
      userData={{
        // Swimmable volume for the game layer (roof-local metres). Entry is the
        // 4.2 m stair at the terrace-side west end; the water is ~0.95 m deep.
        swimVolume: { x0: VOL.x0, x1: VOL.x1, z0: VOL.z0, z1: VOL.z1, floorY: VOL.y0, waterY: WY },
        entry: { x0: STEP_X0, x1: STEP_X1, z0: Z0P, z1: TREAD_Z[3], treadTops: TREAD_TOPS },
      }}
    >
      <mesh name="Pool_Water_Volume" geometry={volumeGeo} material={volumeMat} renderOrder={6} />
      <instancedMesh ref={bodyRef} name="Pool_SwimRings" args={[ringBody, ringMat, RINGS.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={bandRef} name="Pool_SwimRing_Bands" args={[ringBands, MAT.white, RINGS.length]} frustumCulled={false} />
      <mesh name="Pool_Basin_And_Coping" geometry={basin} material={MAT.concrete} castShadow receiveShadow />
      <mesh name="Pool_Tile_Lining" geometry={tile} material={MAT.poolTile} receiveShadow />
      <mesh name="Pool_Entry_Steps" geometry={steps} material={MAT.white} receiveShadow />
      <mesh name="Pool_Vanishing_Edge_Glass" geometry={glass} material={MAT.poolGlass} renderOrder={8} />
      <mesh name="Pool_Water_Surface" geometry={waterGeo} material={water} renderOrder={7} />
      <mesh name="Pool_Underwater_Lighting" geometry={glow} material={MAT.neonCyan} />
      <pointLight name="PL_Pool_Cyan" position={[0, 0.9, CZ]} color="#49d9ec" intensity={night ? 16 : 2} distance={17} decay={2} />
    </group>
  );
}
