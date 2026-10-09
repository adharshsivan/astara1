import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode, type BloomEffect } from 'postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Building, type LayerState } from './Building';
import { applyTimeOfDay, verifyNightMaterialValues } from './materials';
import { InteriorMotionQA } from './MotionQA';
import { getMotionQA } from './motionState';
import {
  LOCAL_LIGHT_PROFILES,
  VISUAL_PROFILES,
  envNight,
  stageAmount,
  stepVisualProfile,
  visualNight,
} from './visualProfiles';

/* ---------------- Camera presets ---------------- */

export const VIEWS = {
  overview: { pos: [58, 40, 62], target: [0, 16, 2], label: 'Overview' },
  rooftop: { pos: [22, 70, 58], target: [0, 36, 7], label: 'Sky terrace' },
  front: { pos: [16, 46, 43], target: [0, 35.4, 19.4], label: 'Infinity pool' },
  bar: { pos: [0, 38.5, 13], target: [9, 36.8, 2.5], label: 'Rooftop bar' },
  lounge: { pos: [-2, 41, 27], target: [-9, 36.4, 13], label: 'Lounge' },
  stage: { pos: [3.5, 41, 2], target: [3.5, 36.6, 13.4], label: 'Stage' },
  cafe: { pos: [8, 39, 2], target: [1, 37.5, -7], label: 'Café pavilion' },
  cafeDoor: { pos: [4.5, 38.6, 4.5], target: [2.5, 37.1, -3.2], label: 'Café slider' },
  sign: { pos: [2.5, 41.5, 8], target: [2.5, 40.3, -2.5], label: 'Megham LED' },
  entrance: { pos: [22, 11, 43], target: [0, 4, 20], label: 'Entrance & forecourt' },
  hall: { pos: [0, 3.2, 8.5], target: [0, 4, -12], label: 'Inside hall' },
  screens: { pos: [0, 6.5, 38.5], target: [0, 3.5, 20], label: 'Entrance screens' },
  podiumRoof: { pos: [28, 22, 42], target: [0, 10, 8], label: 'Podium roof' },
  podiumRear: { pos: [-32, 6.5, -22], target: [-2, 2.6, -14], label: 'Podium rear wall' },
  ledWall: { pos: [38, 7.5, 18], target: [17, 4.4, 0], label: 'Side LED wall' },
  parking: { pos: [66, 44, 59], target: [8, 2, 8], label: 'Site & parking' },
  sitePlan: { pos: [0, 143, 26], target: [0, 0, 10], label: 'Site plan' },
} as const;
export type ViewId = keyof typeof VIEWS;

interface SceneProps {
  night: boolean;
  doorOpen: boolean;
  bloom: boolean;
  autoRotate: boolean;
  layers: LayerState;
  view: { id: ViewId; nonce: number };
  onStats: (s: { calls: number; triangles: number }) => void;
  onReady: (root: THREE.Group) => void;
}

function CameraRig({
  view,
  controls,
}: {
  view: SceneProps['view'];
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const anim = useRef({ active: false, pos: new THREE.Vector3(), target: new THREE.Vector3(), t: 0 });

  useEffect(() => {
    const v = VIEWS[view.id];
    anim.current.pos.set(v.pos[0], v.pos[1], v.pos[2]);
    anim.current.target.set(v.target[0], v.target[1], v.target[2]);
    anim.current.active = true;
    anim.current.t = 0;
  }, [view]);

  useFrame((_, dt) => {
    const a = anim.current;
    const c = controls.current;
    if (getMotionQA().running) return;
    if (!a.active || !c) return;
    a.t += dt;
    const k = 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(a.pos, k);
    c.target.lerp(a.target, k);
    c.update();
    if (camera.position.distanceTo(a.pos) < 0.05 && c.target.distanceTo(a.target) < 0.05) a.active = false;
    if (a.t > 4) a.active = false;
  });

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => (anim.current.active = false);
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [controls]);

  return null;
}

function StatsProbe({ onStats }: { onStats: SceneProps['onStats'] }) {
  const { gl } = useThree();
  const frame = useRef(0);
  useFrame(() => {
    frame.current++;
    if (frame.current % 30 === 0) onStats({ calls: gl.info.render.calls, triangles: gl.info.render.triangles });
  });
  return null;
}

