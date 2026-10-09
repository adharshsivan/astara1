import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { box, cyl, merge, sphere, type G } from './geo';
import { Instances, type InstanceItem } from './Instances';
import { makeChairGeos } from './SeatingArea';
import { buildLiveArtwork, disposeNeonArtwork } from './NeonArtwork';
import { NeonTubes } from './Signage';

/* Rooftop local space (origin = tower centre at deck level, y = 0 is the plank surface). */

/**
 * Open-air performance podium. The singer faces -Z toward the audience.
 *
 * Every element is attached to the podium deck:
 *   body (0 → 0.46) → deck (0.46 → 0.52) → speakers / posts / mic base
 *   posts → header beam
 */
export const STAGE = { x0: 0.5, x1: 6.5, z0: 12.4, z1: 14.8, h: 0.46 };
const SCX = (STAGE.x0 + STAGE.x1) / 2; // 3.5
const SCZ = (STAGE.z0 + STAGE.z1) / 2; // 13.6
const DECK_T = 0.06;
/** Walking surface of the podium. */
const TOP = STAGE.h + DECK_T; // 0.52

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/* Two audience rows, spaced for comfortable movement. */
const ROWS = [10.2, 8.8];
const SEATS_PER_ROW = 6;
const SEAT_STEP = 1.8;

/* Header: two posts planted in the deck, a beam on top, sign on the beam. */
const POST_Z = SCZ + 1.05; // 14.65 — inside the podium (back edge 14.8)
const POST_H = 1.9;
const BEAM_H = 0.1;
const BEAM_TOP = TOP + POST_H + BEAM_H;

function buildStageStructure(): G {
  const x0 = STAGE.x0;
  const zA = SCZ - 0.7;
  const zB = SCZ + 0.3;
  return merge([
    // podium body
    bx(STAGE.x0, STAGE.x1, 0, STAGE.h, STAGE.z0, STAGE.z1),
    // west access: two 0.26 m risers, flush against the podium side
    bx(x0 - 1.3, x0, 0, 0.26, zA, zB),
    bx(x0 - 0.65, x0, 0.26, TOP, zA, zB),
  ]);
}

function buildStageDeck(): G {
  return bx(STAGE.x0, STAGE.x1, STAGE.h, TOP, STAGE.z0, STAGE.z1);
}

/**
 * Pink strip on the front and east faces of the podium body (3 cm proud). The
 * front run extends past the corner and the side run starts at the front
 * strip's face, so the two overlap in a solid corner cube instead of stopping
 * 10 cm short of each other and leaving a dark gap.
 */
function buildStageTrim(): G {
  const y0 = 0.1;
  const y1 = 0.14;
  const t = 0.03;
  return merge([
    bx(STAGE.x0 + 0.1, STAGE.x1 + t, y0, y1, STAGE.z0 - t, STAGE.z0),
    bx(STAGE.x1, STAGE.x1 + t, y0, y1, STAGE.z0 - t, STAGE.z1 - 0.1),
  ]);
}

// Professional touring concert PA loudspeakers: realistic proportion (0.46m wide x 0.88m tall x 0.38m deep)
const SPK_W = 0.46;
const SPK_H = 0.88;
const SPK_D = 0.38;
const SPK_Y = TOP + SPK_H / 2; // resting on the deck
const SPK_Z = SCZ + 0.52;
const SPK_XS = [STAGE.x0 + 0.85, STAGE.x1 - 0.85];

function buildStageFixtures(): G {
  const p: G[] = [];
  // Speaker cabinets + isolation feet + horn waveguide flare + woofer surround rings
  for (const x of SPK_XS) {
    // 4 rubber isolation feet grounding cabinet to stage deck
    for (const dx of [-SPK_W / 2 + 0.06, SPK_W / 2 - 0.06]) {
      for (const dz of [-SPK_D / 2 + 0.06, SPK_D / 2 - 0.06]) {
        p.push(cyl(0.03, 0.03, 0.025, x + dx, TOP + 0.0125, SPK_Z + dz, 8));
      }
    }
    // Main speaker enclosure with top beveled reveal
    p.push(box(SPK_W, SPK_H - 0.02, SPK_D, x, SPK_Y + 0.01, SPK_Z));
    p.push(box(SPK_W - 0.04, 0.02, SPK_D - 0.04, x, TOP + SPK_H, SPK_Z));
    // High-frequency horn waveguide flare
    const hornZ = SPK_Z - SPK_D / 2 - 0.015;
    p.push(box(0.24, 0.14, 0.03, x, TOP + SPK_H - 0.22, hornZ));
    // 12-inch main woofer surround ring and center phase plug
    const wooferZ = SPK_Z - SPK_D / 2 - 0.02;
    const wooferY = TOP + 0.32;
    const rim = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 16);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, wooferY, wooferZ);
    p.push(rim);
    p.push(sphere(0.045, x, wooferY, wooferZ - 0.01, 10, 8));
  }

  // Header posts planted in the deck, beam resting on them
  for (const x of [STAGE.x0 + 0.28, STAGE.x1 - 0.28]) {
    p.push(bx(x - 0.06, x + 0.06, TOP, TOP + POST_H, POST_Z - 0.06, POST_Z + 0.06));
  }
  p.push(bx(STAGE.x0 + 0.22, STAGE.x1 - 0.22, TOP + POST_H, BEAM_TOP, POST_Z - 0.08, POST_Z + 0.08));

  // Mic stand: base plate on the deck → pole from the plate → boom from the pole top → head at the boom end
  const mx = SCX;
  const mz = SCZ - 0.35;
  const poleTop = TOP + 1.43;
  p.push(cyl(0.22, 0.24, 0.04, mx, TOP + 0.02, mz, 14));
  p.push(cyl(0.026, 0.026, poleTop - (TOP + 0.03), mx, (poleTop + TOP + 0.03) / 2, mz, 8));
  // Boom runs from the pole top back toward the singer's mouth (+Z, slightly up)
  const dy = 0.07;
  const dz = 0.3;
  const len = Math.hypot(dy, dz);
  const boom = new THREE.CylinderGeometry(0.02, 0.02, len, 8);
  boom.rotateX(Math.atan2(dz, dy));
  boom.translate(mx, poleTop + dy / 2, mz + dz / 2);
  p.push(boom);
  p.push(sphere(0.026, mx, poleTop, mz, 8, 6)); // clamp at the pole top
  p.push(sphere(0.052, mx, poleTop + dy, mz + dz, 10, 8)); // mic head at the boom tip
  return merge(p);
}

