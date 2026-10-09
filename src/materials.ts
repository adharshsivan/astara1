import * as THREE from 'three';
import { installDayContactShading } from './dayShading';
import { setVisualProfile, stageAmount, visualNight, type LightStage } from './visualProfiles';

/**
 * Shared material palette for the LOKAM building.
 * Every mesh in the asset references one of these, so the whole landmark
 * ships with ~16 reusable materials (great for batching / draw calls).
 */
const std = (opts: THREE.MeshStandardMaterialParameters, name: string) => {
  const m = new THREE.MeshStandardMaterial(opts);
  m.name = name;
  return m;
};

/** Emissive "neon" material. Exports to glTF with KHR_materials_emissive_strength. */
const neon = (hex: string, strength = 2.6, name = 'Neon') => {
  const m = new THREE.MeshStandardMaterial({
    color: '#111111',
    emissive: new THREE.Color(hex),
    emissiveIntensity: strength,
    roughness: 0.4,
    metalness: 0,
    toneMapped: false,
  });
  m.name = name;
  return m;
};

export const MAT = {
  /* Palette refinement: warm ivory slabs, graphite / slate metals, muted accents.
   * NOTE: `wood` is intentionally untouched — it is the rooftop café floor. */
  concrete: std({ color: '#e4dfd4', roughness: 0.9, metalness: 0.02 }, 'Concrete_Ivory'),
  /** Vertex-coloured architecture: ivory / pale gray / mid gray / graphite tones per part. */
  architecture: std({ color: '#ffffff', roughness: 0.88, metalness: 0.02, vertexColors: true }, 'Architecture_Toned'),
  concreteDark: std({ color: '#2d3036', roughness: 0.85, metalness: 0.05 }, 'Concrete_Graphite'),
  darkMetal: std({ color: '#262a31', roughness: 0.48, metalness: 0.6 }, 'Metal_Slate'),
  bronze: std({ color: '#a98a5e', roughness: 0.38, metalness: 0.8 }, 'Metal_Bronze'),
  wood: std({ color: '#8e5932', roughness: 0.88, metalness: 0 }, 'Wood_Deck'),
  woodLight: std({ color: '#a8865f', roughness: 0.85, metalness: 0 }, 'Wood_Light'),
  cream: std({ color: '#efe6d6', roughness: 0.9, metalness: 0 }, 'Fabric_Cream'),
  teal: std({ color: '#1f7d8c', roughness: 0.85, metalness: 0 }, 'Fabric_Teal'),
  coral: std({ color: '#ff6f61', roughness: 0.8, metalness: 0 }, 'Fabric_Coral'),
  green: std({ color: '#3f8f4a', roughness: 0.95, metalness: 0 }, 'Foliage'),
  white: std({ color: '#eeede9', roughness: 0.5, metalness: 0.1 }, 'Paint_White'),
  // Neutral, lightly luminous finishes inside the empty double-height hall.
  // These are separate from the exterior palette so the outdoor identity stays
  // unchanged while the room remains legible through glass at night.
  hallWhite: std({
    color: '#f8f8f6', roughness: 0.96, metalness: 0,
    emissive: '#ffffff', emissiveIntensity: 0.12,
  }, 'Hall_Flat_White'),
  lobbyGlass: (() => {
    const material = new THREE.MeshBasicMaterial({
      color: '#f0f7fa', transparent: true, opacity: 0.16,
      depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    material.name = 'Lobby_Clear_Glass';
    return material;
  })(),
  tvScreen: std({
    color: '#123e50',
    emissive: '#1fa8c8',
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0.18,
  }, 'Cafe_TV_Screen'),
  poolTile: std({ color: '#11546a', roughness: 0.54, metalness: 0.05 }, 'Pool_Deep_Tile'),
  poolGlass: (() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#52cbdc',
      roughness: 0.09,
      metalness: 0.14,
      transparent: true,
      opacity: 0.53,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.5,
    });
    m.name = 'Pool_Infinity_Edge_Glass';
    return m;
  })(),
  ground: std({ color: '#14161b', roughness: 0.98, metalness: 0 }, 'Ground_Asphalt'),
  plaza: std({ color: '#252830', roughness: 0.92, metalness: 0 }, 'Ground_Plaza'),
  stoneLight: std({ color: '#c9c7c1', roughness: 0.82, metalness: 0.02 }, 'Stone_Light_Paving'),
  stoneTrim: std({ color: '#2b2d35', roughness: 0.76, metalness: 0.06 }, 'Stone_Dark_Border'),
  lawn: std({ color: '#2d5e30', roughness: 0.96, metalness: 0 }, 'Lawn_Grass'),

  glass: (() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#8dbccb',
      roughness: 0.05,
      metalness: 0.4,
      transparent: true,
      opacity: 0.45,
      // Transparent architectural glazing composites over the opaque interiors.
      // It must not occlude later panes by writing into the shared depth buffer.
      depthTest: true,
      depthWrite: false,
      alphaHash: false,
      dithering: false,
      alphaTest: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 1.8,
    });
    m.name = 'Glass_Facade';
    return m;
  })(),

  /* ---------------- Plant / planter palette ----------------
   * Four shared materials cover every plant, pot and planter in the asset.
   * Foliage uses vertex colours for the internal light-to-tip gradient and
   * instance colours for the per-plant tint, so one draw call per variant
   * still reads as many different plants. */

  /** One double-sided foliage material for every leaf blade and lobe. */
  foliage: (() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.86,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    m.name = 'Foliage_Stylised';
    return m;
  })(),
  /** Pottery / planter bodies — tinted per instance from POT_TONES. */
  pottery: std({ color: '#ffffff', roughness: 0.72, metalness: 0.02 }, 'Planter_Pottery'),
  /** Merged trough planter bodies — the tone is baked into vertex colours. */
  planterStone: std({ color: '#ffffff', roughness: 0.84, metalness: 0.02, vertexColors: true }, 'Planter_CastStone'),
  /** Soil / planter liner. */
  soil: std({ color: '#3a2e24', roughness: 0.98, metalness: 0 }, 'Planter_Soil'),
  /** Flower blooms — instance-coloured from FLOWER_TONES. */
  petal: std({ color: '#ffffff', roughness: 0.66, metalness: 0 }, 'Flower_Petals'),
  /** Stems, trunks and branches. */
  bark: std({ color: '#6d5440', roughness: 0.94, metalness: 0 }, 'Plant_Bark'),

  /** Unlit material — per-instance colors give random lit/dim window variety. */
  windows: (() => {
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true });
    m.name = 'Windows_Lit';
    return m;
  })(),

  /** Lit liquor glass — per-instance tints give each bottle its own liquid tone.
   *  vertexColors lets the baked label band read lighter than the glass around it. */
  bottles: (() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.82,
      roughness: 0.12,
      metalness: 0.08,
      envMapIntensity: 1.6,
      vertexColors: true,
    });
    m.name = 'Bottles_LiquorGlass';
    return m;
  })(),

  neonPink: neon('#ff2d95', 2.8, 'Neon_Pink'),
  neonCyan: neon('#1be7ff', 2.6, 'Neon_Cyan'),
  neonAmber: neon('#ffb648', 2.4, 'Neon_Amber'),
  neonViolet: neon('#9b5cff', 2.0, 'Neon_Violet'),
  bulbWarm: neon('#ffd78a', 2.2, 'Bulb_Warm'),
  ledWhite: neon('#fff0d6', 2.4, 'LED_Strip_White'),
  fire: neon('#ff7a1f', 3.0, 'Fire_Glow'),
  interiorGlow: neon('#ffdcb0', 1.1, 'Interior_Glow'),

  wire: (() => {
    const m = new THREE.LineBasicMaterial({ color: '#806044' });
    m.name = 'Festoon_Wire_Bronze';
    return m;
  })(),
};

