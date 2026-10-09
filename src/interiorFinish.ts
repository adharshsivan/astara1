/**
 * Wall finishes and curtain states for the shared parallax interiors.
 *
 * A small closed catalogue, not per-room randomness: seven wall styles, three
 * wall treatments, ten curtain fabrics and seven curtain states. Every value is
 * baked into the single shared shader as a linear-sRGB constant, so a room never
 * allocates a material, a texture, a uniform or a light.
 *
 * All decisions belong to the SHARED UNIT (a room spanning one to three window
 * bays), never to an individual pane.
 */

export interface WallFinishSpec {
  id: number;
  name: string;
  hex: string;
  /** How strongly the colour replaces the palette's neutral wall. */
  strength: number;
  group: 'neutral' | 'accent' | 'feature';
}

/** Seven wall styles. Neutrals dominate; accents stay muted and low-chroma. */
export const WALL_FINISHES: readonly WallFinishSpec[] = [
  { id: 0, name: 'Warm off-white', hex: '#f2efe8', strength: 0.62, group: 'neutral' },
  { id: 1, name: 'Soft light gray', hex: '#e6e8e7', strength: 0.66, group: 'neutral' },
  { id: 2, name: 'Pale beige', hex: '#efe9dd', strength: 0.64, group: 'neutral' },
  { id: 3, name: 'Muted sage accent', hex: '#c2cdb8', strength: 0.54, group: 'accent' },
  { id: 4, name: 'Dusty blue accent', hex: '#bcc7d2', strength: 0.54, group: 'accent' },
  { id: 5, name: 'Oak panel feature', hex: '#efece4', strength: 0.3, group: 'feature' },
  { id: 6, name: 'Plaster feature', hex: '#e9e5db', strength: 0.5, group: 'feature' },
] as const;

export const NEUTRAL_WALL_IDS = [0, 1, 2] as const;
export const ACCENT_WALL_IDS = [3, 4] as const;
export const FEATURE_WALL_IDS = [5, 6] as const;

/** Authored wall mix: most rooms stay plain and neutral. */
export const WALL_MIX = { plain: 0.7, variation: 0.2, accent: 0.1 } as const;

/** 0 = flat field, 1 = picture rail with a slightly deeper lower wall, 2 = dado. */
export const WALL_TREATMENTS = ['Plain', 'Picture rail', 'Two-tone dado'] as const;

export interface CurtainFabricSpec {
  id: number;
  name: string;
  hex: string;
  /** How much of the room behind the fabric disappears. */
  opacity: number;
  /** 1 = translucent: the room stays readable but scattered. */
  sheer: number;
  /** Relative fold frequency; gathered drapes pleat tighter than a sheer panel. */
  folds: number;
  /** Rare tones are deliberately uncommon so the facade keeps a soft register. */
  weight: number;
  /** -1 cool, 0 neutral, +1 warm: floors lean one way and favour matching tones. */
  warmth: -1 | 0 | 1;
  /** Only offered to rooms that are already dressed for privacy. */
  privateOnly?: boolean;
}

/**
 * Ten soft, modern fabrics. Chroma is kept low across the board; the darkest
 * tone (charcoal-gray) is reserved for rooms that are already mostly closed.
 */
export const CURTAIN_FABRICS: readonly CurtainFabricSpec[] = [
  { id: 0, name: 'White sheer', hex: '#f5f5f1', opacity: 0.34, sheer: 1, folds: 7, weight: 0.17, warmth: 0 },
  { id: 1, name: 'Cream', hex: '#ece4d5', opacity: 0.97, sheer: 0, folds: 15, weight: 0.15, warmth: 1 },
  { id: 2, name: 'Light gray', hex: '#d9dbdd', opacity: 0.97, sheer: 0, folds: 15, weight: 0.14, warmth: -1 },
  { id: 3, name: 'Warm beige', hex: '#e3d7c3', opacity: 0.97, sheer: 0, folds: 15, weight: 0.11, warmth: 1 },
  { id: 4, name: 'Muted blue-gray', hex: '#c3ccd4', opacity: 0.97, sheer: 0, folds: 15, weight: 0.09, warmth: -1 },
  { id: 5, name: 'Muted olive-gray', hex: '#c5c7b5', opacity: 0.97, sheer: 0, folds: 15, weight: 0.03, warmth: 0 },
  { id: 6, name: 'Soft taupe', hex: '#cfc4b8', opacity: 0.97, sheer: 0, folds: 15, weight: 0.1, warmth: 1 },
  { id: 7, name: 'Muted sage-gray', hex: '#c6cdc0', opacity: 0.97, sheer: 0, folds: 15, weight: 0.07, warmth: 0 },
  { id: 8, name: 'Dusty sand / greige', hex: '#d8cfc0', opacity: 0.97, sheer: 0, folds: 15, weight: 0.09, warmth: 1 },
  { id: 9, name: 'Soft charcoal-gray', hex: '#8f9397', opacity: 0.985, sheer: 0, folds: 15, weight: 0.05, warmth: -1, privateOnly: true },
] as const;