/** Front acoustic grille inserts and bass reflex ports facing the audience. */
function buildSpeakerGrilles(): G {
  const p: G[] = [];
  for (const x of SPK_XS) {
    const frontZ = SPK_Z - SPK_D / 2 - 0.005;
    // Dark steel acoustic front baffle plate
    p.push(box(SPK_W - 0.05, SPK_H - 0.06, 0.015, x, SPK_Y + 0.01, frontZ));
    // Bass reflex dual ports at cabinet base
    for (const px of [x - 0.1, x + 0.1]) {
      const port = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10);
      port.rotateX(Math.PI / 2);
      port.translate(px, TOP + 0.09, frontZ - 0.01);
      p.push(port);
    }
  }
  return merge(p);
}

/** Cyan strip attached to the front face of the header beam. */
function buildBeamNeon(): G {
  const yc = TOP + POST_H + BEAM_H / 2;
  return bx(STAGE.x0 + 0.5, STAGE.x1 - 0.5, yc - 0.02, yc + 0.02, POST_Z - 0.08 - 0.02, POST_Z - 0.08);
}

function buildAudienceItems(): InstanceItem[] {
  const items: InstanceItem[] = [];
  for (const z of ROWS) {
    for (let i = 0; i < SEATS_PER_ROW; i++) {
      items.push({ p: [SCX + (i - (SEATS_PER_ROW - 1) / 2) * SEAT_STEP, 0, z], r: [0, 0, 0] });
    }
  }
  return items;
}

export function TerraceStage() {
  const structure = useMemo(buildStageStructure, []);
  const deck = useMemo(buildStageDeck, []);
  const trim = useMemo(buildStageTrim, []);
  const fixtures = useMemo(buildStageFixtures, []);
  const speakerGrilles = useMemo(buildSpeakerGrilles, []);
  const beamNeon = useMemo(buildBeamNeon, []);
  const audience = useMemo(buildAudienceItems, []);
  const chairs = useMemo(makeChairGeos, []);
  // LIVE wordmark standing on the header beam, centred on the stage.
  const liveArt = useMemo(() => buildLiveArtwork(0.36), []);
  const liveRail = useMemo(() => {
    const w = liveArt.width + 0.24;
    return bx(SCX - w / 2, SCX + w / 2, BEAM_TOP, BEAM_TOP + 0.05, POST_Z - 0.06, POST_Z + 0.06);
  }, [liveArt]);
  useEffect(() => () => {
    disposeNeonArtwork(liveArt);
    liveRail.dispose();
  }, [liveArt, liveRail]);

  return (
    <group name="TerraceStage">
      <mesh name="Stage_Podium" geometry={structure} material={MAT.concrete} castShadow receiveShadow />
      <mesh name="Stage_Deck" geometry={deck} material={MAT.woodLight} receiveShadow />
      <mesh name="Stage_Trim_Neon" geometry={trim} material={MAT.neonPink} />
      <mesh name="Stage_Fixtures" geometry={fixtures} material={MAT.darkMetal} castShadow />
      <mesh name="Stage_Speaker_Grilles" geometry={speakerGrilles} material={MAT.concreteDark} castShadow />
      <mesh name="Stage_Header_Neon" geometry={beamNeon} material={MAT.neonCyan} />
      <mesh name="Stage_Live_Rail" geometry={liveRail} material={MAT.darkMetal} castShadow />
      <group name="Stage_Live_Sign" position={[SCX, BEAM_TOP + 0.05, POST_Z]} rotation={[0, Math.PI, 0]}>
        <NeonTubes art={liveArt} color="pink" night />
      </group>
      <Instances name="Stage_Audience_Seats" geometry={chairs.soft} material={MAT.teal} items={audience} castShadow />
      <Instances name="Stage_Audience_Frames" geometry={chairs.frame} material={MAT.darkMetal} items={audience} />
      <pointLight name="PL_Stage" position={[SCX, 2.6, SCZ - 1.2]} color="#ff6fb0" intensity={18} distance={10} decay={2} />
    </group>
  );
}
