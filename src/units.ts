import {
  INTERIOR_ARTWORK, INTERIOR_LAYOUTS, INTERIOR_PALETTES, LOBBY_PALETTE,
  PALETTE_FAMILIES, interiorLayoutBounds, planInteriorLayout,
} from './interiorArt';
import {
  CURTAIN_FABRICS, CURTAIN_STATES, WALL_FINISHES, WALL_TREATMENTS, WARMTH_WALL_IDS,
  curtainPrivacy, pickCurtainFabric, pickCurtainState, pickWallFinish, type Warmth,
} from './interiorFinish';

export const ROOM_TYPES = ['Bedroom', 'Living room', 'Living / dining', 'Suite', 'Study', 'Minimal lounge', 'Corridor', 'Lobby'] as const;
export type RoomType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** The ground-floor lobby is its own category: never drawn by the apartment picker. */
export const LOBBY_TYPE: RoomType = 7;
/** Palette slot reserved for the lobby, after the six residential palettes. */
export const LOBBY_PALETTE_ID = INTERIOR_PALETTES.length;

export interface Pane {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ry: number;
  seed: number;
  type: number;
  bright: number;
  variant: number;
  pal: number;
  /** Explicit floor identity lets taller lobby panes join their neighbouring bay. */
  row?: string;
  room?: InteriorUnit;
}

export interface InteriorUnit {
  id: string;
  floor: string;
  face: number;
  paneIndices: number[];
  windowSpan: number;
  roomType: RoomType;
  seed: number;
  left: number;
  right: number;
  bottom: number;
  top: number;
  plane: number;
  depth: number;
  palette: number;
  brightness: number;
  lighting: 'lit' | 'dim' | 'off';
  curtainMode: number;
  curtainAmount: number;
  curtainFabric: number;
  curtainFullness: number;
  /** 0 open → 1 sealed: how much of the room the dressing hides. */
  privacy: number;
  wallStyle: number;
  wallTreatment: number;
  wallTone: number;
  /** Floor-level palette lean shared by walls and curtains. */
  warmth: Warmth;
  mirrorX: number;
  mainAnchor: number;
  secondaryAnchor: number;
  mainHalfWidth: number;
  finishVariation: number;
  fabricVariation: number;
  artVariation: number;
  layoutVariant: number;
  richness: 0 | 1 | 2;
  dayLift: number;
  origin: [number, number, number];
}

export interface InteriorAudit {
  panes: number;
  units: number;
  triangles: number;
  spans: Record<string, number>;
  templates: Record<string, number>;
  palettes: Record<string, number>;
  layouts: Record<string, number>;
  curtains: Record<string, number>;
  curtainFabrics: Record<string, number>;
  wallStyles: Record<string, number>;
  wallTreatments: Record<string, number>;
  richness: Record<string, number>;
  /** Share of units whose walls stay inside the neutral family. */
  neutralWallPercent: number;
  accentWallPercent: number;
  openPercent: number;
  privatePercent: number;
  averagePrivacy: number;
  litPercent: number;
  errors: string[];
  signature: string;
}

export function stableHash(text: string, seed = 20260): number {
  let value = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value ^ (value >>> 16)) >>> 0;
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const alongFace = (p: Pane) => p.x * Math.cos(p.ry) - p.z * Math.sin(p.ry);
const facePlane = (p: Pane) => p.x * Math.sin(p.ry) + p.z * Math.cos(p.ry);
export const paneMullions = (p: Pane) => p.w / p.h > 1.4 ? 3 : p.w / p.h > 0.8 ? 2 : 1;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function pickType(span: number, shop: boolean, r: number): RoomType {
  if (shop) return span > 1 && r < 0.55 ? 2 : 5;
  if (span === 3) return r < 0.4 ? 1 : r < 0.75 ? 2 : 3;
  if (span === 2) return r < 0.42 ? 1 : r < 0.65 ? 0 : r < 0.85 ? 3 : 5;
  return r < 0.48 ? 0 : r < 0.76 ? 4 : r < 0.91 ? 5 : 6;
}