export type MaterialKey = keyof typeof MAT;

const SCALAR_FIELDS = ['roughness', 'metalness', 'envMapIntensity', 'opacity', 'emissiveIntensity'] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];
type ColorField = 'color' | 'emissive';
type ProfiledMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

export type MaterialProfileValues = Partial<Record<ScalarField, number>> & {
  color?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
};

interface ResolvedProfile {
  colors: Partial<Record<ColorField, THREE.Color>>;
  numbers: Partial<Record<ScalarField, number>>;
}

interface MaterialProfile {
  material: ProfiledMaterial;
  night: ResolvedProfile;
  day: ResolvedProfile;
  /** Which transition curve drives this material; see stageAmount. */
  stage: LightStage;
}

const profiles = new Map<ProfiledMaterial, MaterialProfile>();
const protectedWood = [MAT.wood, MAT.woodLight].map((material) => ({
  material, color: material.color.clone(), roughness: material.roughness,
  metalness: material.metalness, envMapIntensity: material.envMapIntensity, map: material.map,
}));

function resolveProfile(material: ProfiledMaterial, overrides: MaterialProfileValues): ResolvedProfile {
  const surface = material as THREE.MeshStandardMaterial;
  const result: ResolvedProfile = { colors: {}, numbers: {} };
  for (const field of ['color', 'emissive'] as const) {
    if (surface[field]?.isColor) {
      result.colors[field] = overrides[field] === undefined
        ? surface[field].clone()
        : new THREE.Color(overrides[field]);
    }
  }
  for (const field of SCALAR_FIELDS) {
    if (typeof surface[field] === 'number') result.numbers[field] = overrides[field] ?? surface[field];
  }
  return result;
}

