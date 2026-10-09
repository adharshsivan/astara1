import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { stageAmount, visualNight } from './visualProfiles';

/**
 * Animated facade lighting for the MAIN VERTICAL COLUMN STRIP LIGHTS only.
 *
 * These are the tall LED bars set into the major structural facade columns.
 * Everything else that uses MAT.ledWhite — wall pier channels, the ASTARA
 * rules, balcony soffits — is deliberately untouched and keeps its static
 * material.
 *
 * Cost: one ShaderMaterial shared by all 16 strips (one draw call), driven by
 * a handful of uniforms. No lights, no textures, no per-strip materials.
 */

/* ------------------------------------------------------------------ */
/*  Options                                                            */
/* ------------------------------------------------------------------ */

export const COLUMN_EFFECTS = [
  { id: 0, label: 'Static' },
  { id: 1, label: 'Gradient Flow' },
  { id: 2, label: 'Bottom → Top Fill' },
  { id: 3, label: 'Top → Bottom Fill' },
  { id: 4, label: 'Center Out' },
  { id: 5, label: 'Soft Pulse' },
  { id: 6, label: 'Slow Wave' },
] as const;

export const COLUMN_COLORS = [
  { id: 'warm', label: 'Warm White', a: '#fff2d8', b: '#ffdcaa' },
  { id: 'cool', label: 'Cool White', a: '#eef5ff', b: '#c6dcff' },
  { id: 'cyan', label: 'Cyan / Blue', a: '#4ceaff', b: '#2f6dff' },
  { id: 'violet', label: 'Blue / Violet', a: '#2f6dff', b: '#9b52ff' },
  { id: 'pink', label: 'Pink / Violet', a: '#ff62c2', b: '#8f4dff' },
  { id: 'custom', label: 'Custom Gradient', a: '#4ceaff', b: '#9b52ff' },
] as const;

export const COLUMN_SPEEDS = [
  { id: 'slow', label: 'Slow', value: 0.34 },
  { id: 'medium', label: 'Medium', value: 0.72 },
  { id: 'fast', label: 'Fast', value: 1.18 },
] as const;

export const COLUMN_INTENSITIES = [
  { id: 'low', label: 'Low', value: 1.3 },
  { id: 'medium', label: 'Medium', value: 2.05 },
  { id: 'high', label: 'High', value: 2.85 },
] as const;

export interface ColumnLightState {
  effect: number;
  color: string;
  colorA: string;
  colorB: string;
  speed: string;
  intensity: string;
  animate: boolean;
}

/** Mutable settings store — read every frame, so the UI never re-renders the scene. */
export const columnLight: ColumnLightState = {
  effect: 1,
  // Default is the subtle cyan -> blue -> violet ramp described in the brief.
  color: 'custom',
  colorA: '#4ceaff',
  colorB: '#9b52ff',
  speed: 'slow',
  intensity: 'medium',
  animate: true,
};