/** Floor-level palette lean: -1 cool, 0 neutral, +1 warm. */
export type Warmth = -1 | 0 | 1;

export interface CurtainStateSpec {
  id: number;
  name: string;
  /** Per-side drape width as a fraction of the unit, 0 = fabric spans everything. */
  opening: [number, number];
  /** Base privacy before the fabric's own opacity is applied. */
  privacy: number;
  open: boolean;
}

export const CURTAIN_STATES: readonly CurtainStateSpec[] = [
  { id: 0, name: 'No curtain', opening: [0, 0], privacy: 0, open: true },
  { id: 1, name: 'Fully open', opening: [0.09, 0.15], privacy: 0.05, open: true },
  { id: 2, name: 'Half open (left)', opening: [0.26, 0.37], privacy: 0.34, open: true },
  { id: 3, name: 'Half open (right)', opening: [0.26, 0.37], privacy: 0.34, open: true },
  { id: 4, name: 'Mostly closed', opening: [0.42, 0.48], privacy: 0.72, open: false },
  { id: 5, name: 'Sheer full height', opening: [0, 0], privacy: 0.46, open: false },
  { id: 6, name: 'Blackout', opening: [0, 0], privacy: 0.94, open: false },
] as const;

/**
 * Per-room-type curtain weights. Bedrooms and suites are usually dressed;
 * lounges and retail read as open glass. The openness bias then shifts mass
 * between the open and closed groups so a floor can feel consistently calm
 * or consistently exposed without changing the room's identity.
 */
export const CURTAIN_WEIGHTS: readonly (readonly number[])[] = [
  [0.04, 0.1, 0.16, 0.16, 0.26, 0.2, 0.08], // Bedroom
  [0.16, 0.34, 0.14, 0.14, 0.12, 0.08, 0.02], // Living room
  [0.14, 0.3, 0.14, 0.14, 0.14, 0.1, 0.04], // Living / dining
  [0.03, 0.08, 0.1, 0.1, 0.17, 0.44, 0.08], // Suite — premium sheer
  [0.24, 0.3, 0.14, 0.14, 0.1, 0.06, 0.02], // Study
  [0.2, 0.32, 0.14, 0.14, 0.1, 0.08, 0.02], // Minimal lounge
  [0.55, 0.3, 0.05, 0.05, 0.03, 0.02, 0.0], // Corridor
] as const;

/** Retail glazing stays open: the shopfront must read as a lit display. */
export const SHOP_CURTAIN_WEIGHTS = [0.3, 0.55, 0.05, 0.05, 0.02, 0.02, 0.01] as const;

/** The lobby is public-facing: bare glass or a neat, fully open sheer pair only. */
export const LOBBY_CURTAIN_WEIGHTS = [0.62, 0.38, 0, 0, 0, 0, 0] as const;

/**
 * Neutral wall tone per warm/cool lean. A cool floor leans to soft gray; a warm
 * floor to beige; a neutral floor keeps the off-white. Floors still rotate
 * through all three so the elevation never reads as one flat tone.
 */
export const WARMTH_WALL_IDS: Record<Warmth, readonly number[]> = {
  [-1]: [1, 0, 1],
  0: [0, 1, 2],
  1: [2, 0, 2],
};

