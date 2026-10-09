import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { box, merge, ring, type G } from './geo';
import { FACE_Z, PODIUM, TOWER, TOWER_BASE, TOWER_H, ROOF_Y, DECK_Y, Z1, TERRACE_EXIT } from './dims';
import { assignInteriorUnits, buildPaneGeometry, type Pane } from './InteriorWindows';
import { InteriorWindowMesh } from './InteriorWindowMesh';
import { ColumnLightStrips } from './ColumnLight';
import { LED_WALL, LedWallSurface, type LedPanelPlane } from './LedWall';
import { POOL } from './InfinityPool';
import {
  PottedPlants,
  TroughPlanters,
  troughFlowerRow,
  LEAF_TONES,
  POT_TONES,
  FLOWER_TONES,
  type PottedPlantSpec,
  type TroughSpec,
} from './Plants';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/*  A face is described by its outward rotation; u runs along the face */
/* ------------------------------------------------------------------ */

interface Face {
  ry: number;
  /** half-width of the face */
  half: number;
  /** distance from building centre to the face plane */
  off: number;
}

const TW = TOWER.w; // 24
const TD = TOWER.d; // 20

const TOWER_FACES: Face[] = [
  { ry: 0, half: TW / 2, off: TD / 2 },
  { ry: Math.PI, half: TW / 2, off: TD / 2 },
  { ry: Math.PI / 2, half: TD / 2, off: TW / 2 },
  { ry: -Math.PI / 2, half: TD / 2, off: TW / 2 },
];

/** world position of a point on a face, u along the face, n outward by `out`. */
function fp(f: Face, u: number, y: number, out = 0): [number, number, number] {
  const c = Math.cos(f.ry);
  const s = Math.sin(f.ry);
  return [c * u + s * (f.off + out), y, -s * u + c * (f.off + out)];
}

/** Axis-aligned box sitting on a face (w along u, d outward). */
function faceBox(f: Face, u: number, y: number, out: number, w: number, h: number, d: number): G {
  const [x, yy, z] = fp(f, u, y, out + d / 2);
  return box(w, h, d, x, yy, z, f.ry);
}

/** Box from min/max extents. */
const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/* ---------------- Facade palette (colour only — no geometry is altered) ---------------- */

const TONE = {
  ivory: '#e7e2d6', // warm off-white slabs / bands
  pale: '#c2c6ca', // light cool gray, alternates with ivory
  mid: '#8b9097', // medium cool gray secondary surfaces
  graphite: '#3a3e45', // strong vertical masses / podium base
} as const;

