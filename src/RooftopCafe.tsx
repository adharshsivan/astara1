import { useMemo } from 'react';
import { MAT } from './materials';
import { box, cyl, merge, plankFloor, type G } from './geo';
import { RX, Z0, Z1 } from './dims';
import { POOL } from './InfinityPool';

/* Rooftop local space: origin = tower centre at deck level (y = 0). */

/** Inner face of the roof upstand (the deck and every strip stop exactly here). */
const INNER = RX - 0.15; // 11.85
const DECK_Z0 = Z0 + 0.15; // -9.85 — inner face of the back upstand
const DECK_Z1 = POOL.z0; // the deck ends at the pool coping
const DECK_D = DECK_Z1 - DECK_Z0;
const DECK_CZ = (DECK_Z0 + DECK_Z1) / 2;
/** Slab top relative to the deck surface. */
const SLAB_TOP = -0.12;

export const BULKHEAD = { x0: -11.2, x1: -5.2, z0: -9.4, z1: -4.2, h: 4.4 };
export const PAVILION = { x0: -3.0, x1: 8.0, z0: -9.4, z1: -3.2, h: 3.8 };
export const PERGOLA = { x0: -4.5, x1: 5.0, z0: -1.8, z1: 6.5, h: 3.3 };

/** Pavilion roof slab thickness / top (used by the sign mounts). */
export const PAVILION_ROOF_TOP = PAVILION.h + 0.26;

/**
 * Sliding glass door into the café pavilion.
 * Sits in the front (south) bay of the glass wall and is RETRACTED by default so
 * the café reads as open to the sky terrace.
 */
export const CAFE_DOOR = {
  x0: 0.8,
  x1: 4.2,
  /** underside of the head track / top of the leaves */
  headY: 2.94,
  /** top of the bottom track */
  sillY: 0.055,
  /** track centre lines (both inside the glass line) */
  zFixed: PAVILION.z1 - 0.175,
  zSlide: PAVILION.z1 - 0.092,
  leafW: 1.68,
  /** 0 = closed, 1 = fully retracted over the fixed leaf */
  open: 1,
};

const mid = (a: number, b: number) => (a + b) / 2;
const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** Planks rest on an underlay that rests on the roof slab: nothing floats. */
function buildDeck(): G {
  return plankFloor(INNER * 2, DECK_D, 0, -0.025, DECK_CZ);
}

function buildDarkMetal(): G {
  const p: G[] = [];
  const b = BULKHEAD;
  const v = PAVILION;
  const vw = v.x1 - v.x0;
  const vd = v.z1 - v.z0;

  // Underlay: from the slab top up to the underside of the planks
  p.push(bx(-INNER, INNER, SLAB_TOP, -0.05, DECK_Z0, DECK_Z1));
  // Bulkhead core, rooted 5 cm into the deck so no seam flickers at its foot
  p.push(bx(b.x0, b.x1, -0.05, b.h, b.z0, b.z1));
  // Pavilion roof slab (the pavilion floor is simply the deck — no plinth to sink furniture into)
  p.push(box(vw + 1.1, 0.26, vd + 1.1, mid(v.x0, v.x1), v.h + 0.13, mid(v.z0, v.z1)));

  return merge(p);
}

/**
 * Pendant suspension for the rectangular LED frames.
 *
 * The old stub cords stopped 1.1 m short of the frame, which is what made the
 * frames read as floating. These rods are driven from the same constants as
 * buildPendantFrames (centre, width, frame plane) so every rod lands exactly
 * on its frame corner at both ends — frame top and slab underside are shared,
 * never guessed. A rosette is embedded in the slab at the top.
 */
