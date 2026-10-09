import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAT, registerDayMaterial } from './materials';
import { box, merge, type G } from './geo';
import { FACE_Z } from './dims';
import { PAVILION, PAVILION_ROOF_TOP } from './RooftopCafe';
import {
  buildAstaraArtwork,
  buildMeghamArtwork,
  buildSeawaysArtwork,
  disposeNeonArtwork,
  type NeonArtwork,
} from './NeonArtwork';

export type SignColor = 'pink' | 'blue' | 'warm';

const SIGN_EMISSIVE: Record<SignColor, { shell: string; core: string }> = {
  pink: { shell: '#ff168b', core: '#ffacd9' },
  blue: { shell: '#16a5e4', core: '#a2ecff' },
  warm: { shell: '#ffe0ad', core: '#fff7e8' },
};

function makeNeonMaterials(color: SignColor) {
  const shell = new THREE.MeshStandardMaterial({
    name: `Sign_${color}_Neon_Glass`, color: '#282c34', roughness: 0.35, metalness: 0.1, toneMapped: false,
  });
  const core = new THREE.MeshStandardMaterial({
    name: `Sign_${color}_Hot_Filament`, color: '#67707c', roughness: 0.4, metalness: 0.08, toneMapped: false,
  });
  return { shell, core };
}

export function NeonTubes({ art, color }: { art: NeonArtwork; night: boolean; color: SignColor }) {
  const materials = useMemo(() => makeNeonMaterials(color), [color]);
  useLayoutEffect(() => {
    const releaseShell = registerDayMaterial(materials.shell, {
      color: color === 'blue' ? '#495f6c' : '#343940', emissiveIntensity: 0, roughness: 0.58,
    }, {
      color: color === 'warm' ? '#241a10' : '#180811',
      emissive: SIGN_EMISSIVE[color].shell, emissiveIntensity: 2.6, roughness: 0.35,
    });
    const releaseCore = registerDayMaterial(materials.core, {
      color: color === 'blue' ? '#8395a0' : '#454b54', emissiveIntensity: 0, roughness: 0.58,
    }, {
      color: color === 'warm' ? '#fff8ee' : '#fff3f9',
      emissive: SIGN_EMISSIVE[color].core, emissiveIntensity: 4, roughness: 0.4,
    });
    return () => { releaseShell(); releaseCore(); };
  }, [materials, color]);
  useEffect(() => () => {
    materials.shell.dispose();
    materials.core.dispose();
  }, [materials]);
  return (
    <>
      <mesh name={`${art.shell.name}_Tubes`} geometry={art.shell} material={materials.shell} />
      <mesh name={`${art.core.name}_Core`} geometry={art.core} material={materials.core} />
    </>
  );
}

const SIGN_X = (PAVILION.x0 + PAVILION.x1) / 2;
const SIGN_Z = PAVILION.z1 - 0.1;
const RAIL_Y = PAVILION_ROOF_TOP + 0.45;
const ROOF_SIGN_WIDTH = PAVILION.x1 - PAVILION.x0 - 0.35;
const ROOF_SIGN_BOTTOM = RAIL_Y + 0.035;
const ROOF_SIGN_Z = SIGN_Z + 0.1;