/** Premium rooms get a coordinated sheer/cream treatment rather than a mixed draw. */
export const PREMIUM_CURTAIN_WEIGHTS = [0.03, 0.07, 0.09, 0.09, 0.14, 0.5, 0.08] as const;

const OPEN_STATES = [0, 1, 2, 3] as const;

/** Mirrors the shader's curtainPrivacy(); kept in sync by the QA check. */
export function curtainPrivacy(state: number, opening: number): number {
  if (state < 0.5) return 0;
  if (state < 1.5) return 0.05;
  if (state < 3.5) return 0.18 + 0.3 * opening;
  if (state < 4.5) return 0.6 + 0.24 * opening;
  if (state < 5.5) return 0.46;
  return 0.94;
}

/**
 * Applies the floor/unit openness bias, then draws a state.
 * `recent` holds the previous states along the same facade row so the result
 * clusters naturally instead of alternating open/closed/open/closed.
 */
export function pickCurtainState(
  roll: () => number,
  roomType: number,
  shop: boolean,
  premium: boolean,
  openness: number,
  recent: number[],
): { state: number; opening: number } {
  const base = roomType === 7 ? LOBBY_CURTAIN_WEIGHTS
    : shop ? SHOP_CURTAIN_WEIGHTS
      : premium ? PREMIUM_CURTAIN_WEIGHTS
        : CURTAIN_WEIGHTS[roomType];
  const openBias = 0.5 + openness;
  const closedBias = 1.5 - openness;
  const weights = base.map((w, i) => w * (OPEN_STATES.includes(i as 0 | 1 | 2 | 3) ? openBias : closedBias));
  const total = weights.reduce((sum, w) => sum + w, 0);

  // Neighbouring apartments often inherit the treatment next door: a deliberate
  // 32 % chance to repeat the previous state keeps runs of similar rooms.
  const previous = recent[0];
  if (previous !== undefined && base[previous] > 0.02 && roll() < 0.32) {
    return { state: previous, opening: drawOpening(previous, roll) };
  }

  let pick = roll() * total;
  let state = base.length - 1;
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick <= 0) { state = i; break; }
  }

  // Break a plain A-B-A rhythm: nudge one step toward the opposite register.
  if (recent.length > 1 && state === recent[1] && state !== recent[0]) {
    const towardClosed = OPEN_STATES.includes(state as 0 | 1 | 2 | 3);
    const shifted = towardClosed ? Math.min(state + 1, 6) : Math.max(state - 1, 0);
    if (base[shifted] > 0.01) state = shifted;
  }
  return { state, opening: drawOpening(state, roll) };
}

function drawOpening(state: number, roll: () => number): number {
  const [lo, hi] = CURTAIN_STATES[state].opening;
  return lo + (hi - lo) * roll();
}

/**
 * Wall style draw. The neutral tone is shared along a floor so neighbours read
 * as the same building; only the treatment and the rare accent vary per room.
 */
export function pickWallFinish(
  roll: () => number,
  roomType: number,
  neutralStyle: number,
  hasFocusWall: boolean,
): { style: number; treatment: number; tone: number } {
  const draw = roll();
  const tone = roll();
  if (draw < WALL_MIX.plain) return { style: neutralStyle, treatment: 0, tone };
  if (draw < WALL_MIX.plain + WALL_MIX.variation) {
    // Slight variation stays inside the neutral family.
    const style = roll() < 0.74 ? neutralStyle : NEUTRAL_WALL_IDS[Math.floor(roll() * NEUTRAL_WALL_IDS.length)];
    return { style, treatment: 1 + Math.floor(roll() * (WALL_TREATMENTS.length - 1)), tone };
  }
  const accentDraw = roll();
  // Oak panelling only goes behind a bed or a media wall, never behind a door.
  if (hasFocusWall && accentDraw < 0.34) return { style: 5, treatment: 0, tone };
  if (accentDraw < 0.34 + 0.26) return { style: 3, treatment: 0, tone };
  if (accentDraw < 0.34 + 0.26 + 0.24) return { style: 4, treatment: 0, tone };
  if (roomType === 6) return { style: 3, treatment: 0, tone };
  return { style: 6, treatment: 0, tone };
}