/** Bakes a flat vertex colour onto a part so one merged mesh can carry many tones. */
function paint(g: G, hex: string): G {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Collects parts exactly like a plain array, but colours each with the current tone. */
class ToneBag {
  items: G[] = [];
  private hex: string = TONE.ivory;
  tone(hex: string) {
    this.hex = hex;
  }
  push(...parts: G[]) {
    for (const g of parts) this.items.push(paint(g, this.hex));
    return this.items.length;
  }
}

/* ---------------- Tower grid ---------------- */

const PIER_W = 1.5; // corner pier width
const CTR_W = 1.7; // central pier width
const BAYS_PER_ZONE = 3;
const BAND_H = 0.62; // horizontal spandrel band
const SILL = 0.42;
const WIN_H = TOWER.fh - BAND_H - SILL + 0.2; // ~2.76

/** Piers run from 0.1 m inside the face line to 0.65 m proud of it. */
const PIER_IN = -0.1;
const PIER_D = 0.75;
const PIER_OUT = PIER_IN + PIER_D; // 0.65
/** Spandrel / slab-edge beam front face (recessed behind the piers). */
const BAND_OUT = 0.5;

/**
 * TOP of the first-floor spandrel band (spans 12.80 → 13.42).
 *
 * This is where the front-face vertical elements must begin. The band projects
 * to 0.50 m while the wood fins only reach 0.29 m, so the band masks the fins'
 * lower 0.6 m and they visually start at 13.42. The centre pier projects to
 * 0.65 m — past the band — so its base was fully visible at 12.82 and read as
 * starting 0.6 m BELOW the fins. Anchoring the pier, its LED strips and the
 * fins to the band top puts all three on one line.
 */
const FRONT_PIER_BASE_Y = TOWER_BASE + TOWER.fh + BAND_H - 0.1;

/**
 * First-floor front lobby bay: the terrace door plus its two floor-height
 * sidelights. Derived from the same bay formula the rest of the facade uses, so
 * the sidelights keep the FULL width of the window bay they replace. Shrinking
 * them left an unglazed strip that exposed the dark core as a black box.
 */
const LOBBY_BAY_W = (TW / 2 - PIER_W - CTR_W / 2) / BAYS_PER_ZONE;
/** Outer edge of each sidelight = outer edge of the original bay (±4.01). */
const LOBBY_GLAZING_HALF = CTR_W / 2 + LOBBY_BAY_W - 0.06;
/** The plinth is notched just past the glazing so it cannot clip the sill. */
const LOBBY_NOTCH_HALF = LOBBY_GLAZING_HALF + 0.05;

/** Bay centres + widths for one face. */
function bays(f: Face): { u: number; w: number }[] {
  const out: { u: number; w: number }[] = [];
  const zoneA0 = -f.half + PIER_W;
  const zoneA1 = -CTR_W / 2;
  const zoneB0 = CTR_W / 2;
  const zoneB1 = f.half - PIER_W;
  for (const [a, b] of [
    [zoneA0, zoneA1],
    [zoneB0, zoneB1],
  ]) {
    const w = (b - a) / BAYS_PER_ZONE;
    for (let i = 0; i < BAYS_PER_ZONE; i++) out.push({ u: a + w * (i + 0.5), w });
  }
  return out;
}

interface BalconySpec {
  u: number;
  bw: number;
}

function getBalconySpecs(f: Face): BalconySpec[] {
  const isFrontBack = f.half === TW / 2;
  const bw = isFrontBack ? 5.8 : 4.8;
  const uA = (-f.half + PIER_W - CTR_W / 2) / 2;
  const uB = (CTR_W / 2 + f.half - PIER_W) / 2;
  return [
    { u: uA, bw },
    { u: uB, bw },
  ];
}

/* ---------------- Roof structure (all heights absolute) ---------------- */

/** Slab edge: 0.15 beyond the glazing line; fascia flush with the pier faces. */
const SLAB_X = TW / 2 + 0.15; // 12.15
const SLAB_Z0 = -TD / 2 - 0.15; // -10.15
const SLAB_Z1 = Z1 + 0.15; // 23.65
const FASCIA_X = TW / 2 + PIER_OUT; // 12.65 — flush with pier outer faces
const FASCIA_Z0 = -TD / 2 - PIER_OUT; // -10.65
const FASCIA_Z1 = SLAB_Z1 + 0.5; // 24.15
/** Fascia has exactly the height of a spandrel band, so the top floor matches every other floor. */
const FASCIA_Y0 = TOWER_BASE + TOWER_H - 0.1;
const FASCIA_Y1 = FASCIA_Y0 + BAND_H;
const UPSTAND_T = 0.3;
const UPSTAND_H = 0.62;
const RAIL_TOP = DECK_Y + 1.1;

/** A box from (x0,z0)-(x1,z1) with the pool rectangle removed. 4 pieces, no overlap. */
function slabAround(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G[] {
  const h = POOL;
  return [
    bx(x0, x1, y0, y1, z0, h.z0),
    bx(x0, x1, y0, y1, h.z1, z1),
    bx(x0, h.x0, y0, y1, h.z0, h.z1),
    bx(h.x1, x1, y0, y1, h.z0, h.z1),
  ];
}

/** Glass guardrail on the roof edge: sits on the upstand, and straight on the slab at the open front. */
function buildRoofRail(): { glass: G; cap: G } {
  const h = 0.0225; // half glass thickness
  const c = 0.04; // half cap width
  const xc = SLAB_X - UPSTAND_T / 2; // 12.0 — centre of the side upstands
  const zBack = SLAB_Z0 + UPSTAND_T / 2; // -10.0
  const zFront = Z1; // 23.5 — on the slab's front strip
  const upTop = ROOF_Y + UPSTAND_H;
  const capY1 = RAIL_TOP + 0.05;
  return {
    glass: merge([
      bx(-xc - h, xc + h, upTop, RAIL_TOP, zBack - h, zBack + h),
      bx(-xc - h, -xc + h, upTop, RAIL_TOP, zBack + h, zFront - h),
      bx(xc - h, xc + h, upTop, RAIL_TOP, zBack + h, zFront - h),
      bx(-xc - h, xc + h, ROOF_Y, RAIL_TOP, zFront - h, zFront + h),
    ]),
    cap: merge([
      bx(-xc - c, xc + c, RAIL_TOP, capY1, zBack - c, zBack + c),
      bx(-xc - c, -xc + c, RAIL_TOP, capY1, zBack + c, zFront - c),
      bx(xc - c, xc + c, RAIL_TOP, capY1, zBack + c, zFront - c),
      bx(-xc - c, xc + c, RAIL_TOP, capY1, zFront - c, zFront + c),
    ]),
  };
}

/* ------------------------------------------------------------------ */
/*  Podium dimensions                                                  */
/* ------------------------------------------------------------------ */

const { w: PW, d: PD, h: PH } = PODIUM;
const LOBBY_X = 11.0; // half width of the glazed entrance lobby
const LOBBY_Z0 = 12.8; // back wall of the lobby void
const JAMB = 0.6; // concrete jamb either side of the lobby
const CORE_X = PW / 2 - 0.6; // 16.4
const CORE_Z = PD / 2 - 0.6; // 14.4
/** Ground band, first-floor sill band and roof band extents. */
const PLINTH_OUT = 0.6;

/* ------------------------------------------------------------------ */
/*  White concrete frame                                               */
/* ------------------------------------------------------------------ */

function buildWhiteFrame(): G {
  const p = new ToneBag();

  /* ----- Tower piers: corners are CLOSED. -----
   * Piers stop at the roof fascia underside (FASCIA_Y0) instead of running
   * 0.1 m into it — that shared x/z face at y 34.4–34.5 z-fought on orbit. */
  const pierH = TOWER_H - 0.1;
  const yC = TOWER_BASE + pierH / 2;
  TOWER_FACES.forEach((f, fi) => {
    const frontBack = fi < 2;
    for (const s of [-1, 1]) {
      const uIn = s * (f.half - PIER_W);
      const uOut = frontBack ? s * (f.half + PIER_OUT) : s * (f.half + PIER_IN);
      const lo = Math.min(uIn, uOut);
      const hi = Math.max(uIn, uOut);
      p.tone(TONE.mid);
      p.push(faceBox(f, (lo + hi) / 2, yC, PIER_IN, hi - lo, pierH, PIER_D));
    }
    p.tone(TONE.graphite);
    if (fi === 0) {
      // Front face: the centre pier begins at the TOP of the first-floor band,
      // level with where the fins read, so the terrace storey below stays clear
      // for the exit door structure and the pier sits ON the band.
      const top = TOWER_BASE + pierH;
      p.push(faceBox(f, 0, (FRONT_PIER_BASE_Y + top) / 2, PIER_IN, CTR_W, top - FRONT_PIER_BASE_Y, PIER_D));
    } else {
      p.push(faceBox(f, 0, yC, PIER_IN, CTR_W, pierH, PIER_D));
    }
  });

  /* ----- Spandrel bands: one per floor line (the roof fascia is the last one). ----- */
  TOWER_FACES.forEach((f) => {
    for (let fl = 1; fl < TOWER.floors; fl++) {
      const y = TOWER_BASE + fl * TOWER.fh;
      const spanW = f.half * 2 - PIER_W * 2;
      p.tone(fl % 2 ? TONE.ivory : TONE.pale);
      p.push(faceBox(f, 0, y + BAND_H / 2 - 0.1, PIER_IN + 0.05, spanW, BAND_H, BAND_OUT - PIER_IN - 0.05));
    }
  });

  /* ----- Tower base plinth: 0.1 m beyond the pier faces. -----
   * Notched across the front lobby bay (the terrace exit + its sidelights), so
   * the door and the floor-height glazing stand on the deck. The notch stops at
   * the inner window plane; the two cut ends are closed by the pieces below. */
  const notch = LOBBY_NOTCH_HALF;
  p.tone(TONE.mid);
  p.push(bx(-TW / 2 - 0.75, TW / 2 + 0.75, TOWER_BASE, TOWER_BASE + 0.7, -TD / 2 - 0.75, TD / 2 - 0.3));
  p.push(bx(-TW / 2 - 0.75, -notch, TOWER_BASE, TOWER_BASE + 0.7, TD / 2 - 0.3, TD / 2 + 0.75));
  p.push(bx(notch, TW / 2 + 0.75, TOWER_BASE, TOWER_BASE + 0.7, TD / 2 - 0.3, TD / 2 + 0.75));

  /* ----- Roof: fascia (flush with piers) → slab (inset 0.5) → upstand. ----- */
  p.tone(TONE.graphite);
  p.push(...slabAround(-FASCIA_X, FASCIA_X, FASCIA_Y0, FASCIA_Y1, FASCIA_Z0, FASCIA_Z1));
  p.tone(TONE.mid);
  p.push(...slabAround(-SLAB_X, SLAB_X, FASCIA_Y1, ROOF_Y, SLAB_Z0, SLAB_Z1));
  const upY1 = ROOF_Y + UPSTAND_H;
  p.tone(TONE.ivory);
  p.push(bx(-SLAB_X, SLAB_X, ROOF_Y, upY1, SLAB_Z0, SLAB_Z0 + UPSTAND_T));
  p.push(bx(-SLAB_X, -SLAB_X + UPSTAND_T, ROOF_Y, upY1, SLAB_Z0 + UPSTAND_T, SLAB_Z1));
  p.push(bx(SLAB_X - UPSTAND_T, SLAB_X, ROOF_Y, upY1, SLAB_Z0 + UPSTAND_T, SLAB_Z1));

  /* ----- Podium ----- */
  const POD_OUT = 0.2;
  const POD_X = PW / 2 + POD_OUT; // 17.2
  const POD_Z = PD / 2 + POD_OUT; // 15.2
  const PIER_IN_X = PW / 2 - 1.6; // 15.4
  const PIER_IN_Z = PD / 2 - 1.6; // 13.4

  p.tone(TONE.graphite);
  // The exterior plinth is a continuous four-sided perimeter band running
  // unbroken around all elevations, wrapping each corner pier smoothly without
  // gaps. Across the central entrance opening (-LOBBY_X to LOBBY_X), the front
  // is left open for the step-free stone landing.
  p.push(bx(-PW / 2 - PLINTH_OUT, PW / 2 + PLINTH_OUT, 0, 0.5,
    -PD / 2 - PLINTH_OUT, -CORE_Z));
  p.push(bx(-PW / 2 - PLINTH_OUT, -CORE_X, 0, 0.5, -CORE_Z, PD / 2 + PLINTH_OUT));
  p.push(bx(CORE_X, PW / 2 + PLINTH_OUT, 0, 0.5, -CORE_Z, PD / 2 + PLINTH_OUT));
  p.push(bx(-PW / 2 - PLINTH_OUT, -LOBBY_X, 0, 0.5, CORE_Z, PD / 2 + PLINTH_OUT));
  p.push(bx(LOBBY_X, PW / 2 + PLINTH_OUT, 0, 0.5, CORE_Z, PD / 2 + PLINTH_OUT));

  p.tone(TONE.ivory);
  // First-floor slab edge — ENTRANCE FRONT ONLY.
  //
  // The rear and both sides are now full-height LED walls, and this band's old
  // rear/west/east strips sat at exactly the display planes (x ±16.95,
  // z ∓14.95), so each one cut a solid bar straight across the middle of a
  // screen. Those three strips are removed; only the front keeps its fascia,
  // which is where the band belongs on this elevation.
  p.push(bx(-POD_X, POD_X, 4.15, 4.95, FACE_Z + 0.08, POD_Z));      // front fascia

  // Entrance spandrel band behind the bronze grill. It is dark so the grill
  // reads against shadow, not a white wall showing between the slats.
  //
  // Its back edge stops 0.07 m short of the portal piers (which start at
  // z 15.05), so the band hovered just behind the two front columns and read
  // as a disconnected floating panel. Running it to z 15.06 overlaps the pier
  // backs by 1 cm, so the band and both columns are one solid mass.
  p.tone(TONE.graphite);
  p.push(bx(-PIER_IN_X, PIER_IN_X, 4.95, 6.6, PD / 2 - 0.20, FACE_Z + 0.06));

  // Sill beam: front as built; omitted on the rear and the LED elevations.
  p.tone(TONE.mid);
  p.push(bx(-PIER_IN_X, PIER_IN_X, 6.6, 6.95, FACE_Z + 0.08, POD_Z));

  p.tone(TONE.ivory);
  // Keep the outside parapet profile, but leave only a shallow front fascia
  // outside the glass. Its old 0.68 m depth was still visible as a beam from
  // inside the hall below the roof, even after removing the middle slab.
  p.push(bx(-POD_X, POD_X, PH - 1.1, PH, FACE_Z + 0.08, POD_Z));
  p.push(bx(-POD_X, POD_X, PH - 1.1, PH, -POD_Z, -POD_Z + 1.1));
  p.push(bx(-POD_X, -POD_X + 1.1, PH - 1.1, PH, -POD_Z + 1.1, FACE_Z + 0.08));
  p.push(bx(POD_X - 1.1, POD_X, PH - 1.1, PH, -POD_Z + 1.1, FACE_Z + 0.08));

  // Corner piers stop under the roof band (8.2). The band then carries the
  // outer face the whole way up, so pier and band faces never share a plane.
  // White, not graphite: the four podium corner pillars read as clean white
  // architecture on every elevation.
  const pierTop = PH - 1.1;
  p.tone(TONE.ivory);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const xa = sx > 0 ? [PIER_IN_X, POD_X] : [-POD_X, -PIER_IN_X];
      const za = sz > 0 ? [PD / 2 - 0.75, POD_Z] : [-POD_Z, -PD / 2 + 0.75];
      p.push(bx(xa[0], xa[1], 0, pierTop, za[0], za[1]));
      const xb = sx > 0 ? [PW / 2 - 0.75, POD_X] : [-POD_X, -PW / 2 + 0.75];
      const zb = sz > 0 ? [PIER_IN_Z, PD / 2 - 0.75] : [-PD / 2 + 0.75, -PIER_IN_Z];
      p.push(bx(xb[0], xb[1], 0, pierTop, zb[0], zb[1]));
    }
  }

  // Lobby jambs stay warm ivory with the rest of the entrance stonework.
  p.tone(TONE.ivory);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? LOBBY_X : -LOBBY_X - JAMB;
    p.push(bx(x0, x0 + JAMB, 0.5, 4.15, PD / 2 - 0.75, PD / 2 + 0.15));
  }

  p.tone(TONE.mid);
  p.push(...ring(PW + 0.5, PD + 0.5, 0.25, 0.4, 0, PH + 0.2, 0));
  return merge(p.items);
}