function buildRoofMount(art: NeonArtwork): G {
  const parts: G[] = [];
  const railWidth = art.width + 0.3;
  const strutX = railWidth / 2 - 0.5;
  for (const side of [-1, 1]) {
    const x = SIGN_X + side * strutX;
    // Feet sit on the unchanged slab; posts join the rail underside.
    parts.push(box(0.22, 0.05, 0.22, x, PAVILION_ROOF_TOP + 0.025, SIGN_Z));
    const y0 = PAVILION_ROOF_TOP + 0.05;
    const y1 = RAIL_Y - 0.03;
    parts.push(box(0.08, y1 - y0, 0.08, x, (y0 + y1) / 2, SIGN_Z));
  }
  parts.push(box(railWidth, 0.06, 0.08, SIGN_X, RAIL_Y, SIGN_Z));

  // Rear carriers and short standoffs support the letters without crossing their fronts.
  const [, letterBase] = art.point(116, 61);
  const crossbarY = ROOF_SIGN_BOTTOM + letterBase;
  const [left] = art.point(116, 61);
  const [right] = art.point(313, 61);
  parts.push(box(right - left + 0.06, 0.03, 0.035, SIGN_X + (left + right) / 2, crossbarY, SIGN_Z));
  const attachments: [number, number][] = [
    [86, 88], [126, 60], [164, 60], [180, 72], [194, 60], [234, 60], [273, 60], [334, 78],
  ];
  for (const [designX, designY] of attachments) {
    const [x, y] = art.point(designX, designY);
    const bottom = RAIL_Y + 0.03;
    const top = ROOF_SIGN_BOTTOM + y;
    if (top > bottom) parts.push(box(0.032, top - bottom, 0.035, SIGN_X + x, (bottom + top) / 2, SIGN_Z));
    const z0 = SIGN_Z + 0.015;
    const z1 = ROOF_SIGN_Z + art.bounds.min.z + 0.006;
    parts.push(box(0.032, 0.032, z1 - z0, SIGN_X + x, top, (z0 + z1) / 2));
  }
  const slabX0 = PAVILION.x0 - 0.55;
  const slabX1 = PAVILION.x1 + 0.55;
  if (SIGN_X - strutX - 0.11 < slabX0 || SIGN_X + strutX + 0.11 > slabX1) {
    throw new Error('Roof sign feet must remain on the pavilion slab.');
  }
  if (ROOF_SIGN_Z + art.bounds.min.z <= SIGN_Z + 0.04) {
    throw new Error('Roof lettering must clear its supporting rail.');
  }
  return merge(parts);
}

export function RooftopSignage({ night = true }: { night?: boolean }) {
  const art = useMemo(() => buildMeghamArtwork(ROOF_SIGN_WIDTH), []);
  const mount = useMemo(() => buildRoofMount(art), [art]);
  useEffect(() => () => {
    disposeNeonArtwork(art);
    mount.dispose();
  }, [art, mount]);
  return (
    <group name="Signage_Rooftop" userData={{ signId: 'megham', text: 'MEGHAM', style: 'reference-monoline' }}>
      <mesh name="Sign_Megham_Mount" geometry={mount} material={MAT.darkMetal} castShadow />
      <group name="Sign_Megham_Logo" position={[SIGN_X, ROOF_SIGN_BOTTOM, ROOF_SIGN_Z]}>
        <NeonTubes art={art} color="pink" night={night} />
      </group>
    </group>
  );
}

// The right portal pier's FRONT face, not its side. Letters remain upright.
const PIER_X = 8.6;
const PIER_Y = 3.3;
const PIER_FACE_Z = FACE_Z + 0.35 + 0.9;
const PANEL_WIDTH = 1.52;
const PANEL_HEIGHT = 5.78;
const PANEL_DEPTH = 0.045;
const PANEL_BACK_Z = PIER_FACE_Z + 0.014;
const PANEL_FRONT_Z = PANEL_BACK_Z + PANEL_DEPTH;
const ENTRANCE_TUBE_Z = PANEL_FRONT_Z + 0.058;
const ENTRANCE_TEXT_HEIGHT = 5.1;

function buildEntranceMount() {
  const panel = merge([
    box(PANEL_WIDTH, PANEL_HEIGHT, PANEL_DEPTH, PIER_X, PIER_Y, PANEL_BACK_Z + PANEL_DEPTH / 2),
    ...[1.1, 5.5].map((y) => box(0.12, 0.14, 0.014, PIER_X, y, PIER_FACE_Z + 0.007)),
  ]);
  const trims = merge([-1, 1].map((side) =>
    box(0.034, PANEL_HEIGHT - 0.14, 0.022, PIER_X + side * 0.66, PIER_Y, PANEL_FRONT_Z + 0.016),
  ));
  if (PIER_Y + PANEL_HEIGHT / 2 >= 6.4 || PIER_Y - PANEL_HEIGHT / 2 <= 0.22 || PANEL_WIDTH >= 1.8) {
    throw new Error('Entrance sign must fit completely on its portal pier.');
  }
  return { panel, trims };
}

/* ---- ASTARA — wordmark centred on the entrance lintel, flanked by light rules ---- */

/** Front face of the portal beam (lintel is box(19.6, 1.4, 1.8, 0, 7.1, 15.35)). */
const LINTEL_FACE_Z = 15.35 + 0.9; // 16.25
const LINTEL_Y = 7.1; // beam centre line
const LINTEL_HALF_W = 9.5; // matches 19.0 m wide lintel perfectly
const ASTARA_CAP_H = 0.62;
const ASTARA_STANDOFF = 0.055;