function buildPendantSuspension(): G {
  const v = PAVILION;
  const zc = mid(v.z0, v.z1);
  const W = PENDANT_FRAME_W;
  const D = PENDANT_FRAME_D;
  const y = PENDANT_FRAME_Y;   // frame top plane
  const slabY = v.h;           // pavilion roof slab underside
  const rodR = 0.009;          // 18 mm rod — slimmer than the frame bar
  const R = 0.10;              // rod offset from frame centre
  const parts: G[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = v.x0 + 1.4 + i * 2.1;
    for (const sx of [-1, 1]) {
      const px = cx + sx * (W / 2 - R);
      for (const sz of [-1, 1]) {
        const pz = zc + sz * (D / 2 - R);
        // Rod runs from the frame top into the slab, overlapping both.
        parts.push(cyl(rodR, rodR, slabY - y + 0.05, px, (slabY + y) / 2, pz, 8));
      }
    }
    // Rosette at the ceiling: a shallow disc overlapping the slab underside.
    parts.push(cyl(0.075, 0.062, 0.035, cx, slabY - 0.015, zc, 14));
  }
  return merge(parts);
}

/** Real rooftop bulkhead door on the east face of the stair/elevator block. */
function buildCafeEntranceDoor(): { dark: G; glass: G; frame: G; glow: G } {
  const b = BULKHEAD;
  const cx = b.x1 + 0.05;
  const cz = mid(b.z0, b.z1);
  return {
    dark: box(0.12, 2.55, 1.55, cx, 1.275, cz),
    glass: box(0.045, 2.2, 1.25, cx + 0.08, 1.16, cz),
    frame: merge([
      box(0.08, 2.45, 0.08, cx + 0.12, 1.23, cz - 0.72),
      box(0.08, 2.45, 0.08, cx + 0.12, 1.23, cz + 0.72),
      box(0.08, 0.08, 1.52, cx + 0.12, 2.44, cz),
      box(0.06, 0.78, 0.05, cx + 0.16, 1.22, cz + 0.28),
    ]),
    glow: box(0.025, 2.05, 1.1, cx + 0.15, 1.17, cz),
  };
}

/** The sliding glass door itself: track, two leaves, stiles and a pull. */
function buildCafeSlidingDoor(): { glass: G; frame: G } {
  const d = CAFE_DOOR;
  const travel = d.leafW * d.open;

  // closed position of the sliding leaf, then retracted toward the fixed leaf
  const slideClosed = d.x1 - 0.07 - d.leafW / 2;
  const slideCx = slideClosed - travel;
  const fixedCx = d.x0 + 0.07 + d.leafW / 2;

  const glass: G[] = [];
  const frame: G[] = [];

  // head + sill tracks (span the whole opening so both leaves are carried)
  frame.push(bx(d.x0 - 0.09, d.x1 + 0.09, d.headY, d.headY + 0.075, d.zSlide - 0.13, d.zFixed + 0.13));
  frame.push(bx(d.x0 - 0.09, d.x1 + 0.09, d.sillY - 0.055, d.sillY, d.zSlide - 0.13, d.zFixed + 0.13));
  // jamb closers at both ends of the opening
  frame.push(bx(d.x0 - 0.075, d.x0 - 0.005, d.sillY, d.headY, d.zFixed - 0.05, d.zFixed + 0.05));
  frame.push(bx(d.x1 + 0.005, d.x1 + 0.075, d.sillY, d.headY, d.zFixed - 0.05, d.zFixed + 0.05));

  // fixed leaf: slim stiles + glass
  frame.push(bx(fixedCx - d.leafW / 2, fixedCx - d.leafW / 2 + 0.055, d.sillY, d.headY, d.zFixed - 0.022, d.zFixed + 0.022));
  frame.push(bx(fixedCx + d.leafW / 2 - 0.055, fixedCx + d.leafW / 2, d.sillY, d.headY, d.zFixed - 0.022, d.zFixed + 0.022));
  frame.push(bx(fixedCx - d.leafW / 2, fixedCx + d.leafW / 2, d.headY - 0.05, d.headY, d.zFixed - 0.022, d.zFixed + 0.022));
  glass.push(bx(fixedCx - d.leafW / 2 + 0.05, fixedCx + d.leafW / 2 - 0.05, d.sillY + 0.01, d.headY - 0.05, d.zFixed - 0.012, d.zFixed + 0.012));

  // sliding leaf (parked open over the fixed leaf)
  frame.push(bx(slideCx - d.leafW / 2, slideCx - d.leafW / 2 + 0.055, d.sillY, d.headY, d.zSlide - 0.022, d.zSlide + 0.022));
  frame.push(bx(slideCx + d.leafW / 2 - 0.055, slideCx + d.leafW / 2, d.sillY, d.headY, d.zSlide - 0.022, d.zSlide + 0.022));
  frame.push(bx(slideCx - d.leafW / 2, slideCx + d.leafW / 2, d.headY - 0.05, d.headY, d.zSlide - 0.022, d.zSlide + 0.022));
  frame.push(bx(slideCx - d.leafW / 2, slideCx + d.leafW / 2, d.sillY, d.sillY + 0.05, d.zSlide - 0.022, d.zSlide + 0.022));
  glass.push(bx(slideCx - d.leafW / 2 + 0.05, slideCx + d.leafW / 2 - 0.05, d.sillY + 0.05, d.headY - 0.05, d.zSlide - 0.012, d.zSlide + 0.012));

  // vertical pull on the leading edge of the sliding leaf
  const pullX = slideCx + d.leafW / 2 - 0.16;
  frame.push(bx(pullX - 0.02, pullX + 0.02, 0.95, 1.85, d.zSlide + 0.022, d.zSlide + 0.055));

  return { glass: merge(glass), frame: merge(frame) };
}