/* ------------------------------------------------------------------ */
/*  Shader                                                             */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  uniform float uSpanY0;
  uniform float uSpanY1;
  varying float vY;
  varying float vPhase;

  void main() {
    vY = clamp((position.y - uSpanY0) / max(uSpanY1 - uSpanY0, 0.001), 0.0, 1.0);
    // Coarse per-column bucket: neighbouring columns drift a little out of step
    // without needing per-instance attributes. Buckets are 2 m wide and every
    // strip sits at least 0.5 m off a boundary, so the id is stable.
    vPhase = floor((position.x + 1.0) * 0.5) * 0.37 + floor((position.z + 1.0) * 0.5) * 0.61;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uEffect;
  uniform float uEffectPrev;
  uniform float uBlend;
  uniform float uIntensity;
  uniform float uAnim;
  uniform float uNight;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying float vY;
  varying float vPhase;

  const float PI = 3.14159265;

  /** Where along the column the A->B colour ramp sits for a given effect. */
  float shapeOf(float id, float y, float t, float ph) {
    if (id < 0.5) return y;
    if (id < 1.5) return 0.5 + 0.5 * sin((y - t) * 2.0 * PI + ph);
    if (id < 4.5) return y;
    return 0.5 + 0.5 * sin((y * 1.7 - t) * 2.0 * PI + ph);
  }

  /** A soft travelling band: long fade below, quick cut above. */
  float fillBand(float y, float head) {
    float d = y - head;
    return smoothstep(-0.36, -0.03, d) * (1.0 - smoothstep(0.0, 0.12, d));
  }

  /** How brightly the strip is lit at this height. */
  float maskOf(float id, float y, float t, float ph) {
    if (id < 0.5) return 1.0;
    if (id < 1.5) return 0.72 + 0.28 * (0.5 + 0.5 * sin((y - t) * 2.0 * PI + ph));
    // Head travels -0.37 -> 1.37 so the loop never shows a seam.
    if (id < 2.5) return fillBand(y, fract(t * 0.17) * 1.74 - 0.37 + ph * 0.1) * 1.35;
    if (id < 3.5) return fillBand(y, 1.0 - (fract(t * 0.17) * 1.74 - 0.37) + ph * 0.1) * 1.35;
    if (id < 4.5) {
      float d = abs(y - 0.5) * 2.0;
      return smoothstep(1.12, 0.02, d) * (0.6 + 0.4 * (0.5 + 0.5 * sin(t * 1.05 + ph)));
    }
    if (id < 5.5) return 0.52 + 0.48 * (0.5 + 0.5 * sin(t * 0.8 + ph * 0.6));
    return 0.7 + 0.3 * (0.5 + 0.5 * sin((y * 1.7 - t) * 2.0 * PI));
  }

  void main() {
    float y = vY;
    float t = uTime;

    float g = mix(shapeOf(uEffectPrev, y, t, vPhase), shapeOf(uEffect, y, t, vPhase), uBlend);
    float m = mix(maskOf(uEffectPrev, y, t, vPhase), maskOf(uEffect, y, t, vPhase), uBlend);

    // Animation Off settles to a plain vertical ramp at full brightness.
    g = mix(y, g, uAnim);
    m = mix(1.0, m, uAnim);

    vec3 col = mix(uColorA, uColorB, clamp(g, 0.0, 1.0));
    // Daylight: the bar reads as a neutral unlit diffuser rather than a
    // coloured light source, and drops well below its night output.
    col = mix(vec3(0.70, 0.72, 0.75), col, mix(0.22, 1.0, uNight));
    vec3 emis = col * clamp(m, 0.0, 1.6) * uIntensity;
    emis *= mix(0.16, 1.0, uNight);
    // In daylight the fixture is a neutral diffuser, independent of the selected
    // effect, phase and intensity. At night the original output is untouched.
    emis = mix(vec3(0.29, 0.32, 0.35), emis, uNight);

    gl_FragColor = vec4(emis, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/*  Material + per-frame update                                        */
/* ------------------------------------------------------------------ */

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

export function createColumnLightMaterial(geometry: THREE.BufferGeometry): THREE.ShaderMaterial {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  return new THREE.ShaderMaterial({
    name: 'Facade_ColumnStrip_Animated',
    vertexShader,
    fragmentShader,
    uniforms: {
      uSpanY0: { value: box.min.y },
      uSpanY1: { value: box.max.y },
      uTime: { value: 0 },
      uEffect: { value: columnLight.effect },
      uEffectPrev: { value: columnLight.effect },
      uBlend: { value: 1 },
      uIntensity: { value: 2.05 },
      uAnim: { value: 1 },
      uNight: { value: 1 },
      uColorA: { value: new THREE.Color('#4ceaff') },
      uColorB: { value: new THREE.Color('#9b52ff') },
    },
    toneMapped: false,
    side: THREE.FrontSide,
  });
}

/**
 * Eases every uniform toward its target so effect, colour, speed and intensity
 * all cross-fade instead of snapping. The scene's shared profile drives night.
 */
export function updateColumnLight(
  material: THREE.ShaderMaterial,
  dt: number,
  speedRef: { current: number },
) {
  const u = material.uniforms;
  const s = columnLight;
  const preset = COLUMN_COLORS.find((c) => c.id === s.color) ?? COLUMN_COLORS[2];
  const a = s.color === 'custom' ? s.colorA : preset.a;
  const b = s.color === 'custom' ? s.colorB : preset.b;
  tmpA.set(a);
  tmpB.set(b);

  const targetSpeed = (COLUMN_SPEEDS.find((v) => v.id === s.speed) ?? COLUMN_SPEEDS[1]).value;
  const targetIntensity = (COLUMN_INTENSITIES.find((v) => v.id === s.intensity) ?? COLUMN_INTENSITIES[1]).value;

  const step = Math.min(dt, 0.05);
  const k = 1 - Math.exp(-step * 3.2);
  const kSlow = 1 - Math.exp(-step * 1.1);

  (u.uColorA.value as THREE.Color).lerp(tmpA, k);
  (u.uColorB.value as THREE.Color).lerp(tmpB, k);
  u.uIntensity.value += (targetIntensity - u.uIntensity.value) * kSlow;
  u.uAnim.value += ((s.animate ? 1 : 0) - u.uAnim.value) * k;
  // The column strips are architectural signage: they join the second wave.
  u.uNight.value = stageAmount.late(visualNight.value);
  speedRef.current += (targetSpeed - speedRef.current) * k;

  // Effect changes cross-fade: keep the old program live until the blend ends.
  if (u.uEffect.value !== s.effect) {
    u.uEffectPrev.value = u.uEffect.value;
    u.uEffect.value = s.effect;
    u.uBlend.value = 0;
  }
  u.uBlend.value = Math.min(1, u.uBlend.value + step * 1.15);

  u.uTime.value += step * speedRef.current * 0.3;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ColumnLightStrips({ geometry }: { geometry: THREE.BufferGeometry; night: boolean }) {
  const material = useMemo(() => createColumnLightMaterial(geometry), [geometry]);
  const speed = useRef(0.34);

  useFrame((_, dt) => updateColumnLight(material, dt, speed));
  useEffect(() => () => material.dispose(), [material]);

  // Same mesh name as before, so glTF exports and any lookup stay intact.
  return <mesh name="Facade_LED_Strips" geometry={geometry} material={material} />;
}