/**
 * The flanking light rules from the reference: a thin horizontal bar each side
 * with a small vertical terminal at the outer end. Proportioned from the word
 * so the lockup always stays balanced whatever the text length.
 */
function buildAstaraRules(art: NeonArtwork): G {
  const parts: G[] = [];
  const wordW = art.width;
  const capH = art.height;
  const ruleLen = wordW * 0.38;
  const gap = wordW * 0.1;
  const ruleHalf = ruleLen / 2;
  const ruleCx = wordW / 2 + gap + ruleHalf;
  const y = capH * 0.5;
  const thick = capH * 0.055;
  const depth = thick * 0.8;
  const tickH = capH * 0.16;

  for (const side of [-1, 1]) {
    const cx = side * ruleCx;
    parts.push(box(ruleLen, thick, depth, cx, y, 0));
    const outerX = cx + side * (ruleHalf - thick * 0.5);
    parts.push(box(thick, tickH, depth, outerX, y, 0));
  }

  if (ruleCx + ruleHalf + thick > LINTEL_HALF_W - 0.4) {
    throw new Error('ASTARA lockup must stay within the entrance beam.');
  }
  return merge(parts);
}

function AstaraBeamSign({ night }: { night: boolean }) {
  const art = useMemo(() => buildAstaraArtwork(ASTARA_CAP_H), []);
  const rules = useMemo(() => buildAstaraRules(art), [art]);
  useEffect(() => () => {
    disposeNeonArtwork(art);
    rules.dispose();
  }, [art, rules]);

  // Vertically centred on the beam; the artwork's origin is its own baseline.
  const y = LINTEL_Y - art.height / 2;
  return (
    <group
      name="Signage_Astara"
      position={[0, y, LINTEL_FACE_Z + ASTARA_STANDOFF]}
      userData={{ signId: 'astara', text: 'ASTARA', style: 'wordmark-with-rules' }}
    >
      <NeonTubes art={art} color="warm" night={night} />
      <mesh name="Astara_Light_Rules" geometry={rules} material={MAT.ledWhite} />
    </group>
  );
}

/** SEAWAYS edge trims share the letters' cyan-blue tone exactly. */
function makeSeawaysTrimMaterial() {
  const m = new THREE.MeshStandardMaterial({
    name: 'Sign_Seaways_Trim',
    color: '#2c313a',
    emissive: '#16a5e4',
    roughness: 0.35,
    metalness: 0.1,
    toneMapped: false,
  });
  return m;
}

export function EntranceSignage({ night = true }: { night?: boolean }) {
  const art = useMemo(() => buildSeawaysArtwork(ENTRANCE_TEXT_HEIGHT), []);
  const mount = useMemo(buildEntranceMount, []);
  const seawaysTrim = useMemo(makeSeawaysTrimMaterial, []);
  useLayoutEffect(() => registerDayMaterial(seawaysTrim, {
    color: '#5d7380', emissiveIntensity: 0, roughness: 0.6,
  }, { color: '#2c313a', emissiveIntensity: 2.6, roughness: 0.35 }), [seawaysTrim]);
  useEffect(() => () => seawaysTrim.dispose(), [seawaysTrim]);
  if (art.width >= 1.2 || art.height >= PANEL_HEIGHT - 0.2 || ENTRANCE_TUBE_Z + art.bounds.min.z <= PANEL_FRONT_Z + 0.027) {
    throw new Error('Seaways lettering must clear the panel and its edge trims.');
  }
  useEffect(() => () => {
    disposeNeonArtwork(art);
    mount.panel.dispose();
    mount.trims.dispose();
  }, [art, mount]);
  return (
    <>
      <AstaraBeamSign night={night} />
      <group name="Signage_Entrance" userData={{ signId: 'seaways', text: 'SEAWAYS', style: 'upright-stacked' }}>
        <mesh name="Sign_Seaways_BackPanel" geometry={mount.panel} material={MAT.darkMetal} />
        <mesh name="Sign_Seaways_WarmEdgeTrims" geometry={mount.trims} material={seawaysTrim} />
        <group name="Entrance_Sign_Seaways" position={[PIER_X, PIER_Y - art.height / 2, ENTRANCE_TUBE_Z]}>
          <NeonTubes art={art} color="blue" night={night} />
        </group>
      </group>
    </>
  );
}