function RendererSetup({ bloom, night }: { bloom: boolean; night: boolean }) {
  const { gl, scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const localLights = useRef<THREE.PointLight[]>([]);
  const initialized = useRef(false);
  const palette = useMemo(() => ({
    background: new THREE.Color(),
    nightBackground: new THREE.Color(VISUAL_PROFILES.night.background),
    dayBackground: new THREE.Color(VISUAL_PROFILES.day.background),
    nightSun: new THREE.Color(VISUAL_PROFILES.night.sunColor),
    daySun: new THREE.Color(VISUAL_PROFILES.day.sunColor),
    nightSky: new THREE.Color(VISUAL_PROFILES.night.skyColor),
    daySky: new THREE.Color(VISUAL_PROFILES.day.skyColor),
    nightGround: new THREE.Color(VISUAL_PROFILES.night.groundColor),
    dayGround: new THREE.Color(VISUAL_PROFILES.day.groundColor),
    nightSunPosition: new THREE.Vector3(...VISUAL_PROFILES.night.sunPosition),
    daySunPosition: new THREE.Vector3(...VISUAL_PROFILES.day.sunPosition),
    fog: new THREE.Fog(VISUAL_PROFILES.night.background, 130, 320),
  }), []);

  useLayoutEffect(() => {
    gl.toneMapping = bloom ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    if (!initialized.current) {
      // A cheap numeric round trip catches leaked day material parameters.
      applyTimeOfDay(1);
      applyTimeOfDay(0);
      applyTimeOfDay(1);
      const failures = verifyNightMaterialValues();
      if (failures.length) throw new Error(`Night profile restoration failed: ${failures.join(', ')}`);
      scene.userData.visualProfileAudit = { nightMaterialRoundTrip: 'passed' };
      applyTimeOfDay(night);
      initialized.current = true;
    }
    localLights.current = [];
    scene.traverse((object) => {
      if ((object as THREE.PointLight).isPointLight && LOCAL_LIGHT_PROFILES[object.name]) {
        localLights.current.push(object as THREE.PointLight);
      }
    });
    scene.background = palette.background;
    scene.fog = palette.fog;
  }, [gl, scene, palette, bloom, night]);

  useFrame((_, dt) => {
    stepVisualProfile(night, dt);
    const n = visualNight.value;
    // The environment reaches its night state early, so the sky settles into
    // dusk BEFORE the staged lights begin — that is what makes the sequence read.
    const e = envNight.value;
    const day = VISUAL_PROFILES.day;
    const evening = VISUAL_PROFILES.night;
    const mix = (d: number, v: number) => e === 1 ? v : e === 0 ? d : THREE.MathUtils.lerp(d, v, e);
    const color = (target: THREE.Color, d: THREE.Color, v: THREE.Color) => {
      if (e === 1) target.copy(v);
      else if (e === 0) target.copy(d);
      else target.lerpColors(d, v, e);
    };
    applyTimeOfDay(n);
    gl.toneMappingExposure = mix(day.exposure, evening.exposure);
    color(palette.background, palette.dayBackground, palette.nightBackground);
    palette.fog.color.copy(palette.background);
    palette.fog.near = mix(day.fogNear, evening.fogNear);
    palette.fog.far = mix(day.fogFar, evening.fogFar);
    // Fade the single offline reflection capture slightly at the midpoint. The
    // map swaps there once, not every frame; no pair of full-size cubemaps is kept.
    const environmentFade = 0.62 + 0.38 * THREE.MathUtils.smoothstep(Math.abs(e - 0.5), 0, 0.35);
    scene.environmentIntensity = mix(day.environmentIntensity, evening.environmentIntensity) * environmentFade;
    if (sun.current) {
      sun.current.position.lerpVectors(palette.daySunPosition, palette.nightSunPosition, e);
      color(sun.current.color, palette.daySun, palette.nightSun);
      sun.current.intensity = mix(day.sunIntensity, evening.sunIntensity);
      sun.current.shadow.normalBias = mix(day.normalBias, evening.normalBias);
      const camera = sun.current.shadow.camera;
      const far = mix(day.shadowFar, evening.shadowFar);
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    }
    if (sky.current) {
      color(sky.current.color, palette.daySky, palette.nightSky);
      color(sky.current.groundColor, palette.dayGround, palette.nightGround);
      sky.current.intensity = mix(day.skyIntensity, evening.skyIntensity);
    }
    for (const light of localLights.current) {
      const profile = LOCAL_LIGHT_PROFILES[light.name];
      // Each light joins on its own curve: a few first, the rest after.
      const amount = stageAmount[profile.stage](n);
      light.intensity = profile.day + (profile.night - profile.day) * amount;
    }
  }, -2);

  return (
    <>
      <hemisphereLight ref={sky} args={['#2a3a6a', '#0a0a12', 0.55]} />
      <directionalLight
        ref={sun}
        position={VISUAL_PROFILES.night.sunPosition}
        intensity={0.9}
        color="#9fb4ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-40}
        shadow-camera-near={5}
        shadow-camera-far={190}
        shadow-bias={-0.0002}
        shadow-normalBias={0.06}
      />
    </>
  );
}

function ProfileBloom() {
  const ref = useRef<BloomEffect>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = THREE.MathUtils.lerp(
      VISUAL_PROFILES.day.bloomIntensity, VISUAL_PROFILES.night.bloomIntensity, envNight.value,
    );
  }, -1);
  return <Bloom ref={ref} luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.95} mipmapBlur radius={0.65} />;
}