/**
 * Two TVs directly mounted flush onto the glass wall — no rods, no sticks, no bulky hardware.
 * Left TV is centered specifically within the LEFT glass panel zone (x = -0.25).
 * Right TV is centered specifically within the RIGHT glass panel zone (x = 5.25).
 * Neither TV overlaps or sits on top of any structural beam.
 */
function buildCafeTVs(): { frames: G; screens: G; glow: G } {
  const v = PAVILION;
  const p: G[] = [];
  const s: G[] = [];
  const g: G[] = [];

  const w = 2.0;
  const h = 1.12;
  const y = 2.05; // centered vertically in the 3.8m tall glass panel (1.49m floor clearance)
  const z = v.z0 + 0.08; // directly flush against the inside of the glass wall

  // Left glass-wall panel center is -0.25; Right glass-wall panel center is 5.25
  for (const x of [-0.25, 5.25]) {
    // Ultra-slim commercial display bezel
    p.push(box(w + 0.08, h + 0.08, 0.04, x, y, z));
    // High-resolution display screen
    s.push(box(w, h, 0.02, x, y, z + 0.02));
    // Subtle lower accent LED
    g.push(box(w - 0.2, 0.02, 0.015, x, y - h / 2 - 0.02, z + 0.02));
  }
  return { frames: merge(p), screens: merge(s), glow: merge(g) };
}

type PergolaBox = { x0: number; x1: number; z0: number; z1: number; h: number };

/** Bronze pergola: 4 posts, perimeter beams, shade slats that run between the beam centres. */
function pergolaParts(g: PergolaBox): G[] {
  const p: G[] = [];
  for (const [x, z] of [
    [g.x0, g.z0],
    [g.x1, g.z0],
    [g.x0, g.z1],
    [g.x1, g.z1],
  ]) {
    p.push(box(0.16, g.h, 0.16, x, g.h / 2, z));
  }
  p.push(box(g.x1 - g.x0 + 0.16, 0.15, 0.15, mid(g.x0, g.x1), g.h, g.z0));
  p.push(box(g.x1 - g.x0 + 0.16, 0.15, 0.15, mid(g.x0, g.x1), g.h, g.z1));
  p.push(box(0.15, 0.15, g.z1 - g.z0, g.x0, g.h, mid(g.z0, g.z1)));
  p.push(box(0.15, 0.15, g.z1 - g.z0, g.x1, g.h, mid(g.z0, g.z1)));
  // Slats: ends sit inside the beams, tops touch the beam undersides.
  for (let x = g.x0 + 0.4; x < g.x1 - 0.2; x += 0.62) {
    p.push(box(0.08, 0.1, g.z1 - g.z0, x, g.h - 0.12, mid(g.z0, g.z1)));
  }
  return p;
}