/** Only room metadata changes here. Position, size, UVs and facade mullions do not. */
export function assignInteriorUnits(panes: Pane[], buildingSeed = 20260): InteriorUnit[] {
  const rows = new Map<string, number[]>();
  panes.forEach((pane, index) => {
    const row = pane.row ?? `head-${(pane.y + pane.h / 2).toFixed(1)}`;
    const key = `${row}|${pane.ry.toFixed(5)}|${facePlane(pane).toFixed(3)}`;
    const indices = rows.get(key) ?? [];
    indices.push(index);
    rows.set(key, indices);
  });
  const units: InteriorUnit[] = [];
  for (const [key, indices] of [...rows.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    indices.sort((a, b) => alongFace(panes[a]) - alongFace(panes[b]));
    const floor = panes[indices[0]].row ?? key.split('|')[0];
    const floorNumber = /\d+$/.exec(floor);
    const floorIndex = floorNumber ? Number(floorNumber[0]) : stableHash(floor, buildingSeed) % 6;
    const family = PALETTE_FAMILIES[(stableHash('palette-family', buildingSeed) + floorIndex) % PALETTE_FAMILIES.length];
    // One openness value per storey, shared by every elevation: from a distance
    // a floor reads as consistently exposed or consistently private. The same
    // storey also leans warm, neutral or cool, which biases both the neutral
    // wall tone and the curtain fabrics without changing any room's identity,
    // so neighbours share a palette instead of flickering bay to bay.
    const atmosphere = seeded(stableHash(`${floor}|atmosphere`, buildingSeed));
    const floorOpenness = atmosphere();
    const leanRoll = atmosphere();
    const warmth: Warmth = leanRoll < 0.36 ? 1 : leanRoll < 0.64 ? 0 : -1;
    const warmthWalls = WARMTH_WALL_IDS[warmth];
    const neutralStyle = warmthWalls[(floorIndex + family[0]) % warmthWalls.length];
    const isLobbyRow = floor === 'podium-ground';
    let previousStyle = '';
    const recentCurtains: number[] = [];
    let previousFabric: number | undefined;
    const runs: number[][] = [];
    for (const index of indices) {
      const run = runs[runs.length - 1];
      const pane = panes[index];
      const previous = run && panes[run[run.length - 1]];
      const edgeGap = previous ? alongFace(pane) - pane.w / 2 - (alongFace(previous) + previous.w / 2) : Infinity;
      if (previous && edgeGap >= -0.025 && edgeGap <= 0.36) run.push(index);
      else runs.push([index]);
    }

    for (const run of runs) {
      const start = (alongFace(panes[run[0]]) - panes[run[0]].w / 2).toFixed(3);
      const spanRandom = seeded(stableHash(`${key}|${start}|plan`, buildingSeed));
      for (let cursor = 0; cursor < run.length;) {
        const remaining = run.length - cursor;
        const roll = spanRandom();
        // The lobby hall runs the full width of each ground-floor glazing run
        // (up to three bays) so the reception composition stays centred and
        // symmetric; apartments keep their mixed 1–3 bay rhythm.
        const span = isLobbyRow ? Math.min(3, remaining)
          : remaining >= 3 && roll < 0.42 ? 3 : remaining >= 2 && roll < 0.8 ? 2 : 1;
        const members = run.slice(cursor, cursor + span);
        const first = panes[members[0]];
        const left = Math.min(...members.map((i) => alongFace(panes[i]) - panes[i].w / 2));
        const right = Math.max(...members.map((i) => alongFace(panes[i]) + panes[i].w / 2));
        const bottom = Math.min(...members.map((i) => panes[i].y - panes[i].h / 2));
        const top = Math.max(...members.map((i) => panes[i].y + panes[i].h / 2));
        const id = `${key}|unit-${left.toFixed(3)}`;
        const seed = stableHash(id, buildingSeed);
        const random = seeded(seed);
        const shop = first.y < 5;
        // The podium ground floor is the building's public entrance. Every
        // ground-floor pane shows the lobby language — reception, lounge pair,
        // branded backdrop — never an apartment template.
        const lobby = isLobbyRow;
        let roomType: RoomType = lobby ? LOBBY_TYPE : pickType(span, shop, random());
        const width = right - left;
        if (roomType === 5 && width < 3.0) roomType = 4;
        const middle = (left + right) / 2;
        const plane = facePlane(first);
        const mirrorX = random() < 0.5 ? -1 : 1;

        // Focal points use actual clear glazing sub-bays, never a major mullion.
        const candidates: number[] = [];
        for (const index of members) {
          const p = panes[index];
          const divisions = paneMullions(p);
          for (let sub = 0; sub < divisions; sub++) {
            const centre = alongFace(p) - p.w / 2 + p.w * (sub + 0.5) / divisions;
            candidates.push((centre - middle) * 2 / width);
          }
        }
        const occupancy = random();
        const litThreshold = shop ? 0.65 : 0.57;
        // A hotel lobby is staffed around the clock: it is always lit, and
        // brighter than any apartment so the entrance anchors the facade at night.
        const lighting = lobby ? 'lit' : occupancy < litThreshold ? 'lit' : occupancy < litThreshold + 0.19 ? 'dim' : 'off';
        const brightness = lobby ? 1.0
          : lighting === 'lit' ? 0.78 + random() * 0.24 : lighting === 'dim' ? 0.24 + random() * 0.12 : 0.035 + random() * 0.03;
        // The lobby is deeper than an apartment so the reception reads far back.
        const depth = lobby ? 5.6 + random() * 0.6
          : (roomType === 6 ? 2.4 : span === 1 ? 2.8 : 3.4) + random() * 0.7;
        const palette = lobby ? LOBBY_PALETTE_ID : family[(floorIndex + (random() < 0.72 ? 0 : 1)) % 2];

        // Premium units — suites and the widest living rooms — get a coordinated
        // sheer/cream dressing and are the rooms most likely to carry a feature wall.
        const premium = roomType === 3 || (span === 3 && roomType <= 2);
        const unitPrivacy = random();
        const openness = clamp(floorOpenness * 0.6 + (1 - unitPrivacy) * 0.4, 0, 1);
        const drawn = pickCurtainState(random, roomType, shop, premium, openness, recentCurtains);
        const curtainMode = drawn.state;
        const curtainAmount = drawn.opening;
        recentCurtains.unshift(curtainMode);
        if (recentCurtains.length > 2) recentCurtains.pop();
        const privacy = curtainPrivacy(curtainMode, curtainAmount);

        // The lobby wall is fixed: a stone field with an oak-panelled reception
        // backdrop. It does not join the apartment 70/20/10 lottery.
        const wall = lobby
          ? { style: 5, treatment: 0, tone: random() }
          : pickWallFinish(random, roomType, neutralStyle, roomType <= 3);
        const accentWall = WALL_FINISHES[wall.style].group !== 'neutral';
        const curtainFabric = lobby ? 0
          : pickCurtainFabric(random, premium, accentWall, curtainMode, warmth, privacy, previousFabric);
        previousFabric = curtainFabric;
        const curtainFullness = premium || lobby ? 0.62 + random() * 0.38 : 0.3 + random() * 0.6;
        const finishVariation = random();
        const fabricVariation = random();
        const artVariation = Math.floor(random() * INTERIOR_ARTWORK.length);
        let layoutVariant = (Math.floor(random() * INTERIOR_LAYOUTS.length) + floorIndex) % INTERIOR_LAYOUTS.length;
        if (`${roomType}|${palette}|${layoutVariant}` === previousStyle) layoutVariant = (layoutVariant + 1) % INTERIOR_LAYOUTS.length;
        previousStyle = `${roomType}|${palette}|${layoutVariant}`;
        const styling = seeded(stableHash(`${id}|furnishing`, buildingSeed))();
        let richness: 0 | 1 | 2 = layoutVariant === 1 || styling < (roomType >= 5 ? 0.6 : 0.23) ? 0
          : styling < (roomType === 3 ? 0.6 : 0.78) ? 1 : 2;
        if (lobby) {
          // Lobby composition is fixed and fully furnished: the 'Balanced'
          // layout keeps the desk centred, and the lounge pair faces the doors.
          layoutVariant = 0;
          richness = 2;
        }
        const layout = planInteriorLayout(roomType, layoutVariant, mirrorX, width, candidates, top - bottom);
        const unit: InteriorUnit = {
          id, floor: first.row ?? key, face: first.ry, paneIndices: members, windowSpan: span,
          roomType, seed, left, right, bottom, top, plane,
          depth, palette, brightness, lighting, curtainMode, curtainAmount,
          curtainFabric, curtainFullness, privacy,
          wallStyle: wall.style, wallTreatment: wall.treatment, wallTone: wall.tone, warmth,
          mirrorX, ...layout,
          finishVariation, fabricVariation, artVariation, layoutVariant, richness,
          dayLift: members.some((i) => panes[i].variant >= 8) ? 1 : 0,
          origin: [Math.cos(first.ry) * middle + Math.sin(first.ry) * plane, (bottom + top) / 2,
            -Math.sin(first.ry) * middle + Math.cos(first.ry) * plane],
        };
        for (const index of members) {
          const p = panes[index];
          p.room = unit;
          p.seed = seed;
          p.type = roomType;
          p.bright = brightness;
          p.pal = unit.palette;
          p.variant = unit.layoutVariant + unit.dayLift * 8;
        }
        units.push(unit);
        cursor += span;
      }
    }
  }
  return units;
}

/** Affine UV mapping includes real mullion gaps and uneven glazing heights. */
export function paneRoomMapping(p: Pane): [number, number, number, number] {
  const room = p.room;
  if (!room) throw new Error('Pane has no assigned interior unit.');
  return [p.w / (room.right - room.left), (alongFace(p) - p.w / 2 - room.left) / (room.right - room.left),
    p.h / (room.top - room.bottom), (p.y - p.h / 2 - room.bottom) / (room.top - room.bottom)];
}

export function auditInteriorUnits(panes: Pane[], units: InteriorUnit[]): InteriorAudit {
  const errors: string[] = [];
  const spans: Record<string, number> = { '1': 0, '2': 0, '3': 0 };
  const templates: Record<string, number> = {};
  const palettes: Record<string, number> = {};
  const layouts: Record<string, number> = {};
  const curtains: Record<string, number> = {};
  const curtainFabrics: Record<string, number> = {};
  const wallStyles: Record<string, number> = {};
  const wallTreatments: Record<string, number> = {};
  const richness: Record<string, number> = {};
  const assigned = new Set<number>();
  const positions = new Set<string>();
  panes.forEach((p, index) => {
    const key = [p.x, p.y, p.z, p.w, p.h, p.ry].map((v) => v.toFixed(5)).join('|');
    if (positions.has(key)) errors.push(`Duplicate interior quad ${index}`);
    positions.add(key);
  });
  for (const unit of units) {
    spans[String(unit.windowSpan)]++;
    templates[ROOM_TYPES[unit.roomType]] = (templates[ROOM_TYPES[unit.roomType]] ?? 0) + 1;
    // The lobby owns the reserved slot after the six residential palettes. It
    // must resolve here as well, or the audit rejects every ground-floor unit.
    const paletteName = unit.palette === LOBBY_PALETTE_ID
      ? LOBBY_PALETTE.name
      : INTERIOR_PALETTES[unit.palette]?.name;
    if (!paletteName) errors.push(`${unit.id}: unknown palette`);
    else palettes[paletteName] = (palettes[paletteName] ?? 0) + 1;
    if ((unit.palette === LOBBY_PALETTE_ID) !== (unit.roomType === LOBBY_TYPE)) {
      errors.push(`${unit.id}: lobby palette and lobby room type must go together`);
    }
    const layoutName = INTERIOR_LAYOUTS[unit.layoutVariant];
    if (!layoutName) errors.push(`${unit.id}: unknown layout`);
    else layouts[layoutName] = (layouts[layoutName] ?? 0) + 1;
    const curtain = CURTAIN_STATES[unit.curtainMode];
    if (!curtain) errors.push(`${unit.id}: unknown curtain state`);
    else curtains[curtain.name] = (curtains[curtain.name] ?? 0) + 1;
    const fabricName = CURTAIN_FABRICS[unit.curtainFabric]?.name;
    if (!fabricName) errors.push(`${unit.id}: unknown curtain fabric`);
    else curtainFabrics[fabricName] = (curtainFabrics[fabricName] ?? 0) + 1;
    const wallName = WALL_FINISHES[unit.wallStyle]?.name;
    if (!wallName) errors.push(`${unit.id}: unknown wall finish`);
    else wallStyles[wallName] = (wallStyles[wallName] ?? 0) + 1;
    const treatmentName = WALL_TREATMENTS[unit.wallTreatment];
    if (!treatmentName) errors.push(`${unit.id}: unknown wall treatment`);
    else wallTreatments[treatmentName] = (wallTreatments[treatmentName] ?? 0) + 1;
    if (Math.abs(unit.privacy - curtainPrivacy(unit.curtainMode, unit.curtainAmount)) > 1e-9) {
      errors.push(`${unit.id}: privacy does not match its curtain state`);
    }
    if (unit.curtainAmount < 0 || unit.curtainAmount > 0.5
      || unit.wallTone < 0 || unit.wallTone > 1 || unit.curtainFullness < 0 || unit.curtainFullness > 1) {
      errors.push(`${unit.id}: finish parameter out of range`);
    }
    const richnessName = ['Minimal', 'Composed', 'Layered'][unit.richness];
    if (!richnessName || !INTERIOR_ARTWORK[unit.artVariation]) errors.push(`${unit.id}: unknown furnishing style`);
    else richness[richnessName] = (richness[richnessName] ?? 0) + 1;
    if (unit.windowSpan < 1 || unit.windowSpan > 3) errors.push(`${unit.id}: invalid span`);
    if (unit.right <= unit.left || unit.top <= unit.bottom) errors.push(`${unit.id}: invalid bounds`);
    const bounds = interiorLayoutBounds(unit);
    const halfWidth = (unit.right - unit.left) / 2;
    if (bounds.height > unit.top - unit.bottom - 0.075 || bounds.scale <= 0) {
      errors.push(`${unit.id}: furnishings exceed room height`);
    }
    if ([bounds.main, bounds.secondary].some((range) => range &&
      (!range.every(Number.isFinite) || range[0] < -halfWidth + 0.1 || range[1] > halfWidth - 0.1))) {
      errors.push(`${unit.id}: furniture outside room`);
    }
    if (bounds.secondary && Math.min(bounds.main[1], bounds.secondary[1]) > Math.max(bounds.main[0], bounds.secondary[0]) - 0.01) {
      errors.push(`${unit.id}: furniture zones overlap`);
    }
    for (const index of unit.paneIndices) {
      const p = panes[index];
      if (assigned.has(index)) errors.push(`Pane ${index} assigned twice`);
      assigned.add(index);
      if (p.room !== unit || p.bright !== unit.brightness || p.type !== unit.roomType || p.pal !== unit.palette) {
        errors.push(`${unit.id}: inconsistent room parameters`);
      }
      const [sx, ox, sy, oy] = paneRoomMapping(p);
      if (![sx, ox, sy, oy].every(Number.isFinite) || ox < -1e-5 || oy < -1e-5 || ox + sx > 1.00001 || oy + sy > 1.00001) {
        errors.push(`${unit.id}: pane lies outside its room`);
      }
    }
  }
  if (assigned.size !== panes.length) errors.push('Some panes are unassigned');
  const share = (test: (unit: InteriorUnit) => boolean) =>
    units.length ? Math.round(units.filter(test).length * 100 / units.length) : 0;
  const group = (unit: InteriorUnit) => WALL_FINISHES[unit.wallStyle]?.group;
  return {
    panes: panes.length, units: units.length, triangles: panes.length * 2, spans, templates, palettes, layouts,
    curtains, curtainFabrics, wallStyles, wallTreatments, richness,
    neutralWallPercent: share((unit) => group(unit) === 'neutral' && unit.wallTreatment === 0),
    accentWallPercent: share((unit) => group(unit) !== 'neutral'),
    openPercent: share((unit) => CURTAIN_STATES[unit.curtainMode]?.open === true),
    privatePercent: share((unit) => unit.privacy >= 0.6),
    averagePrivacy: units.length
      ? Number((units.reduce((sum, unit) => sum + unit.privacy, 0) / units.length).toFixed(3))
      : 0,
    litPercent: share((unit) => unit.lighting === 'lit'),
    errors, signature: stableHash(JSON.stringify(units)).toString(16),
  };
}