/* ------------------------------------------------------------------ */
/*  Podium envelope                                                    */
/*                                                                     */
/*  The front keeps its canopy, ASTARA signage and bronze fins. Its      */
/*  glazing now opens into an empty hall. The rear and both              */
/*  sides are white frames around full-height integrated LED displays.  */
/*  Every piece below is pale, and every edge is embedded 0.02 m into   */
/*  the neighbour that already exists there (plinth, slab band, corner  */
/*  piers, dark core), so no two faces share a plane and nothing        */
/*  z-fights on orbit.                                                  */
/* ------------------------------------------------------------------ */

/** Rear podium face — a display elevation like the two sides. */
const REAR_FACE: Face = { ry: Math.PI, half: PW / 2, off: PD / 2 };
/** Left (west) and right (east) podium faces. */
const SIDE_FACES: Face[] = [
  { ry: Math.PI / 2, half: PD / 2, off: PW / 2 },
  { ry: -Math.PI / 2, half: PD / 2, off: PW / 2 },
];
/** All three non-entrance elevations carry the LED displays. */
const DISPLAY_FACES: Face[] = [REAR_FACE, SIDE_FACES[0], SIDE_FACES[1]];
/**
 * Podium side and rear elevations run the whole height in one piece: from
 * 0.02 m inside the plinth to 0.02 m inside the parapet ring. The floor slab,
 * spandrel and sill beam that divide the front elevation are omitted here, so
 * no middle beam ever crosses the LED walls or the rear face.
 */