function buildBronze(): G {
  const p: G[] = [];
  const b = BULKHEAD;
  const v = PAVILION;

  // Bulkhead slat screens: floor to roof, attached to the faces
  const slatT = 0.08;
  const slatD = 0.14;
  for (let x = b.x0 + 0.2; x < b.x1 - 0.1; x += 0.32) {
    p.push(box(slatT, b.h, slatD, x, b.h / 2, b.z1 + slatD / 2));
  }
  for (let z = b.z0 + 0.2; z < b.z1 - 0.1; z += 0.32) {
    p.push(box(slatD, b.h, slatT, b.x1 + slatD / 2, b.h / 2, z));
  }

  // Back wall posts: clean center divider at x = 2.5 creating two equal glass bays (span -3.0 to 2.5 and 2.5 to 8.0)
  for (const x of [v.x0, mid(v.x0, v.x1), v.x1]) {
    p.push(box(0.13, v.h, 0.13, x, v.h / 2, v.z0));
  }
  // Front posts
  for (const x of [v.x0, v.x0 + 3.67, v.x0 + 7.33, v.x1]) {
    p.push(box(0.13, v.h, 0.13, x, v.h / 2, v.z1));
  }
  for (const x of [v.x0, v.x1]) p.push(box(0.13, v.h, 0.13, x, v.h / 2, mid(v.z0, v.z1)));

  // Continuous perimeter head rails at ceiling line
  const railY = v.h - 0.05;
  p.push(box(v.x1 - v.x0 + 0.13, 0.11, 0.13, mid(v.x0, v.x1), railY, v.z1));
  p.push(box(v.x1 - v.x0 + 0.13, 0.11, 0.13, mid(v.x0, v.x1), railY, v.z0));
  p.push(box(0.13, 0.11, v.z1 - v.z0 - 0.13, v.x0, railY, mid(v.z0, v.z1)));
  p.push(box(0.13, 0.11, v.z1 - v.z0 - 0.13, v.x1, railY, mid(v.z0, v.z1)));

  p.push(...pergolaParts(PERGOLA));
  return merge(p);
}

/**
 * Vertical glass wall panels only — NO horizontal glass over the floor.
 * The front bay is interrupted by the sliding door opening (CAFE_DOOR).
 */
function buildGlass(): G {
  const v = PAVILION;
  const t = 0.03;
  const w = v.x1 - v.x0;
  const d = v.z1 - v.z0;
  const frontZ = v.z1 - 0.05;
  const gx0 = mid(v.x0, v.x1) - (w - 0.26) / 2;
  const gx1 = mid(v.x0, v.x1) + (w - 0.26) / 2;
  const head = CAFE_DOOR.headY + 0.075;

  return merge([
    // North wall (back glass)
    box(w - 0.26, v.h - 0.1, t, mid(v.x0, v.x1), v.h / 2, v.z0 + 0.05),
    // South wall (front glass) — split around the sliding door
    bx(gx0, CAFE_DOOR.x0, 0.05, v.h - 0.1, frontZ - t / 2, frontZ + t / 2),
    bx(CAFE_DOOR.x1, gx1, 0.05, v.h - 0.1, frontZ - t / 2, frontZ + t / 2),
    bx(CAFE_DOOR.x0, CAFE_DOOR.x1, head, v.h - 0.1, frontZ - t / 2, frontZ + t / 2),
    // West wall
    box(t, v.h - 0.1, d - 0.26, v.x0 + 0.05, v.h / 2, mid(v.z0, v.z1)),
    // East wall
    box(t, v.h - 0.1, d - 0.26, v.x1 - 0.05, v.h / 2, mid(v.z0, v.z1)),
  ]);
}

