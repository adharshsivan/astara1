export const INTERIOR_PALETTES = [
  { name: 'Teal / oak', wall: '#f0eee8', fabric: '#d6dad5', wood: '#b58b5d', accent: '#387f83', soft: '#a5c1be' },
  { name: 'Dusty blue / walnut', wall: '#e9ecea', fabric: '#d0d6db', wood: '#805b43', accent: '#6688a8', soft: '#b1c4d5' },
  { name: 'Sage / oak', wall: '#f0f1e9', fabric: '#dddcd2', wood: '#b99162', accent: '#7b966b', soft: '#b9c8a9' },
  { name: 'Terracotta / walnut', wall: '#f3eee7', fabric: '#dad7d1', wood: '#886047', accent: '#b9654d', soft: '#d5a18b' },
  { name: 'Olive / oak', wall: '#eceee6', fabric: '#d5d8ce', wood: '#ab8457', accent: '#81884b', soft: '#b6bc8b' },
  { name: 'Mustard / walnut', wall: '#eeefeb', fabric: '#d3d8d7', wood: '#7e5840', accent: '#bb9847', soft: '#d8c594' },
] as const;

export const PALETTE_FAMILIES = [[0, 1], [2, 4], [3, 5]] as const;
export const INTERIOR_LAYOUTS = ['Balanced', 'Quiet', 'Corner', 'Collected'] as const;
export const INTERIOR_ARTWORK = ['Horizon', 'Arch', 'Botanical', 'Diptych'] as const;
export const INTERIOR_COLOR_BALANCE = { neutral: 0.76, accent: 0.24 } as const;

export const FURNITURE = {
  tvAspect: 16 / 9,
  consoleHeight: 0.52,
  sofaHeight: 0.84,
  bedHeight: 0.54,
  deskHeight: 0.74,
  floorLampHeight: 1.56,
  tableLampHeight: 0.46,
} as const;

// Metre-scale footprints include the attached bedside table or floor lamp.
// Both the CPU layout and the shader library read this same small catalogue.
export const ROOM_RECIPES = [
  { primary: 1.74, outer: 0.08, inner: 0.56, secondary: 0.74, height: 2.13, paired: false },
  { primary: 2.10, outer: 0.25, inner: 0.62, secondary: 1.04, height: 1.94, paired: false },
  { primary: 1.94, outer: 0.24, inner: 0.62, secondary: 2.12, height: 2.11, paired: true },
  { primary: 1.82, outer: 0.08, inner: 0.56, secondary: 1.88, height: 2.13, paired: true },
  { primary: 1.52, outer: 0.08, inner: 0.08, secondary: 0.74, height: 2.04, paired: false },
  { primary: 2.38, outer: 0.08, inner: 0.62, secondary: 0.74, height: 2.14, paired: false },
  { primary: 1.02, outer: 0.04, inner: 0.04, secondary: 0.90, height: 2.07, paired: true },
  // Lobby: reception desk + backdrop as the primary zone, lounge pair as the
  // secondary zone. Taller recipe height because the ground floor has 4 m glass.
  { primary: 2.60, outer: 0.30, inner: 0.30, secondary: 2.80, height: 3.00, paired: true },
] as const;

/** Lobby surfaces: warm stone, light oak, charcoal, brass-leaning warm light. */
export const LOBBY_PALETTE = {
  name: 'Lobby — stone / oak / charcoal',
  wall: '#ece6dc', fabric: '#d9d2c6', wood: '#c09a6b', accent: '#3a3d42', soft: '#b9a98f',
} as const;