const LED_WALL_Y0 = 0.48;
const LED_WALL_Y1 = 8.22;

/** Active display area of a face, derived from the wall itself. */
export interface LedPanelDims {
  halfWidth: number;
  y0: number;
  y1: number;
  width: number;
  height: number;
  centreY: number;
}
export function ledPanelDims(f: Face): LedPanelDims {
  const halfWidth = (f.half - 1.6) - LED_WALL.frame;
  const y0 = LED_WALL_Y0 + LED_WALL.frameBottom;
  const y1 = LED_WALL_Y1 - LED_WALL.frame;
  return { halfWidth, y0, y1, width: halfWidth * 2, height: y1 - y0, centreY: (y0 + y1) / 2 };
}
/** East side panel — used for the spill light positions. */
export const LED_PANEL = ledPanelDims(SIDE_FACES[0]);

/**
 * White surrounds for the three LED walls (rear + both sides).
 *
 * Each elevation is built as a thin picture frame rather than a solid field,
 * so the display sits in a real recess inside the existing wall boundary
 * instead of being applied on top of it. Frame faces are flush with the
 * podium wall plane and share its depth, so there is no floating panel and no
 * new corner gap. Everything here is pale: the screen is the only dark
 * surface on the elevation.
 */
function buildPodiumLedFrames(): G {
  const p = new ToneBag();
  for (const f of DISPLAY_FACES) {
    p.tone(TONE.pale);
    const usable = f.half - 1.6;
    const outer = usable + 0.02;
    const { halfWidth, y0, y1 } = ledPanelDims(f);
    // Plinth rail and head rail run the full width so the corners close. They
    // are the only horizontal members on this face: no slab edge, spandrel or
    // sill beam crosses the display between them.
    p.push(faceBox(f, 0, (LED_WALL_Y0 + y0) / 2, -0.62, outer * 2, y0 - LED_WALL_Y0, 0.62));
    p.push(faceBox(f, 0, (y1 + LED_WALL_Y1) / 2, -0.62, outer * 2, LED_WALL_Y1 - y1, 0.62));
    // Jambs fill only the gap left between the screen and the corner piers.
    const jamb = outer - halfWidth;
    for (const side of [-1, 1]) {
      p.push(faceBox(f, side * (halfWidth + jamb / 2), (y0 + y1) / 2, -0.62, jamb, y1 - y0, 0.62));
    }
    // Recessed backing behind the screen, so a grazing view never sees through.
    p.tone(TONE.graphite);
    p.push(faceBox(f, 0, (y0 + y1) / 2, -0.62, halfWidth * 2, y1 - y0, 0.62 - LED_WALL.recess));
  }
  return merge(p.items);
}

/**
 * World-space placement of each display panel. The geometry only holds
 * positions; these planes describe the same surfaces as a centre plus a right
 * and up axis, which is what lets the YouTube overlay be projected exactly
 * onto a wall from the live camera.
 */
function buildLedPanelPlanes(): LedPanelPlane[] {
  return DISPLAY_FACES.map((f) => {
    const d = ledPanelDims(f);
    return {
      center: new THREE.Vector3(...fp(f, 0, d.centreY, -LED_WALL.inset)),
      // d/du of fp() — the panel's local +x, i.e. increasing UV.u.
      right: new THREE.Vector3(Math.cos(f.ry), 0, -Math.sin(f.ry)).multiplyScalar(d.width),
      up: new THREE.Vector3(0, d.height, 0),
      normal: new THREE.Vector3(Math.sin(f.ry), 0, Math.cos(f.ry)),
      ry: f.ry,
      width: d.width,
      height: d.height,
    };
  });
}