function buildInteriorGlow(): G {
  const v = PAVILION;
  const b = BULKHEAD;
  return merge([
    // ceiling panel flush under the roof slab
    bx(v.x0 + 0.5, v.x1 - 0.5, v.h - 0.05, v.h, v.z0 + 0.5, v.z1 - 0.5),
    // lift-door glow: lies over the slats (0.14), from the deck up
    bx(b.x1, b.x1 + 0.16, 0, 2.5, mid(b.z0, b.z1) - 0.75, mid(b.z0, b.z1) + 0.75),
  ]);
}

/**
 * Restaurant pendant style — a suspended rectangular LED frame, matching the
 * hanging square light-bar reference: a slim dark frame with a continuous
 * luminous strip on its inner underside. Five units run in a row over the
 * pavilion tables. The existing single cord per unit already ends at y=2.7, so
 * the frame plane sits exactly there and each cord meets its corner.
 *
 * Frame + cords share the dark structural material (one mesh); the four light
 * strips are a second mesh on the existing warm LED material. Two draw calls.
 */
/* Pendant frame constants, shared with buildPendantSuspension so the rods and
 * the frame can never drift apart. */
const PENDANT_FRAME_W = 1.24; // frame width, along X (slimmed from 1.5)
const PENDANT_FRAME_D = 0.62; // frame depth, along Z (slimmed from 0.8)
const PENDANT_FRAME_Y = 2.70; // frame top plane

function buildPendantFrames(): { frame: G; glow: G } {
  const v = PAVILION;
  const zc = mid(v.z0, v.z1);
  const W = PENDANT_FRAME_W;
  const D = PENDANT_FRAME_D;
  const y = PENDANT_FRAME_Y; // frame top plane
  const BAR = 0.032; // frame bar width — slim, matching a real LED profile
  const BAR_H = 0.036; // frame bar thickness
  const IW = 0.026;  // inner light strip width
  const IY = y - 0.026; // strips sit just under the frame, so both read
  const frameParts: G[] = [];
  const glowParts: G[] = [];
  const innerW = W - 2 * BAR;
  const innerD = D - 2 * BAR;
  for (let i = 0; i < 5; i++) {
    const cx = v.x0 + 1.4 + i * 2.1;
    // Long edges (front and back) and short edges (left and right).
    frameParts.push(box(W, BAR_H, BAR, cx, y, zc - D / 2 + BAR / 2));
    frameParts.push(box(W, BAR_H, BAR, cx, y, zc + D / 2 - BAR / 2));
    frameParts.push(box(BAR, BAR_H, innerD, cx - W / 2 + BAR / 2, y, zc));
    frameParts.push(box(BAR, BAR_H, innerD, cx + W / 2 - BAR / 2, y, zc));
    // Continuous luminous loop set into the inner edge of the frame.
    glowParts.push(box(innerW, 0.03, IW, cx, IY, zc + innerD / 2 - IW / 2));
    glowParts.push(box(innerW, 0.03, IW, cx, IY, zc - innerD / 2 + IW / 2));
    glowParts.push(box(IW, 0.03, innerD, cx - innerW / 2 + IW / 2, IY, zc));
    glowParts.push(box(IW, 0.03, innerD, cx + innerW / 2 - IW / 2, IY, zc));
  }
  return { frame: merge(frameParts), glow: merge(glowParts) };
}

/**
 * Cyan strip mounted on the inner face of the upstand (back + sides; the
 * front is open to the pool). The back run spans the full width so it
 * overlaps the side runs in solid corner cubes — previously each end stopped
 * exactly at the side strip's face, leaving a hairline dark seam at both
 * rear corners.
 */
function buildLedStrips(): G {
  const y0 = 0.275;
  const y1 = 0.325;
  const t = 0.03;
  return merge([
    bx(-INNER, INNER, y0, y1, DECK_Z0, DECK_Z0 + t),
    bx(-INNER, -INNER + t, y0, y1, DECK_Z0, Z1),
    bx(INNER - t, INNER, y0, y1, DECK_Z0, Z1),
  ]);
}

