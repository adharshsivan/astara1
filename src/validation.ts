import {
  LOBBY_PALETTE_ID, LOBBY_TYPE, ROOM_TYPES, alongFace, assignInteriorUnits,
  auditInteriorUnits, paneRoomMapping, type Pane,
} from './units';
import { interiorFragmentShader, interiorVertexShader } from './shaders';
import { buildPaneGeometry, createInteriorMaterial } from './InteriorWindows';
import {
  FURNITURE, INTERIOR_ARTWORK, INTERIOR_COLOR_BALANCE,
  INTERIOR_LAYOUTS, INTERIOR_PALETTES, PALETTE_FAMILIES, ROOM_RECIPES,
  interiorLayoutBounds, planInteriorLayout,
} from './interiorArt';
import {
  CURTAIN_FABRICS, CURTAIN_STATES, CURTAIN_WEIGHTS, NEUTRAL_WALL_IDS,
  WALL_FINISHES, WALL_MIX, WALL_TREATMENTS, curtainPrivacy, pickCurtainFabric,
} from './interiorFinish';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** CPU reference for the shader's bounded analytical ray, used for movement QA. */
export function referenceRay(
  uv: [number, number], view: [number, number, number], distance: number, halfW = 3.4, depth = 2.4,
) {
  const length = Math.max(Math.hypot(...view), 0.0001);
  const facing = Math.abs(view[2]) / length;
  const detail = 1 - smooth(65, 115, distance);
  const fine = 1 - smooth(25, 65, distance);
  const strength = (0.32 + 0.68 * fine) * detail * smooth(0.08, 0.4, facing);
  const denominator = Math.max(facing, 0.22);
  const slope = [view[0], view[1]].map((v) => Math.max(-3.25, Math.min(3.25, -v / length / denominator)) * strength);
  const origin = [(uv[0] * 2 - 1) * halfW, uv[1] * 2 - 1];
  const bounds = [halfW, 1];
  const wallTime = slope.map((s, axis) => Math.abs(s) < 0.0001 ? 10000 : ((s >= 0 ? bounds[axis] : -bounds[axis]) - origin[axis]) / s);
  const exit = Math.max(0, Math.min(depth + 0.16, ...wallTime));
  return { slope, exit, point: [origin[0] + slope[0] * exit, origin[1] + slope[1] * exit], detail };
}