/**
 * The three display quads, merged into one geometry: six triangles, one draw
 * call, one shared material. Each quad keeps its own 0..1 UV (so any video or
 * canvas source maps across the whole panel) and carries its own simulated
 * pixel grid + aspect as per-vertex constants, so the wider rear panel keeps
 * the same 28 mm pixel pitch as the sides.
 */
function buildLedWallGeometry(): G {
  return merge(DISPLAY_FACES.map((f) => {
    const d = ledPanelDims(f);
    const quad = new THREE.PlaneGeometry(d.width, d.height);
    const n = quad.attributes.position.count;
    const grid = new Float32Array(n * 2);
    const aspect = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      grid[i * 2] = d.width / LED_WALL.pitch;
      grid[i * 2 + 1] = d.height / LED_WALL.pitch;
      aspect[i] = d.width / d.height;
    }
    quad.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
    quad.setAttribute('aPanelAspect', new THREE.BufferAttribute(aspect, 1));
    quad.rotateY(f.ry);
    const [x, y, z] = fp(f, 0, d.centreY, -LED_WALL.inset);
    quad.translate(x, y, z);
    return quad;
  }));
}

/* ------------------------------------------------------------------ */
/*  Cores, balconies, details                                          */
/* ------------------------------------------------------------------ */

interface FacadeDetails {
  dark: G;
  /** Plain flat white interior shell, visible through the entrance glazing. */
  lobbyInterior: G;
  white: G;
  wood: G;
  balconyGlass: G;
  bronze: G;
  led: G;
  soffitLed: G;
  /** Balcony planting — instanced from the shared plant library. */
  plants: PottedPlantSpec[];
  /** Small planter boxes on a few balconies. */
  troughs: TroughSpec[];
}

