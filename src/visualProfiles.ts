/** Night values are the pre-refinement setup. Day can be tuned independently. */
export const VISUAL_PROFILES = {
  night: {
    background: '#070912',
    exposure: 1,
    sunPosition: [-45, 60, -30] as [number, number, number],
    sunColor: '#9fb4ff',
    sunIntensity: 0.9,
    skyColor: '#2a3a6a',
    groundColor: '#0a0a12',
    skyIntensity: 0.55,
    environmentIntensity: 1,
    fogNear: 130,
    fogFar: 320,
    shadowFar: 190,
    normalBias: 0.06,
    bloomIntensity: 0.95,
  },
  day: {
    background: '#b3c7d5',
    exposure: 0.86,
    sunPosition: [65, 58, 35] as [number, number, number],
    sunColor: '#fff4e6',
    sunIntensity: 2.65,
    skyColor: '#bacbdc',
    groundColor: '#746c61',
    skyIntensity: 0.38,
    environmentIntensity: 0.8,
    fogNear: 210,
    fogFar: 470,
    shadowFar: 220,
    normalBias: 0.045,
    bloomIntensity: 0.06,
  },
} as const;

// Shared scalar uniforms: every shader follows the same transition, no React
// rerender or material duplication per frame. Endpoints snap to exactly 0/1.
/** Raw travel through the transition, 0 = day target, 1 = night target. */
export const visualNight = { value: 1 };
export const visualDay = { value: 0 };
/** Sky, sun, fog and exposure reach their night state early, so lights come up on dusk. */
export const envNight = { value: 1 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Staged ramps off the single travel value. All three are exactly 0 at day and
 * exactly 1 at night, so the settled night profile is identical to before — only
 * the path through the transition is staged.
 *
 *   0.00 → 0.48  sky darkens, sun sets, exposure drops
 *   0.25 → 0.62  a few warm lights come up during dusk
 *   0.55 → 1.00  the rest — neon, facade LEDs, site lights — follows
 */
export const stageAmount = {
  env: (n: number) => smooth(0, 0.48, n),
  early: (n: number) => smooth(0.25, 0.62, n),
  late: (n: number) => smooth(0.55, 1, n),
} as const;

export type LightStage = 'env' | 'early' | 'late';

export const TRANSITION_SPEEDS = [
  { id: 'slow', label: 'Slow', seconds: 10 },
  { id: 'medium', label: 'Medium', seconds: 6.5 },
  { id: 'fast', label: 'Fast', seconds: 3 },
] as const;

/** UI-owned; written before the frame loop reads it, so no scene rerender. */
export const transitionSettings = { fade: true, speed: 'medium' };

export function setVisualProfile(amount: number) {
  visualNight.value = Math.max(0, Math.min(1, amount));
  visualDay.value = 1 - visualNight.value;
  envNight.value = stageAmount.env(visualNight.value);
}

export function stepVisualProfile(night: boolean, dt: number) {
  const target = night ? 1 : 0;
  if (!transitionSettings.fade) {
    setVisualProfile(target);
    return;
  }
  const seconds = TRANSITION_SPEEDS.find((s) => s.id === transitionSettings.speed)?.seconds ?? 6.5;
  // Linear travel keeps the staged curves firing at predictable times.
  const step = Math.min(Math.max(dt, 0), 0.1) / seconds;
  let next = visualNight.value;
  if (next < target) next = Math.min(target, next + step);
  else if (next > target) next = Math.max(target, next - step);
  setVisualProfile(next);
}

interface LocalLightProfile {
  night: number;
  day: number;
  stage: LightStage;
}

/**
 * Existing point lights only; positions and complete night output stay put.
 * `stage` decides WHEN a light joins the transition:
 *   early — the warm, occupied spaces that come up first as dusk settles
 *   late  — signage, feature and site lighting that completes the night
 */
export const LOCAL_LIGHT_PROFILES: Record<string, LocalLightProfile> = {
  PL_Lobby: { night: 20, day: 0.8, stage: 'early' },
  PL_Terrace: { night: 22, day: 0.8, stage: 'early' },
  PL_Entrance: { night: 34, day: 0.6, stage: 'early' },
  PL_Bar_Warm: { night: 30, day: 0.6, stage: 'early' },
  PL_Dining_Warm: { night: 22, day: 0.5, stage: 'early' },
  PL_Pavilion: { night: 16, day: 0.7, stage: 'early' },
  PL_FirePit: { night: 13, day: 0.25, stage: 'early' },
  PL_Sign_Pink: { night: 34, day: 0, stage: 'late' },
  PL_Stage: { night: 18, day: 0.4, stage: 'late' },
  PL_Pool_Cyan: { night: 16, day: 0.25, stage: 'late' },
  PL_Parking_West: { night: 95, day: 0, stage: 'late' },
  PL_Parking_East: { night: 95, day: 0, stage: 'late' },
  PL_Screen_Left: { night: 10, day: 0, stage: 'late' },
  PL_Screen_Right: { night: 10, day: 0, stage: 'late' },
  // Subtle pavement spill from the two side LED walls. Off in daylight, and
  // deliberately weaker than the entrance so the screens never dominate.
  PL_LedWall_West: { night: 26, day: 0, stage: 'late' },
  PL_LedWall_East: { night: 26, day: 0, stage: 'late' },
};