function ProfileEnvironment({ night }: { night: boolean }) {
  const [captureNight, setCaptureNight] = useState(night);
  useFrame(() => {
    if (captureNight && envNight.value < 0.42) setCaptureNight(false);
    else if (!captureNight && envNight.value > 0.58) setCaptureNight(true);
  }, -1);
  return (
    <Environment resolution={128} frames={1} key={captureNight ? 'n' : 'd'}>
      {captureNight ? (
        <>
          <Lightformer intensity={0.9} color="#5a74ff" position={[0, 30, 0]} scale={[80, 80, 1]} rotation-x={Math.PI / 2} />
          <Lightformer intensity={2.2} color="#ff5fb0" position={[-25, 8, -18]} scale={[14, 5, 1]} />
          <Lightformer intensity={2.0} color="#3fe3ff" position={[26, 7, 12]} scale={[12, 5, 1]} />
          <Lightformer intensity={1.5} color="#ffb070" position={[10, 5, 28]} scale={[16, 4, 1]} />
        </>
      ) : (
        <>
          <Lightformer intensity={1.05} color="#dbe5ee" position={[0, 40, 0]} scale={[100, 100, 1]} rotation-x={Math.PI / 2} />
          <Lightformer intensity={0.5} color="#bfd2e3" position={[-30, 12, -18]} scale={[30, 14, 1]} />
          <Lightformer intensity={0.45} color="#f4e6d3" position={[30, 9, 20]} scale={[28, 12, 1]} />
        </>
      )}
    </Environment>
  );
}

function ReadyProbe({
  target,
  onReady,
}: {
  target: React.RefObject<THREE.Group | null>;
  onReady: SceneProps['onReady'];
}) {
  useEffect(() => {
    if (target.current) onReady(target.current);
  }, [target, onReady]);
  return null;
}

export function Scene({ night, doorOpen, bloom, autoRotate, layers, view, onStats, onReady }: SceneProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const building = useRef<THREE.Group | null>(null);

  return (
    <>
      <RendererSetup bloom={bloom} night={night} />
      <ReadyProbe target={building} onReady={onReady} />
      <StatsProbe onStats={onStats} />

      {night && <Stars radius={220} depth={80} count={2200} factor={3.4} saturation={0} fade speed={0.4} />}

      <ProfileEnvironment night={night} />

        <Building ref={building} night={night} doorOpen={doorOpen} layers={layers} />

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={4}
        maxDistance={190}
        target={[0, 16, 2]}
      />
      <CameraRig view={view} controls={controls} />
      <InteriorMotionQA controls={controls} />

      {bloom && (
        <EffectComposer multisampling={4}>
          <ProfileBloom />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