function buildFacadeDetails(): FacadeDetails {
  const dark: G[] = [];
  const lobbyInterior: G[] = [];
  const white: G[] = [];
  const wood: G[] = [];
  const balconyGlass: G[] = [];
  const bronze: G[] = [];
  const led: G[] = [];
  const soffitLed: G[] = [];
  const plants: PottedPlantSpec[] = [];
  const troughs: TroughSpec[] = [];

  /* ----- Opaque cores: the building is solid behind the faked interiors. ----- */
  dark.push(bx(-TW / 2 + 0.6, TW / 2 - 0.6, TOWER_BASE, TOWER_BASE + TOWER_H, -TD / 2 + 0.6, TD / 2 - 0.6));

  // The ENTIRE podium ground + first floor is one big empty hall, two storeys
  // tall, that the entrance doors open straight into. It is a plain white shell
  // — a back wall, two side walls and a roof slab — with no interior structure,
  // beams, ledges or partitions of any kind. The front face is entirely the
  // glazed facade, so the ground glazing and the upper windows above the beam
  // both look into this same tall space: the window openings simply follow the
  // hall rather than the hall being carved out to fit them.
  //
  // The shell is deliberately thin rather than solid, which is what makes the
  // hall as large as the building footprint. Nothing else occupies this volume.
  const HALL_T = 0.4;      // shell wall thickness
  const WALL_TOP = 8.95;   // walls stop where the roof slab begins
  // Back wall — the full width of the podium, right at the core face.
  lobbyInterior.push(bx(-CORE_X, CORE_X, 0, WALL_TOP, -CORE_Z, -CORE_Z + HALL_T));
  // Side walls — full depth, so the hall runs wall to wall.
  lobbyInterior.push(bx(-CORE_X, -CORE_X + HALL_T, 0, WALL_TOP, -CORE_Z, CORE_Z));
  lobbyInterior.push(bx(CORE_X - HALL_T, CORE_X, 0, WALL_TOP, -CORE_Z, CORE_Z));
  // Plain white floor at exactly the entrance landing level. The site landing
  // takes over at z=12.8; there is no raised step or graphite plinth inside.
  lobbyInterior.push(bx(-CORE_X + HALL_T, CORE_X - HALL_T, 0.12, 0.22,
    -CORE_Z + HALL_T, LOBBY_Z0));
  // The entrance paving covers the centre. Extend the same flat white floor
  // behind the two outer glazed bays, not beneath the already-paved doorway.
  lobbyInterior.push(bx(-CORE_X + HALL_T, -LOBBY_X, 0.12, 0.22,
    LOBBY_Z0, FACE_Z - 0.28));
  lobbyInterior.push(bx(LOBBY_X, CORE_X - HALL_T, 0.12, 0.22,
    LOBBY_Z0, FACE_Z - 0.28));
  // Flat white inner face of the opaque exterior grill band and sill. The
  // graphite belongs outdoors behind the bronze fins, never inside the hall.
  lobbyInterior.push(bx(-(PW / 2 - 1.6), PW / 2 - 1.6, 4.15, 6.95,
    14.76, 14.79));
  // Roof slab — carries the terrace deck above and closes the hall's ceiling.
  // It starts above the head of the upper windows, so no slab edge is ever
  // visible through the glazing.
  lobbyInterior.push(bx(-CORE_X, CORE_X, WALL_TOP, PH, -CORE_Z + HALL_T, CORE_Z));

  const DEP = 1.75;
  const yLedA = TOWER_BASE + 0.7;
  const yLedB = TOWER_BASE + TOWER_H - 0.6;

  TOWER_FACES.forEach((f, fi) => {
    // White LED strips set into the pier faces, near each pier's inner edge.
    for (const u of [-f.half + PIER_W - 0.1, f.half - PIER_W + 0.1, -(CTR_W / 2 - 0.1), CTR_W / 2 - 0.1]) {
      // The front centre pier now starts at the first floor line; its strips follow it.
      const onFrontCentre = fi === 0 && Math.abs(u) < CTR_W / 2;
      const y0 = onFrontCentre ? FRONT_PIER_BASE_Y + 0.06 : yLedA;
      led.push(faceBox(f, u, (y0 + yLedB) / 2, PIER_OUT - 0.03, 0.08, yLedB - y0, 0.05));
    }

    const bSpecs = getBalconySpecs(f);

    for (let fl = 1; fl < TOWER.floors; fl++) {
      const y = TOWER_BASE + fl * TOWER.fh;
      // Balcony slab is the floor-edge beam continued outward: its top is flush with the band top.
      const yb = y + BAND_H - 0.1 - 0.14;

      bSpecs.forEach((spec, bi) => {
        const { u, bw } = spec;
        const uL = u - bw / 2 + 0.05;
        const uR = u + bw / 2 - 0.05;
        const proj = DEP - BAND_OUT;

        // 1. Slab — starts at the band face, so it is supported by the building.
        white.push(faceBox(f, u, yb, BAND_OUT, bw, 0.28, proj));

        // 2. Wood deck insert
        wood.push(faceBox(f, u, yb + 0.15, BAND_OUT + 0.04, bw - 0.14, 0.025, proj - 0.08));

        // 3. Frameless glass on 3 sides, standing on the slab
        const gH = 1.02;
        const gY = yb + 0.65;
        balconyGlass.push(faceBox(f, u, gY, DEP - 0.07, bw - 0.1, gH, 0.03));
        balconyGlass.push(faceBox(f, uL, gY, BAND_OUT, 0.04, gH, DEP - 0.07 - BAND_OUT));
        balconyGlass.push(faceBox(f, uR, gY, BAND_OUT, 0.04, gH, DEP - 0.07 - BAND_OUT));

        // 4. Slim handrail cap (returns end where the front rail begins — no overlap)
        const rY = yb + 1.17;
        bronze.push(faceBox(f, u, rY, DEP - 0.09, bw, 0.05, 0.09));
        bronze.push(faceBox(f, uL, rY, BAND_OUT, 0.09, 0.05, DEP - 0.09 - BAND_OUT));
        bronze.push(faceBox(f, uR, rY, BAND_OUT, 0.09, 0.05, DEP - 0.09 - BAND_OUT));

        // 5. Warm soffit light, flush under the slab
        soffitLed.push(faceBox(f, u, yb - 0.155, BAND_OUT + 0.4, bw - 0.8, 0.03, 0.22));

        /* 6. Balcony planting — deliberately IRREGULAR so the facade never reads
         * as a repeated pattern. Deterministic per balcony (same result every
         * load) but no two neighbouring balconies match. A quarter are left
         * completely bare, which is what makes the planted ones read as curated
         * rather than mass-produced. No creepers or hanging vines.
         *
         *   0–23   bare
         *   24–57  one foliage plant (fern / palm / shrub / upright)
         *   58–71  two small plants in opposite corners
         *   72–80  one flowering accent
         *   81–87  one topiary
         *   88–93  small flowering planter box
         *   94–99  one larger statement plant
         */
        const key = (fl * 7 + bi * 13 + fi * 29) % 100;
        const potSide = (fl + bi) % 2 === 0 ? 1 : -1;
        const cornerU = u + potSide * (bw / 2 - 0.75);
        const farU = u - potSide * (bw / 2 - 0.75);
        const [cx, cy, cz] = fp(f, cornerU, yb + 0.155, DEP - 0.75);
        const [fx2, fy2, fz2] = fp(f, farU, yb + 0.155, DEP - 0.75);
        // Deterministic variation seed, always positive.
        const k = 3 + ((fl * 5 + bi * 11 + fi * 17) % 997);

        const addPlant = (x: number, y: number, z: number, v: number, s: number, flower?: number) => {
          plants.push({
            p: [x, y, z],
            ry: (k % 12) * (Math.PI / 6),
            s,
            v,
            pot: (k * 5 + 2) % 3,
            tone: (k * 5) % POT_TONES.length,
            leaf: (k * 3 + 2) % LEAF_TONES.length,
            ...(flower !== undefined ? { flower } : {}),
          });
        };

        if (key < 24) {
          // bare balcony — no planting at all
        } else if (key < 58) {
          addPlant(cx, cy, cz, [0, 1, 2, 3][(k * 3) % 4], 0.95 + ((k * 7) % 5) * 0.06);
        } else if (key < 72) {
          addPlant(cx, cy, cz, [0, 1, 2, 3][(k * 3) % 4], 0.84 + ((k * 7) % 4) * 0.06);
          addPlant(fx2, fy2, fz2, [0, 2, 3][(k * 5) % 3], 0.72 + ((k * 3) % 3) * 0.06);
        } else if (key < 81) {
          addPlant(cx, cy, cz, 4, 0.95 + ((k * 7) % 3) * 0.06, (k * 3) % FLOWER_TONES.length);
        } else if (key < 88) {
          addPlant(cx, cy, cz, 5, 1.0 + ((k * 7) % 3) * 0.06);
        } else if (key < 94) {
          // Small flowering planter box against the back wall. Its plants come
          // from balconyTroughPlanting, so nothing is added here.
          const [bx0, by0, bz0] = fp(f, u, yb + 0.02, DEP - 0.78);
          troughs.push({ x: bx0, y: by0, z: bz0, len: 1.5, ry: f.ry, tone: k % 3 });
        } else {
          addPlant(cx, cy, cz, [1, 3][(k * 3) % 2], 1.12 + ((k * 7) % 3) * 0.07);
        }
      });
    }
  });

  return {
    dark: merge(dark),
    lobbyInterior: merge(lobbyInterior),
    white: merge(white),
    wood: merge(wood),
    balconyGlass: merge(balconyGlass),
    bronze: merge(bronze),
    led: merge(led),
    soffitLed: merge(soffitLed),
    plants,
    troughs,
  };
}

/* ------------------------------------------------------------------ */
/*  Wood slat accent panels                                            */
/* ------------------------------------------------------------------ */

