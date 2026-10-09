import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { catenary, type V3 } from './geo';
import { Instances, type InstanceItem } from './Instances';
import { PERGOLA } from './RooftopCafe';
import { FIRE_PIT } from './SeatingArea';

interface Props {
  night: boolean;
}

/* ---------------- Festoon lights (rooftop local) ---------------- */

/**
 * One loop along the OUTER face of the pergola beams, hung from the beams (no free-floating
 * wire). Offset 0.1 m clears the 0.16 m posts at the corners.
 */
function loop(g: { x0: number; x1: number; z0: number; z1: number; h: number }): [V3, V3][] {
  const o = 0.1;
  const y = g.h - 0.05;
  const c0: V3 = [g.x0 - o, y, g.z0 - o];
  const c1: V3 = [g.x1 + o, y, g.z0 - o];
  const c2: V3 = [g.x1 + o, y, g.z1 + o];
  const c3: V3 = [g.x0 - o, y, g.z1 + o];
  return [
    [c0, c1],
    [c1, c2],
    [c2, c3],
    [c3, c0],
  ];
}

function buildStringLights() {
  const bulbs: InstanceItem[] = [];
  const wirePts: number[] = [];
  for (const [a, b] of loop(PERGOLA)) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const pts = catenary(a, b, 0.7, Math.min(0.1, len * 0.01));
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) wirePts.push(...pts[i - 1], ...pts[i]);
      if (i > 0 && i < pts.length - 1) bulbs.push({ p: [pts[i][0], pts[i][1] - 0.06, pts[i][2]] });
    }
  }
  const wire = new THREE.BufferGeometry();
  wire.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  return { bulbs, wire };
}

export function RooftopLights({ night }: Props) {
  const { bulbs, wire } = useMemo(buildStringLights, []);
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.055, 6, 4), []);
  const k = night ? 1 : 0.15;

  return (
    <group name="Lights_Rooftop">
      <Instances name="StringLight_Bulbs" geometry={bulbGeo} material={MAT.bulbWarm} items={bulbs} />
      <lineSegments name="StringLight_Wires" geometry={wire} material={MAT.wire} />
      <pointLight name="PL_Bar_Warm" position={[7.6, 2.6, 2.8]} color="#ffb070" intensity={30 * k} distance={13} decay={2} />
      <pointLight name="PL_Dining_Warm" position={[0.4, 2.8, 2.4]} color="#ffd6a0" intensity={22 * k} distance={12} decay={2} />
      <pointLight name="PL_Pavilion" position={[2.5, 2.6, -6.3]} color="#ffcf9c" intensity={16 * k} distance={11} decay={2} />
      <pointLight name="PL_Sign_Pink" position={[2.5, 5.2, -1.2]} color="#ff4fa8" intensity={34 * k} distance={14} decay={2} />
      <pointLight name="PL_FirePit" position={[FIRE_PIT[0], 1.1, FIRE_PIT[1]]} color="#ff8a3a" intensity={13 * k} distance={7} decay={2} />
    </group>
  );
}

/* ---------------- Site lights (world space) ---------------- */
/* Canopy down-lights live in Entrance.tsx, attached flush to the canopy underside. */

export function SiteLights({ night }: Props) {
  const k = night ? 1 : 0.1;
  return (
    <group name="Lights_Site">
      <pointLight name="PL_Entrance" position={[0, 3.6, 17.5]} color="#ffc98a" intensity={34 * k} distance={20} decay={2} />
    </group>
  );
}