/**
 * Violet wash strip along the SOUTH and EAST faces of the bulkhead.
 * The east face has a cutout for the entrance door so no line runs through the doorway.
 */
function buildVioletWash(): G {
  const b = BULKHEAD;
  const t = 0.04;
  const y0 = 0.02;
  const y1 = 0.06;
  const cz = mid(b.z0, b.z1);
  const slatFaceX = b.x1 + 0.14; // outer face of the slats

  return merge([
    // South face wash strip — runs past the corner to overlap the east run
    bx(b.x0 + 0.2, slatFaceX + t, y0, y1, b.z1 + 0.14, b.z1 + 0.14 + t),
    // East face wash strip — back section (from corner to door)
    bx(slatFaceX, slatFaceX + t, y0, y1, b.z0 + 0.2, cz - 0.785),
    // East face wash strip — front section (from door to south corner)
    bx(slatFaceX, slatFaceX + t, y0, y1, cz + 0.785, b.z1 + 0.14 + t),
  ]);
}

export function RooftopCafe() {
  const deck = useMemo(buildDeck, []);
  const dark = useMemo(buildDarkMetal, []);
  const bronze = useMemo(buildBronze, []);
  const glass = useMemo(buildGlass, []);
  const glow = useMemo(buildInteriorGlow, []);
  const pendantFrames = useMemo(buildPendantFrames, []);
  const pendantSuspension = useMemo(buildPendantSuspension, []);
  const led = useMemo(buildLedStrips, []);
  const violet = useMemo(buildVioletWash, []);
  const entrance = useMemo(buildCafeEntranceDoor, []);
  const tvs = useMemo(buildCafeTVs, []);
  const slider = useMemo(buildCafeSlidingDoor, []);

  return (
    <group name="RooftopCafe">
      <mesh name="Deck_Planks" geometry={deck} material={MAT.wood} receiveShadow />
      <mesh name="Cafe_Structure_Dark" geometry={dark} material={MAT.darkMetal} castShadow receiveShadow />
      <mesh name="Cafe_Frames_Bronze" geometry={bronze} material={MAT.bronze} castShadow receiveShadow />
      <mesh name="Cafe_Pavilion_Glass" geometry={glass} material={MAT.glass} renderOrder={11} />
      <mesh name="Cafe_Sliding_Door_Glass" geometry={slider.glass} material={MAT.glass} renderOrder={12} />
      <mesh name="Cafe_Sliding_Door_Frame" geometry={slider.frame} material={MAT.bronze} castShadow />
      <mesh name="Cafe_Entrance_Door" geometry={entrance.dark} material={MAT.darkMetal} castShadow />
      <mesh name="Cafe_Entrance_Glass" geometry={entrance.glass} material={MAT.glass} renderOrder={12} />
      <mesh name="Cafe_Entrance_Frame" geometry={entrance.frame} material={MAT.bronze} castShadow />
      <mesh name="Cafe_Entrance_Glow" geometry={entrance.glow} material={MAT.interiorGlow} />
      <mesh name="Cafe_TV_Frames" geometry={tvs.frames} material={MAT.darkMetal} castShadow />
      <mesh name="Cafe_TV_Screens" geometry={tvs.screens} material={MAT.tvScreen} />
      <mesh name="Cafe_TV_Glow_Strips" geometry={tvs.glow} material={MAT.neonCyan} />
      <mesh name="Cafe_Interior_Glow" geometry={glow} material={MAT.interiorGlow} />
      <mesh name="Cafe_Pendant_Rods" geometry={pendantSuspension} material={MAT.darkMetal} castShadow />
      <mesh name="Cafe_Pendant_LED_Frames" geometry={pendantFrames.frame} material={MAT.darkMetal} castShadow />
      <mesh name="Cafe_Pendant_LED_Strips" geometry={pendantFrames.glow} material={MAT.ledWhite} />
      <mesh name="LED_Strip_Cyan" geometry={led} material={MAT.neonCyan} />
      <mesh name="LED_Wash_Violet" geometry={violet} material={MAT.neonViolet} />
    </group>
  );
}