function buildWoodSlats(): G {
  const p: G[] = [];
  // Run from inside the first band to inside the roof fascia so no slat end hangs in mid-air.
  const y0 = TOWER_BASE + 0.9;
  const y1 = FASCIA_Y0 + 0.2;
  const exitFinClearance = TERRACE_EXIT.bulkheadHalfWidth + 0.25;
  TOWER_FACES.forEach((f, faceIndex) => {
    for (const dir of [-1, 1]) {
      const u0 = dir * (CTR_W / 2 + 0.12);
      for (let i = 0; i < 5; i++) {
        const u = u0 + dir * i * 0.17;
        // On the front tower face the fins beside the exit lobby start at the
        // first-floor band top, like the centre pier, so the storey below is
        // clear and all three elements share one baseline.
        if (faceIndex === 0 && Math.abs(u) - 0.055 < exitFinClearance) {
          p.push(faceBox(f, u, (FRONT_PIER_BASE_Y + y1) / 2, 0.05, 0.11, y1 - FRONT_PIER_BASE_Y, 0.24));
        } else {
          p.push(faceBox(f, u, (y0 + y1) / 2, 0.05, 0.11, y1 - y0, 0.24));
        }
      }
    }
  });

  // Podium architectural slat fins: one continuous bronze grill across the whole
  // black spandrel strip below the ASTARA beam, pier to pier. Spacing stays on
  // the original 0.34 module so every slat aligns with the existing rhythm.
  // The continuous front run is behind the portal piers, so the columns remain
  // exactly as built while the visible spans read as one uninterrupted grill.
  // Under the lintel the slats stop 0.02 below it instead of embedding into it.
  const z = PD / 2 + 0.06;
  const fy0 = 4.95;
  const fy1 = 6.6;
  const frontEnd = PW / 2 - 1.7;
  // Uniform height: the old per-slat step at x = ±9.8 left a small lip
  // projecting past the arch on the left and right.
  for (let u = -frontEnd; u <= frontEnd + 0.01; u += 0.34) {
    p.push(box(0.12, fy1 - fy0, 0.2, u, (fy0 + fy1) / 2, z));
  }
  return merge(p);
}

/**
 * The first two podium stories stay glazed on the entrance front, but they are
 * deliberately empty: no apartment parallax rooms are generated there. The
 * same pane positions are reused as plain shared glass, preserving the tall
 * lobby's upper windows without adding another shader or draw family.
 */
function buildPlainPaneGeometry(panes: Pane[]): G {
  return merge(panes.map((pane) => {
    const geometry = new THREE.PlaneGeometry(pane.w, pane.h);
    geometry.rotateY(pane.ry);
    geometry.translate(pane.x, pane.y, pane.z);
    return geometry;
  }));
}

/* ------------------------------------------------------------------ */
/*  Window panes (parallax interiors)                                  */
/* ------------------------------------------------------------------ */

function buildPanes(): Pane[] {
  const panes: Pane[] = [];
  const defaults = { seed: 0, type: 0, bright: 0, variant: 0, pal: 0 };

  // Tower
  TOWER_FACES.forEach((f) => {
    const bs = bays(f);
    for (let fl = 0; fl < TOWER.floors; fl++) {
      const y = TOWER_BASE + fl * TOWER.fh;
      const yc = y + BAND_H + SILL + WIN_H / 2 - 0.25;
      for (const b of bs) {
        let u = b.u;
        let w = b.w - 0.12;
        let h = WIN_H;
        let paneY = yc;

        // Floor-height sidelights at the podium terrace exit create a genuine
        // lobby opening. They stop clear of the double-door bulkhead and retain
        // the original outer edge of each first-floor front window.
        if (fl === 0 && f.ry === 0 && Math.abs(b.u) < 3) {
          const side = Math.sign(b.u);
          // Sidelights butt straight up to the door's dark jambs.
          const insideEdge = TERRACE_EXIT.doorHalfWidth + 0.09 + TERRACE_EXIT.facadeWindowGap;
          // Outer edge is the original bay edge, so the glazing meets the next
          // window bay exactly as every other floor does — no gap left over.
          const outsideEdge = LOBBY_GLAZING_HALF;
          w = Math.max(0.2, outsideEdge - insideEdge);
          u = side * (insideEdge + w / 2);
          const bottom = TOWER_BASE + TERRACE_EXIT.doorBottom + 0.035;
          const top = TOWER_BASE + TOWER.fh - 0.08;
          h = top - bottom;
          paneY = (top + bottom) / 2;
        }

        const [x, yy, z] = fp(f, u, paneY, -0.3);
        const dayBrightPair = fl === 0 && f.ry === 0 && Math.abs(b.u) >= 3 && Math.abs(b.u) < 7;
        panes.push({ ...defaults, x, y: yy, z, w, h, ry: f.ry, row: `tower-${fl}`, variant: dayBrightPair ? 8 : 0 });
      }
    }
  });

  // Front podium glazing into the empty double-height hall.
  const pFaces: Face[] = [
    { ry: 0, half: PW / 2, off: PD / 2 },
    { ry: Math.PI, half: PW / 2, off: PD / 2 },
    { ry: Math.PI / 2, half: PD / 2, off: PW / 2 },
    { ry: -Math.PI / 2, half: PD / 2, off: PW / 2 },
  ];
  pFaces.forEach((f, fi) => {
    const usable = f.half - 1.6;

    // The rear and side podium walls carry LED displays and emit no panes or
    // interior units. Only the entrance front remains glazed.
    const ground: { u: number; w: number }[] = [];
    if (fi === 0) {
      const a = LOBBY_X + JAMB - 0.02;
      const end = usable + 0.02;
      for (const s of [-1, 1]) ground.push({ u: (s * (a + end)) / 2, w: end - a });
    }
    for (const b of ground) {
      // Finish at the underside of the exterior fascia rather than placing
      // glass inside its volume (the previous top 0.35 m was visibly cut off).
      const bottom = 0.5;
      const top = 4.15;
      const [x, y, z] = fp(f, b.u, (bottom + top) / 2, -0.28);
      panes.push({ ...defaults, x, y, z, w: b.w - 0.02,
        h: top - bottom, ry: f.ry, row: 'podium-ground' });
    }

    // These are upper windows into the same double-height hall, not a second
    // floor of parallax rooms. No glazing extends behind the parapet fascia.
    if (fi !== 0) return;
    const n = Math.max(3, Math.round((usable * 2) / 3.4));
    const w = (usable * 2) / n;
    for (let i = 0; i < n; i++) {
      const bottom = 6.95;
      const top = PH - 1.1;
      const [x, y, z] = fp(f, -usable + w * (i + 0.5), (bottom + top) / 2, -0.28);
      panes.push({ ...defaults, x, y, z, w: w - 0.02,
        h: top - bottom, ry: f.ry, row: 'podium-upper' });
    }
  });

  // Turn the flat panel list into architectural interior units. This is what
  // stops the facade reading as one tiny room per window.
  assignInteriorUnits(panes.filter((pane) => pane.row?.startsWith('tower-')), 20260);
  return panes;
}