export function runInteriorValidation() {
  const checks: string[] = [];
  const assert = (condition: boolean, name: string) => {
    if (!condition) throw new Error(`Interior QA: ${name}`);
    checks.push(name);
  };
  const makePane = (x: number, row: string, ry = 0): Pane => ({
    x: Math.cos(ry) * x + Math.sin(ry) * 9.7,
    z: -Math.sin(ry) * x + Math.cos(ry) * 9.7,
    y: 15, w: 3.1, h: 2.76, ry, row,
    seed: 0, type: 0, bright: 0, variant: 0, pal: 0,
  });
  const source: Pane[] = [];
  for (let floor = 0; floor < 8; floor++) {
    for (const ry of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
      for (const x of [-8.9, -5.68, -2.46, 2.46, 5.68, 8.9]) {
        // Distinct storeys must not be mistaken for duplicate window quads.
        source.push({ ...makePane(x, `test-${floor}`, ry), y: 15 + floor * 3.6 });
      }
    }
  }
  const geometricSignature = (panes: Pane[]) => JSON.stringify(panes.map(({ x, y, z, w, h, ry }) => [x, y, z, w, h, ry]));
  const before = geometricSignature(source);
  const units = assignInteriorUnits(source, 20260);
  assert(before === geometricSignature(source), 'Window geometry and positions unchanged');
  const audit = auditInteriorUnits(source, units);
  assert(audit.errors.length === 0, 'Every pane belongs to exactly one coherent unit');
  assert([1, 2, 3].every((n) => audit.spans[String(n)] > 0), 'One-, two- and three-bay units exist');
  assert(units.every((u) => !(u.left < 0 && u.right > 0)), 'Units never cross the central structural pier');
  assert(units.filter((u) => u.windowSpan > 1).every((u) =>
    u.right - u.left > u.paneIndices.reduce((w, index) => w + source[index].w, 0)), 'Room width includes mullion gaps');
  assert(ROOM_TYPES.length === 8 && ROOM_RECIPES.length === 8,
    'Seven apartment room types plus one lobby category share one furniture catalogue');
  assert(INTERIOR_PALETTES.length === 6 && Object.keys(audit.palettes).length === 6,
    'Six coordinated residential palettes are used across the facade');
  assert(!units.some((unit) => unit.roomType === LOBBY_TYPE),
    'Upper-floor fixtures never generate the lobby category');

  /* ---- Ground-floor lobby ----
   * The rear and side ground floors are now solid wall, so they emit no panes
   * at all. Only the entrance front keeps two sidelights, either side of the
   * doors, at their real 3.82 m width and ±13.5 m centres. */
  const lobbySource: Pane[] = [-13.5, 13.5].map((x) => ({
    ...makePane(x, 'podium-ground', 0), y: 2.5, h: 4.0, w: 3.82,
  }));
  const lobbyUnits = assignInteriorUnits(lobbySource, 20260);
  const lobbyAudit = auditInteriorUnits(lobbySource, lobbyUnits);
  assert(lobbyAudit.errors.length === 0, 'Lobby units pass the shared geometry audit');
  assert(lobbyUnits.length === 2 && lobbyUnits.every((unit) => unit.roomType === LOBBY_TYPE),
    'Every ground-floor pane shows the lobby language, never an apartment template');
  assert(lobbyUnits.every((unit) => unit.palette === LOBBY_PALETTE_ID && unit.lighting === 'lit' && unit.brightness === 1),
    'The lobby uses its reserved stone/oak/charcoal palette and is always lit');
  assert(lobbyUnits.every((unit) => unit.wallStyle === 5 && unit.wallTreatment === 0 && unit.layoutVariant === 0 && unit.richness === 2),
    'Lobby walls, layout and furnishing are fixed and symmetric — no apartment lottery');
  assert(lobbyUnits.every((unit) => unit.curtainMode <= 1 && unit.curtainFabric === 0),
    'The lobby is public-facing: bare glass or a fully open white sheer only');
  assert(lobbyUnits.every((unit) => unit.depth >= 5.6),
    'The lobby is deeper than any apartment so reception reads far back');
  // A 3.82 m sidelight is narrower than the full reception + lounge composition,
  // so the layout must collapse to the desk alone, centred, inside the room.
  assert(lobbyUnits.every((unit) => {
    const bounds = interiorLayoutBounds(unit);
    const halfWidth = (unit.right - unit.left) / 2;
    return unit.secondaryAnchor === unit.mainAnchor
      && Math.abs(unit.mainAnchor) < 1e-6
      && bounds.main[0] >= -halfWidth + 0.119 && bounds.main[1] <= halfWidth - 0.119
      && bounds.height <= unit.top - unit.bottom - 0.075;
  }), 'Narrow entrance sidelights keep the reception centred and wholly inside the room');
  assert(ROOM_RECIPES[LOBBY_TYPE].height >= 3 && ROOM_RECIPES[LOBBY_TYPE].paired,
    'The lobby recipe is taller than any apartment and reserves a lounge zone');

  // The generator still joins adjacent ground-floor bays into one hall, so a
  // wider lobby front would need no code change.
  const wideLobby: Pane[] = [-6.4, 0, 6.4].map((x) => ({
    ...makePane(x, 'podium-ground', 0), y: 2.5, h: 4.0, w: 6.2,
  }));
  const wideUnits = assignInteriorUnits(wideLobby, 20260);
  assert(auditInteriorUnits(wideLobby, wideUnits).errors.length === 0,
    'Wide lobby halls pass the shared geometry audit');
  assert(wideUnits.length === 1 && wideUnits[0].windowSpan === 3
    && wideUnits[0].roomType === LOBBY_TYPE
    && wideUnits[0].secondaryAnchor !== wideUnits[0].mainAnchor,
  'Wide ground-floor glazing joins into one hall with a separate lounge zone');
  assert(INTERIOR_LAYOUTS.length === 4 && Object.keys(audit.layouts).length === 4, 'Four deterministic layout variations exist');
  /* ---- Wall and curtain art direction ---- */
  assert(WALL_FINISHES.length === 7 && NEUTRAL_WALL_IDS.length === 3,
    'Seven wall styles over three neutrals, two muted accents and two features');
  assert(Math.abs(WALL_MIX.plain + WALL_MIX.variation + WALL_MIX.accent - 1) < 1e-9
    && WALL_MIX.plain === 0.7 && WALL_MIX.variation === 0.2 && WALL_MIX.accent === 0.1,
  'Authored wall mix is 70% plain / 20% slight variation / 10% accent or feature');
  assert(WALL_TREATMENTS.length === 3 && units.every((unit) => unit.wallTreatment >= 0 && unit.wallTreatment < 3),
    'Wall treatments come from one shared three-entry table');
  assert(audit.accentWallPercent >= 1 && audit.accentWallPercent <= 26,
    `Accent/feature walls stay a minority (realised ${audit.accentWallPercent}%)`);
  assert((audit.wallTreatments[WALL_TREATMENTS[0]] ?? 0) / Math.max(1, units.length) >= 0.62,
    'Most rooms keep a plain neutral wall field');
  assert(Object.keys(audit.wallStyles).length >= 4, 'Several wall styles are actually in use');

  assert(CURTAIN_STATES.length === 7 && CURTAIN_FABRICS.length === 10,
    'Seven curtain states over ten soft fabrics');
  assert(CURTAIN_FABRICS.every((fabric) => {
    const [r, g, b] = [1, 3, 5].map((o) => parseInt(fabric.hex.slice(o, o + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b) <= 30;
  }), 'Every curtain fabric stays low-chroma — no loud or saturated tones');
  assert(units.filter((unit) => CURTAIN_FABRICS[unit.curtainFabric].privateOnly)
    .every((unit) => unit.privacy >= 0.6),
  'Charcoal-gray curtains only appear in rooms that are already private');
  assert(Object.keys(audit.curtainFabrics).length >= 5, 'Several curtain fabrics are actually in use');
  // Floors lean warm, neutral or cool, and their fabrics follow that lean.
  const floorWarmth = new Map<string, Set<number>>();
  for (const unit of units) {
    const set = floorWarmth.get(unit.floor) ?? new Set<number>();
    set.add(unit.warmth);
    floorWarmth.set(unit.floor, set);
  }
  assert([...floorWarmth.values()].every((set) => set.size === 1), 'A floor shares one warm/cool lean on every elevation');
  assert(new Set(units.map((unit) => unit.warmth)).size >= 2, 'Different floors lean differently');
  const leanMatches = units.filter((unit) => unit.warmth !== 0 && CURTAIN_FABRICS[unit.curtainFabric].warmth !== 0);
  const agreeing = leanMatches.filter((unit) => CURTAIN_FABRICS[unit.curtainFabric].warmth === unit.warmth).length;
  assert(leanMatches.length === 0 || agreeing / leanMatches.length >= 0.55,
    'Curtain fabrics follow their floor\'s warm/cool lean more often than not');
  let fabricPairs = 0;
  let sharedFabric = 0;
  for (const states of (() => {
    const rows = new Map<string, number[]>();
    for (const unit of units) {
      const rowKey = `${unit.floor}|${unit.face.toFixed(4)}`;
      rows.set(rowKey, [...(rows.get(rowKey) ?? []), unit.curtainFabric]);
    }
    return rows.values();
  })()) {
    for (let i = 1; i < states.length; i++) {
      fabricPairs++;
      if (states[i] === states[i - 1]) sharedFabric++;
    }
  }
  assert(fabricPairs > 0 && sharedFabric / fabricPairs >= 0.15, 'Neighbouring rooms sometimes share a curtain fabric');
  assert(units.every((unit) => unit.curtainAmount >= 0 && unit.curtainAmount <= 0.48),
    'Curtain openings stay bounded and belong to the whole room unit');
  assert(CURTAIN_FABRICS.every((fabric) => fabric.opacity <= 0.985)
    && CURTAIN_FABRICS.reduce((sum, fabric) => sum + fabric.weight, 0) > 0.999,
  'Curtain fabrics are opaque-or-sheer presets with normalised weights');
  // A named fabric must always match how the panel reads on screen.
  assert(units.filter((unit) => unit.curtainMode === 6)
    .every((unit) => CURTAIN_FABRICS[unit.curtainFabric].sheer < 0.5),
  'Blackout rooms never hang a translucent sheer fabric');
  assert(pickCurtainFabric(() => 0.01, true, false, 6) !== 0
    && pickCurtainFabric(() => 0.99, false, true, 6) !== 0,
  'Fabric selection excludes the sheer for every draw path in a blackout room');
  assert(CURTAIN_FABRICS[5].weight <= 0.05, 'The rare olive-gray fabric stays uncommon');
  assert(CURTAIN_WEIGHTS[0][0] < CURTAIN_WEIGHTS[6][0] && CURTAIN_WEIGHTS[3][5] > CURTAIN_WEIGHTS[1][5],
    'Bedrooms are dressed more often than corridors; suites favour full-height sheer');
  assert(Object.keys(audit.curtains).length >= 4, 'Several curtain states are actually in use');
  assert(audit.openPercent >= 15 && audit.privatePercent >= 8,
    `Open and private rooms coexist (open ${audit.openPercent}%, private ${audit.privatePercent}%)`);
  assert(units.every((unit) => Math.abs(unit.privacy - curtainPrivacy(unit.curtainMode, unit.curtainAmount)) < 1e-9),
    'Room privacy is derived from its curtain state, never randomised separately');

  // Clustered, not alternating: neighbours often share, and A-B-A rhythms are rare.
  const curtainRows = new Map<string, number[]>();
  for (const unit of units) {
    const rowKey = `${unit.floor}|${unit.face.toFixed(4)}`;
    curtainRows.set(rowKey, [...(curtainRows.get(rowKey) ?? []), unit.curtainMode]);
  }
  let adjacentPairs = 0;
  let shared = 0;
  let alternations = 0;
  let alternationSites = 0;
  for (const states of curtainRows.values()) {
    for (let i = 1; i < states.length; i++) {
      adjacentPairs++;
      if (states[i] === states[i - 1]) shared++;
    }
    for (let i = 2; i < states.length; i++) {
      alternationSites++;
      if (states[i] === states[i - 2] && states[i] !== states[i - 1]) alternations++;
    }
  }
  assert(adjacentPairs > 0 && shared / adjacentPairs >= 0.12,
    'Neighbouring rooms sometimes share a curtain treatment');
  assert(alternationSites === 0 || alternations / alternationSites < 0.5,
    'Curtain states do not fall into an open/closed/open/closed rhythm');

  // Whole floors take on a shared atmosphere rather than mixing every bay.
  const floorPrivacy = new Map<string, { sum: number; count: number }>();
  for (const unit of units) {
    const entry = floorPrivacy.get(unit.floor) ?? { sum: 0, count: 0 };
    entry.sum += unit.privacy;
    entry.count++;
    floorPrivacy.set(unit.floor, entry);
  }
  const floorAverages = [...floorPrivacy.values()].map((entry) => entry.sum / entry.count);
  assert(floorAverages.length > 1
    && Math.max(...floorAverages) - Math.min(...floorAverages) > 0.05,
  'Some floors read more open and some more private');
  assert(INTERIOR_ARTWORK.length === 4 && units.every((unit) => Number.isInteger(unit.artVariation)),
    'Artwork is selected from four composed designs');
  assert(units.some((unit) => unit.richness === 0) && units.some((unit) => unit.richness === 2),
    'Minimal and more furnished rooms coexist');
  assert(INTERIOR_COLOR_BALANCE.neutral >= 0.7 && INTERIOR_COLOR_BALANCE.neutral <= 0.8
    && Math.abs(INTERIOR_COLOR_BALANCE.neutral + INTERIOR_COLOR_BALANCE.accent - 1) < 1e-8,
    'Palette direction targets 76% neutral / 24% accent (not a screen-pixel measurement)');

  const floorPalettes = new Map<string, Set<number>>();
  for (const unit of units) {
    const paletteSet = floorPalettes.get(unit.floor) ?? new Set<number>();
    paletteSet.add(unit.palette);
    floorPalettes.set(unit.floor, paletteSet);
  }
  assert([...floorPalettes.values()].every((paletteSet) => PALETTE_FAMILIES.some((family) =>
    [...paletteSet].every((palette) => (family as readonly number[]).includes(palette)))),
    'Each floor uses a coordinated color family, not independent random colors');
  const firstFloor = units.filter((unit) => unit.floor === 'test-0').map((unit) => [unit.roomType, unit.palette, unit.layoutVariant]);
  const nextFloor = units.filter((unit) => unit.floor === 'test-1').map((unit) => [unit.roomType, unit.palette, unit.layoutVariant]);
  assert(JSON.stringify(firstFloor) !== JSON.stringify(nextFloor), 'Adjacent floors do not repeat an identical room sequence');

  let layoutsChecked = 0;
  let safeLayouts = true;
  for (let roomType = 0; roomType < ROOM_RECIPES.length; roomType++) {
    for (let layoutVariant = 0; layoutVariant < INTERIOR_LAYOUTS.length; layoutVariant++) {
      for (const mirrorX of [-1, 1]) {
        for (const width of [2.43, 3.1, 4.98, 6.32, 9.54]) {
          for (const height of [2.15, 2.76, 3.4, 4]) {
            const layout = planInteriorLayout(roomType, layoutVariant, mirrorX, width, [-0.75, -0.25, 0.25, 0.75], height);
            const bounds = interiorLayoutBounds({ roomType, left: -width / 2, right: width / 2, mirrorX, ...layout });
            safeLayouts &&= [bounds.scale, bounds.height, ...bounds.main, ...(bounds.secondary ?? [])].every(Number.isFinite)
              && bounds.scale > 0 && bounds.scale <= 1.03001 && bounds.height <= height - 0.079
              && [bounds.main, bounds.secondary].every((range) => !range || (range[0] >= -width / 2 + 0.119 && range[1] <= width / 2 - 0.119))
              && (!bounds.secondary || Math.min(bounds.main[1], bounds.secondary[1]) < Math.max(bounds.main[0], bounds.secondary[0]));
            const screenWidth = 1.48 * bounds.scale;
            const screenHeight = (1.48 / FURNITURE.tvAspect) * bounds.scale;
            safeLayouts &&= Math.abs(screenWidth / screenHeight - 16 / 9) < 1e-8;
            layoutsChecked++;
          }
        }
      }
    }
  }
  assert(safeLayouts, `${layoutsChecked} mirrored layout/size checks: clear zones, headroom, and 16:9 screens`);

  const geometry = buildPaneGeometry(source);
  const material = createInteriorMaterial();
  try {
    assert(geometry.getAttribute('position').count === source.length * 4 && geometry.index?.count === source.length * 6,
      'Original geometry budget: four vertices and two triangles per pane');
    // One extra flat vec4 for the wall/curtain dressing: eleven attribute
    // locations, still below WebGL2's guaranteed sixteen, and still two
    // triangles per pane with one shared material.
    assert(Object.keys(geometry.attributes).length === 11
      && Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.itemSize, 0) === 38,
    'Vertex-buffer budget: eleven attributes, 38 floats per vertex');
    assert(Object.keys(material.uniforms).length === 5 && !material.lights && !material.transparent,
      'One opaque shared material, five existing uniforms, no added light or texture uniforms');
    const styles = geometry.getAttribute('aPalette');
    const finishes = geometry.getAttribute('aRoomFinish');
    let packedStyles = true;
    let packedFinishes = true;
    source.forEach((pane, index) => {
      const room = pane.room!;
      for (let vertex = 0; vertex < 4; vertex++) {
        const i = index * 4 + vertex;
        packedStyles &&= styles.getZ(i) === room.artVariation + room.richness * 4
          && styles.getW(i) === room.layoutVariant + (room.mirrorX < 0 ? 4 : 0);
        // The whole unit shares one finish, so every pane of a room agrees.
        packedFinishes &&= finishes.getX(i) === room.wallStyle + room.wallTreatment * 8
          && finishes.getY(i) === room.wallTone
          && finishes.getZ(i) === room.curtainFabric
          && finishes.getW(i) === room.curtainFullness;
      }
    });
    assert(packedStyles, 'Artwork, density, layout and mirroring fit the existing shared room attributes');
    assert(packedFinishes, 'Wall and curtain dressing is one shared value per room unit, not per pane');
  } finally {
    geometry.dispose();
    material.dispose();
  }

  const repeat: Pane[] = source.map(({ room: _room, ...pane }) => ({ ...pane }));
  const again = assignInteriorUnits(repeat, 20260);
  assert(JSON.stringify(units) === JSON.stringify(again), 'Unit generation is deterministic on reload');
  const reversed: Pane[] = [...repeat].reverse().map(({ room: _room, ...p }) => ({ ...p }));
  const reversedUnits = assignInteriorUnits(reversed, 20260);
  const withoutIndices = (list: typeof units) => list.map(({ paneIndices: _indices, ...u }) => u);
  assert(JSON.stringify(withoutIndices(units)) === JSON.stringify(withoutIndices(reversedUnits)), 'Pane input order does not change room definitions');

  let unequalPassed = false;
  for (let seed = 0; seed < 16 && !unequalPassed; seed++) {
    const a = { ...makePane(-1.5, 'lobby'), w: 1.8, h: 3.4, y: 14.68 };
    const b = { ...makePane(1.07, 'lobby'), w: 3.1 };
    const pair = [a, b];
    const shared = assignInteriorUnits(pair, seed);
    if (shared.length !== 1) continue;
    const [sxA, oxA] = paneRoomMapping(a);
    const [sxB, oxB] = paneRoomMapping(b);
    const width = shared[0].right - shared[0].left;
    const gap = alongFace(b) - b.w / 2 - alongFace(a) - a.w / 2;
    unequalPassed = Math.abs(oxA) < 1e-6 && Math.abs(oxB + sxB - 1) < 1e-6
      && Math.abs((oxB - oxA - sxA) * width - gap) < 1e-6
      && auditInteriorUnits(pair, shared).errors.length === 0;
  }
  assert(unequalPassed, 'Unequal lobby widths/heights map into one bounded room');

  let finite = true;
  let rays = 0;
  for (const distance of [0, 4, 25, 65, 90, 115, 170]) {
    for (const uv of [[0, 0], [0.01, 0.5], [0.5, 0.5], [1, 1]] as [number, number][]) {
      for (let i = -100; i <= 100; i++) {
        const ray = referenceRay(uv, [i / 10, 0.5 * Math.sin(i), i === 0 ? 0 : 0.001 + Math.abs(i) / 100], distance);
        finite &&= [...ray.slope, ...ray.point, ray.exit].every(Number.isFinite)
          && ray.exit >= 0 && ray.slope.every((s) => Math.abs(s) <= 3.25)
          && Math.abs(ray.point[0]) <= 3.4001 && Math.abs(ray.point[1]) <= 1.0001;
        rays++;
      }
    }
  }
  assert(finite, 'Head-on, zero-component and grazing rays stay finite and in bounds');
  assert(referenceRay([0.4, 0.6], [3, 1, 1], 116).slope.every((n) => n === 0), 'Far LOD removes parallax');
  assert(!/gl_FragCoord|hash11|uTime|random\(/.test(interiorFragmentShader), 'No fragment randomness or time-dependent room movement');
  assert(interiorVertexShader.includes('flat out vec4 vInfo') && interiorFragmentShader.includes('flat in vec4 vInfo'), 'Room parameters use flat interpolation');
  return { checks, rays, audit };
}