/**
 * Fabrics stay soft and modern; accent walls are paired with a neutral drape.
 * A blackout state never draws the translucent white sheer, so the named fabric
 * always matches how the panel actually reads. Charcoal is only offered to rooms
 * that are already private, and a floor's warm/cool lean biases the draw so the
 * same storey reads as one considered palette. Neighbours often share a fabric.
 */
export function pickCurtainFabric(
  roll: () => number,
  premium: boolean,
  accentWall: boolean,
  state: number,
  warmth: Warmth = 0,
  privacy = 0,
  neighbour?: number,
): number {
  const sheerOnly = state === 6;
  const isPrivate = privacy >= 0.6;
  const allowed = (fabric: CurtainFabricSpec) =>
    !(fabric.sheer > 0.5 && sheerOnly) && !(fabric.privateOnly && !isPrivate);
  // Apartments next door commonly inherit the same dressing (38 %).
  if (neighbour !== undefined && allowed(CURTAIN_FABRICS[neighbour]) && roll() < 0.38) return neighbour;
  const draw = (): number => {
    if (premium && roll() < 0.62) return roll() < 0.5 ? 0 : 1;
    if (accentWall && roll() < 0.7) return roll() < 0.5 ? 1 : 2;
    const weights = CURTAIN_FABRICS.map((fabric) => {
      if (!allowed(fabric)) return 0;
      const lean = fabric.warmth === 0 ? 1 : fabric.warmth === warmth ? 1.6 : warmth === 0 ? 1 : 0.55;
      return fabric.weight * lean;
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    let pick = roll() * total;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return i;
    }
    return 2;
  };
  const fabric = draw();
  return allowed(CURTAIN_FABRICS[fabric]) ? fabric : 2;
}

function linearColor(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(6);
  });
  return `vec3(${channels.join(', ')})`;
}

/**
 * Baked into the one shared ShaderMaterial. `code` is wallStyle + treatment*8
 * so the finish stays inside the existing per-unit attribute budget.
 */
export const INTERIOR_FINISH_GLSL = `
  struct WallFinish { vec3 colour; float strength; float treatment; float panelled; float textured; };
  struct CurtainFabric { vec3 colour; float opacity; float sheer; float folds; };

  WallFinish wallFinish(float code, float tone, RoomPalette pal) {
    float id = mod(code, 8.0);
    WallFinish f;
    f.treatment = floor(code / 8.0);
    f.strength = 1.0;
    f.panelled = 0.0;
    f.textured = 0.0;
    f.colour = ${linearColor(WALL_FINISHES[0].hex)};
    ${WALL_FINISHES.slice(1).map((finish, index) => {
    const id = index + 1;
    const body = finish.group === 'feature' && id === 5
      ? `f.colour = mix(pal.wall, ${linearColor(finish.hex)}, ${finish.strength.toFixed(2)}); f.panelled = 1.0;`
      : `f.colour = ${linearColor(finish.hex)}; f.strength = ${finish.strength.toFixed(2)};${id === 6 ? ' f.textured = 1.0;' : ''}`;
    return `if (id > ${(id - 0.5).toFixed(1)}${id < WALL_FINISHES.length - 1 ? ` && id < ${(id + 0.5).toFixed(1)}` : ''}) { ${body} }`;
  }).join('\n    ')}
    f.colour *= 0.982 + 0.036 * tone;
    return f;
  }

  CurtainFabric curtainFabric(float id) {
    ${CURTAIN_FABRICS.map((fabric, index) => `${index < CURTAIN_FABRICS.length - 1 ? `if (id < ${(index + 0.5).toFixed(1)}) ` : ''}return CurtainFabric(${linearColor(fabric.hex)}, ${fabric.opacity.toFixed(2)}, ${fabric.sheer.toFixed(1)}, ${fabric.folds.toFixed(1)});`).join('\n    ')}
  }

  float curtainPrivacy(float mode, float opening) {
    if (mode < 0.5) return 0.0;
    if (mode < 1.5) return 0.05;
    if (mode < 3.5) return 0.18 + 0.30 * opening;
    if (mode < 4.5) return 0.60 + 0.24 * opening;
    if (mode < 5.5) return 0.46;
    return 0.94;
  }
`;