/* ------------------------------------------------------------------ */

/**
 * Planting for a balcony planter box: a tidy three-plant flowering bed seated
 * in the box soil, rotated with the box so the row follows the facade face.
 * The box body itself is placed by buildFacadeDetails.
 */
const balconyTroughPlanting = (t: TroughSpec): PottedPlantSpec[] =>
  troughFlowerRow(t, 901 + Math.round(t.x * 7 + t.z * 13), { tones: [0, 1], scale: [0.7, 0.82] });

export function MainBuilding({ night }: { night: boolean }) {
  const white = useMemo(buildWhiteFrame, []);
  const ledFrames = useMemo(buildPodiumLedFrames, []);
  const ledGeometry = useMemo(buildLedWallGeometry, []);
  const ledPanels = useMemo(buildLedPanelPlanes, []);
  const facade = useMemo(buildFacadeDetails, []);
  const roofRail = useMemo(buildRoofRail, []);
  const slats = useMemo(buildWoodSlats, []);
  const paneData = useMemo(buildPanes, []);
  const paneGeo = useMemo(
    () => buildPaneGeometry(paneData.filter((pane) => pane.row?.startsWith('tower-'))),
    [paneData],
  );
  const podiumEmptyGlass = useMemo(
    () => buildPlainPaneGeometry(paneData.filter((pane) =>
      pane.ry === 0 && (pane.row === 'podium-ground' || pane.row === 'podium-upper'))),
    [paneData],
  );

  return (
    <>
      <group name="MainBuilding">
        <mesh name="Frame_White_Concrete" geometry={white} material={MAT.architecture} castShadow receiveShadow />
        <mesh name="Facade_Core_Dark" geometry={facade.dark} material={MAT.darkMetal} castShadow receiveShadow />
        {/* Plain flat white shell behind the entrance glazing — a simple, empty
            interior with no beam or structural detail, seen through the glass. */}
        <mesh name="Lobby_Interior_White" geometry={facade.lobbyInterior} material={MAT.hallWhite} />
        {/* Only the entrance front is glazed. The rear and both sides are white
            frames around full-height integrated LED displays. */}
        <mesh
          name="Podium_LedFrames"
          geometry={ledFrames}
          material={MAT.architecture}
          castShadow
          receiveShadow
          userData={{ surface: 'solid', glazed: false }}
        />
        <LedWallSurface geometry={ledGeometry} panels={ledPanels} />
        {/* Soft spill lights, one per screen, so the pavement picks up the
            display at night. Night-only and staged with the rest of the scheme. */}
        <pointLight
          name="PL_LedWall_West"
          position={[-(PW / 2 + 2.2), LED_PANEL.centreY, 0]}
          color="#8fd3e8"
          intensity={night ? 26 : 0}
          distance={17}
          decay={2}
        />
        <pointLight
          name="PL_LedWall_East"
          position={[PW / 2 + 2.2, LED_PANEL.centreY, 0]}
          color="#8fd3e8"
          intensity={night ? 26 : 0}
          distance={17}
          decay={2}
        />
        <pointLight
          name="PL_LedWall_Rear"
          position={[0, LED_PANEL.centreY, -(PD / 2 + 2.2)]}
          color="#8fd3e8"
          intensity={night ? 26 : 0}
          distance={17}
          decay={2}
        />
        <mesh name="Facade_Slats_Wood" geometry={slats} material={MAT.bronze} castShadow />
        <mesh name="Balcony_Slabs" geometry={facade.white} material={MAT.concrete} castShadow receiveShadow />
        <mesh name="Balcony_Decks" geometry={facade.wood} material={MAT.woodLight} receiveShadow />
        <mesh name="Balcony_Railing_Caps" geometry={facade.bronze} material={MAT.darkMetal} castShadow />
        <PottedPlants name="Balcony_Greenery" items={facade.plants} />
        {facade.troughs.length > 0 && (
          <TroughPlanters
            name="Balcony_PlanterBoxes"
            troughs={facade.troughs}
            planting={balconyTroughPlanting}
          />
        )}
        <mesh name="Balcony_Soffit_Lights" geometry={facade.soffitLed} material={MAT.bulbWarm} />
      </group>
      <group name="FacadeGlass">
        <mesh name="Balcony_Glass" geometry={facade.balconyGlass} material={MAT.glass} renderOrder={10} />
        <mesh name="Rooftop_Glass_Railing" geometry={roofRail.glass} material={MAT.glass} renderOrder={10} />
        <mesh name="Rooftop_Railing_Cap" geometry={roofRail.cap} material={MAT.darkMetal} castShadow />
      </group>
      <group name="FacadeWindows">
        <mesh
          name="Podium_Lobby_Empty_Front_Glass"
          geometry={podiumEmptyGlass}
          material={MAT.lobbyGlass}
          renderOrder={11}
          userData={{ surface: 'empty-lobby-glass', parallax: false }}
        />
        <InteriorWindowMesh name="Windows_ParallaxInteriors" geometry={paneGeo} night={night} />
        {/* Only the main column strips animate; every other LED keeps MAT.ledWhite. */}
        <ColumnLightStrips geometry={facade.led} night={night} />
      </group>
    </>
  );
}