const LAYOUT_SCALES = [1, 0.94, 1.03, 0.98] as const;
const EDGE_CLEARANCE = 0.12;
const ZONE_GAP = 0.28;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function planInteriorLayout(
  roomType: number,
  layout: number,
  mirror: number,
  width: number,
  clearBayCenters: number[],
  height = 2.76,
) {
  const recipe = ROOM_RECIPES[roomType];
  const primaryFootprint = recipe.primary + recipe.outer + recipe.inner;
  // The lobby keeps its reception at full scale and simply drops the lounge
  // pair in a narrow hall (the front sidelights); apartments scale as before.
  const pairRequired = recipe.paired && roomType !== 7;
  const required = primaryFootprint + (pairRequired ? recipe.secondary + ZONE_GAP : 0);
  const scale = Math.min(LAYOUT_SCALES[layout], (width - 2 * EDGE_CLEARANCE) / required, (height - 0.08) / recipe.height);
  const primary = recipe.primary * scale;
  const left = primary / 2 + (mirror > 0 ? recipe.outer : recipe.inner) * scale;
  const right = primary / 2 + (mirror > 0 ? recipe.inner : recipe.outer) * scale;
  const secondary = recipe.secondary * scale;
  const gap = ZONE_GAP * scale;
  const paired = pairRequired || width >= left + right + secondary + gap + 2 * EDGE_CLEARANCE;
  const min = -width / 2 + EDGE_CLEARANCE;
  const max = width / 2 - EDGE_CLEARANCE;

  const choose = (preferred: number, lo: number, hi: number) => {
    const target = clamp(preferred, lo, hi);
    const safe = clearBayCenters.map((x) => x * width / 2).filter((x) => x >= lo && x <= hi);
    // A clear glazing sub-bay is preferred, but never at the cost of leaving the
    // room. A narrow hall — the 3.8 m entrance sidelights — has no sub-bay
    // centre inside the furniture's own clearance band, so the clamped, centred
    // target wins instead of an out-of-range candidate.
    if (!safe.length) return target;
    return safe.reduce((best, x) => Math.abs(x - target) < Math.abs(best - target) ? x : best);
  };
  const mainMin = min + left + (paired && mirror < 0 ? secondary + gap : 0);
  const mainMax = max - right - (paired && mirror > 0 ? secondary + gap : 0);
  const offset = paired ? [0.19, 0.16, 0.24, 0.21][layout] : [0, 0.04, 0.09, 0.05][layout];
  const main = choose(-mirror * width * offset, mainMin, mainMax);
  let second = main;
  if (paired) {
    const secondMin = mirror > 0 ? main + right + gap + secondary / 2 : min + secondary / 2;
    const secondMax = mirror > 0 ? max - secondary / 2 : main - left - gap - secondary / 2;
    const spread = (layout === 2 ? 0.38 : 0.12) * scale;
    second = choose(main + mirror * ((mirror > 0 ? right : left) + gap + secondary / 2 + spread), secondMin, secondMax);
  }
  return {
    mainAnchor: main * 2 / width,
    secondaryAnchor: second * 2 / width,
    mainHalfWidth: primary / width,
  };
}

export function interiorLayoutBounds(room: {
  roomType: number; left: number; right: number; mainHalfWidth: number;
  mainAnchor: number; secondaryAnchor: number; mirrorX: number;
}) {
  const width = room.right - room.left;
  const recipe = ROOM_RECIPES[room.roomType];
  const scale = room.mainHalfWidth * width / recipe.primary;
  const main = room.mainAnchor * width / 2;
  const secondary = room.secondaryAnchor * width / 2;
  const half = recipe.primary * scale / 2;
  return {
    scale,
    height: recipe.height * scale,
    main: [main - half - (room.mirrorX > 0 ? recipe.outer : recipe.inner) * scale,
      main + half + (room.mirrorX > 0 ? recipe.inner : recipe.outer) * scale],
    secondary: Math.abs(main - secondary) < 0.001 ? null
      : [secondary - recipe.secondary * scale / 2, secondary + recipe.secondary * scale / 2],
  };
}

function linearColor(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(6);
  });
  return `vec3(${channels.join(', ')})`;
}

// Palette constants are baked into the shared shader, not allocated per room.
export const INTERIOR_PALETTE_GLSL = `
  struct RoomPalette { vec3 wall; vec3 fabric; vec3 wood; vec3 accent; vec3 soft; };
  RoomPalette roomPalette(float id) {
    ${INTERIOR_PALETTES.map((palette, index) => `if (id < ${(index + 0.5).toFixed(1)}) return RoomPalette(${[palette.wall, palette.fabric, palette.wood, palette.accent, palette.soft].map(linearColor).join(', ')});`).join('\n    ')}
    // Palette ${INTERIOR_PALETTES.length} is reserved for the ground-floor lobby.
    return RoomPalette(${[LOBBY_PALETTE.wall, LOBBY_PALETTE.fabric, LOBBY_PALETTE.wood, LOBBY_PALETTE.accent, LOBBY_PALETTE.soft].map(linearColor).join(', ')});
  }
  vec4 roomRecipe(float kind) {
    ${ROOM_RECIPES.map((recipe, index) => `${index < ROOM_RECIPES.length - 1 ? `if (kind < ${(index + 0.5).toFixed(1)}) ` : ''}return vec4(${[recipe.primary, recipe.outer, recipe.inner, recipe.secondary].map((n) => n.toFixed(3)).join(', ')});`).join('\n    ')}
  }
`;