function applyProfile(profile: MaterialProfile, amount: number) {
  const surface = profile.material as THREE.MeshStandardMaterial;
  for (const field of ['color', 'emissive'] as const) {
    const night = profile.night.colors[field];
    const day = profile.day.colors[field];
    if (night && day) {
      // Copy at endpoints instead of lerping to guarantee exact night restoration.
      if (amount === 1) surface[field].copy(night);
      else if (amount === 0) surface[field].copy(day);
      else surface[field].lerpColors(day, night, amount);
    }
  }
  for (const field of SCALAR_FIELDS) {
    const night = profile.night.numbers[field];
    const day = profile.day.numbers[field];
    if (night !== undefined && day !== undefined) surface[field] = amount === 1 ? night : day + (night - day) * amount;
  }
}

/** Reuses the same material instance; local materials unregister on unmount. */
export function registerDayMaterial(
  material: ProfiledMaterial,
  dayValues: MaterialProfileValues,
  nightValues: MaterialProfileValues = {},
  stage: LightStage = 'env',
) {
  const night = resolveProfile(material, nightValues);
  const profile: MaterialProfile = {
    material,
    night,
    day: resolveProfile(material, { ...nightValues, ...dayValues }),
    stage,
  };
  profiles.set(material, profile);
  applyProfile(profile, stageAmount[stage](visualNight.value));
  return () => {
    if (profiles.get(material) === profile) profiles.delete(material);
  };
}

// All original material definitions above stay intact. Only the day endpoint is
// refined; the night endpoint is captured before any daytime values are applied.
registerDayMaterial(MAT.concrete, { color: '#d8d4ca', roughness: 0.9, metalness: 0.01, envMapIntensity: 0.3 });
registerDayMaterial(MAT.architecture, { color: '#e5e5e1', roughness: 0.82, envMapIntensity: 0.32 });
registerDayMaterial(MAT.concreteDark, { color: '#3b4149', roughness: 0.81, envMapIntensity: 0.4 });
registerDayMaterial(MAT.darkMetal, { color: '#28313a', roughness: 0.4, metalness: 0.65, envMapIntensity: 0.72 });
registerDayMaterial(MAT.bronze, { roughness: 0.42, metalness: 0.72, envMapIntensity: 0.78 });
registerDayMaterial(MAT.white, { color: '#e2dfd6', roughness: 0.7, metalness: 0.02, envMapIntensity: 0.35 });
registerDayMaterial(MAT.cream, { color: '#dcd7ce', envMapIntensity: 0.35 });
registerDayMaterial(MAT.ground, { color: '#30363c', envMapIntensity: 0.18 });
registerDayMaterial(MAT.plaza, { color: '#515962', envMapIntensity: 0.25 });
registerDayMaterial(MAT.stoneLight, { color: '#b8b6ad', roughness: 0.9, envMapIntensity: 0.25 });
registerDayMaterial(MAT.stoneTrim, { color: '#454c54', envMapIntensity: 0.4 });
registerDayMaterial(MAT.lawn, { color: '#426945', roughness: 0.98, envMapIntensity: 0.2 });
registerDayMaterial(MAT.foliage, { color: '#f2f0e3', roughness: 0.94, envMapIntensity: 0.4 });
registerDayMaterial(MAT.pottery, { color: '#e8e6df', roughness: 0.88, envMapIntensity: 0.28 });
registerDayMaterial(MAT.planterStone, { color: '#e5e3dc', roughness: 0.92, envMapIntensity: 0.3 });
registerDayMaterial(MAT.petal, { color: '#f7f1e5', roughness: 0.83, envMapIntensity: 0.3 });
registerDayMaterial(MAT.glass, {
  color: '#83a3af', roughness: 0.14, metalness: 0.18, opacity: 0.36, envMapIntensity: 1,
}, { opacity: 0.38, envMapIntensity: 1.4 });
registerDayMaterial(MAT.poolGlass, { color: '#51aaba', roughness: 0.14, opacity: 0.46, envMapIntensity: 1 });
registerDayMaterial(MAT.windows, { color: new THREE.Color().setScalar(0.55) });
registerDayMaterial(MAT.bottles, { color: new THREE.Color().setScalar(0.85), roughness: 0.18, envMapIntensity: 1 });
registerDayMaterial(MAT.tvScreen, { emissiveIntensity: 0.1 }, {}, 'early');
registerDayMaterial(MAT.interiorGlow, {
  color: '#9ba5aa', emissive: '#b4c1c6', emissiveIntensity: 0.035, roughness: 0.85,
}, {}, 'early');

// Neon and the facade LED channels are the second wave: they complete the night.
registerDayMaterial(MAT.neonPink, { color: '#22242a', emissiveIntensity: 0, roughness: 0.75 }, {}, 'late');
registerDayMaterial(MAT.neonCyan, { color: '#1e2226', emissiveIntensity: 0, roughness: 0.75 }, {}, 'late');
registerDayMaterial(MAT.neonAmber, { color: '#262420', emissiveIntensity: 0, roughness: 0.75 }, {}, 'late');
registerDayMaterial(MAT.neonViolet, { color: '#232028', emissiveIntensity: 0 }, {}, 'late');
registerDayMaterial(MAT.ledWhite, { color: '#9ba3a7', emissiveIntensity: 0, roughness: 0.78 }, {}, 'late');
// Warm bulbs, pendants and the fire pit come up with the first wave.
registerDayMaterial(MAT.bulbWarm, { color: '#c8c4b8', emissiveIntensity: 0 }, {}, 'early');
registerDayMaterial(MAT.fire, { emissiveIntensity: 0.03 }, {}, 'early');

// MAT.wood and MAT.woodLight are deliberately excluded: colour, roughness,
// metalness, texture and every other wooden-floor material property stay exact.
for (const surface of [MAT.architecture, MAT.concrete, MAT.concreteDark, MAT.darkMetal, MAT.bronze, MAT.ground, MAT.stoneLight]) {
  installDayContactShading(surface);
}

/** Boolean compatibility plus a continuous 0..1 night blend for game-time changes. */
export function applyTimeOfDay(night: boolean | number) {
  setVisualProfile(typeof night === 'boolean' ? (night ? 1 : 0) : night);
  // Each material follows its own curve, so warm interiors arrive before neon.
  for (const profile of profiles.values()) {
    applyProfile(profile, stageAmount[profile.stage](visualNight.value));
  }
}

/** Numeric profile check, used by the development night/day round-trip audit. */
export function verifyNightMaterialValues(): string[] {
  const failures: string[] = [];
  for (const profile of profiles.values()) {
    const material = profile.material as THREE.MeshStandardMaterial;
    for (const field of ['color', 'emissive'] as const) {
      const expected = profile.night.colors[field];
      if (expected && !material[field].equals(expected)) failures.push(`${material.name}.${field}`);
    }
    for (const field of SCALAR_FIELDS) {
      const expected = profile.night.numbers[field];
      if (expected !== undefined && material[field] !== expected) failures.push(`${material.name}.${field}`);
    }
  }
  for (const original of protectedWood) {
    const wood = original.material;
    if (!wood.color.equals(original.color)
      || wood.roughness !== original.roughness
      || wood.metalness !== original.metalness
      || wood.envMapIntensity !== original.envMapIntensity
      || wood.map !== original.map) failures.push(`${wood.name}.protectedWood`);
  }
  return failures;
}
