import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { envNight } from './visualProfiles';
import { calculateLedPanelClip, isWorldVisible } from './ledPanelVisibility';

/**
 * Integrated podium LED walls.
 *
 * Three elevations (rear, west, east) share one ShaderMaterial and live in a
 * single merged geometry: three quads, six triangles, one draw call. There are
 * no physical LED pixels — the pixel pitch is simulated analytically and fades
 * out once a cell drops below the pixel footprint, matching the facade shading.
 *
 * Video playback:
 *
 *  - When playing, each screen renders an embedded YouTube iframe inside a
 *    drei <Html transform> component pinned to its exact display quad, cropped
 *    to its rectangular frame opening. Back-facing and obstructed panels are
 *    hidden without destroying their embeds. The iframe uses standard HTML
 *    parameters (autoplay, mute, loop, playsinline).
 *
 *  - When idle, the 3D meshes show the default procedural wave graphic, which
 *    uses the same cyan (#4ceaff) → violet (#9b52ff) gradient as the column lights.
 */

export const LED_WALL = {
  /** Simulated pixel pitch in metres — ~28 mm. */
  pitch: 0.028,
  /** Standoff of the display plane behind the white frame face. */
  inset: 0.055,
  /** Depth of the recess the screen sits in. */
  recess: 0.12,
  /** Thin perimeter frame; the bottom rail reads as a plinth. */
  frame: 0.26,
  frameBottom: 0.42,
} as const;

const vertexShader = /* glsl */ `
  in vec2 aGrid;
  in float aPanelAspect;
  out vec2 vUv;
  out vec2 vGrid;
  out float vPanelAspect;
  void main() {
    vUv = uv;
    vGrid = aGrid;
    vPanelAspect = aPanelAspect;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  // LOKAM_LED_WALL
  uniform float uTime;
  uniform float uNight;
  in vec2 vUv;
  in vec2 vGrid;
  in float vPanelAspect;
  out vec4 ledFragment;
  #define gl_FragColor ledFragment

  /**
   * Idle display graphic, matched to the facade column lights (cyan #4ceaff →
   * violet #9b52ff) so the screens and the building read as one lighting
   * scheme rather than two unrelated blues.
   */
  vec3 procedural(vec2 uv, float t) {
    float a = sin((uv.x * 1.60 + uv.y * 0.35 - t * 0.060) * 6.2831853);
    float b = sin((uv.x * 2.90 - uv.y * 0.41 + t * 0.041) * 6.2831853 + 1.7);
    float c = sin((uv.x * 0.80 + t * 0.027) * 6.2831853 + 3.1);
    float m = 0.5 + 0.5 * (a * 0.45 + b * 0.30 + c * 0.25);
    vec3 deep = vec3(0.012, 0.045, 0.095);    // deep navy base
    vec3 cyan = vec3(0.298, 0.918, 1.000);    // #4ceaff
    vec3 violet = vec3(0.608, 0.322, 1.000);  // #9b52ff
    vec3 col = mix(deep, cyan, smoothstep(0.08, 0.88, m));
    col = mix(col, violet, smoothstep(0.42, 1.0, m));
    float sweep = exp(-pow((fract(uv.x - t * 0.030) - 0.5) * 3.4, 2.0));
    return col + vec3(0.09, 0.15, 0.19) * sweep;
  }

  void main() {
    vec3 content = procedural(vUv, uTime);

    // Simulated pixel pitch. The gap darkens between cells and disappears
    // smoothly once one cell is no longer resolvable on screen.
    vec2 cell = vUv * vGrid;
    vec2 w = fwidth(cell) * 2.0;
    vec2 d = abs(fract(cell) - 0.5) * 2.0;
    vec2 edge = smoothstep(1.0 - w - 0.20, 1.0 - w, d);
    float grid = clamp(max(edge.x, edge.y), 0.0, 1.0);
    grid *= 1.0 - smoothstep(0.30, 0.85, max(w.x, w.y));
    content *= mix(1.0, 0.58, grid);

    // Daylight: a premium dark display surface that never glows. Night: the
    // graphic at full strength so bloom and the spill lights agree with it.
    float night = clamp(uNight, 0.0, 1.0);
    vec3 offState = vec3(0.026, 0.030, 0.036);
    vec3 day = offState + content * 0.12;
    vec3 lit = content * 1.18;
    vec3 colour = mix(day, lit, night);

    // Faint top-down sheen so the panel reads as glass, not flat paint.
    colour *= 1.0 + 0.05 * (1.0 - vUv.y) * (1.0 - night);
    ledFragment = vec4(max(colour, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createLedWallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Podium_LedWall',
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uNight: envNight,
    },
    toneMapped: false,
    side: THREE.FrontSide,
  });
}

/** Panel orientation and world position. */
export interface LedPanelPlane {
  center: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  ry: number;
  width: number;
  height: number;
}

interface Props {
  geometry: THREE.BufferGeometry;
  panels: LedPanelPlane[];
}

export function LedWallSurface({ geometry, panels }: Props) {
  const material = useMemo(() => createLedWallMaterial(), []);
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    material.uniforms.uTime.value = clock.current;
  });
  useEffect(() => () => material.dispose(), [material]);
  return (
    <>
      <mesh name="Podium_Side_LedWalls" geometry={geometry} material={material} />
      <LedWallVideoPanels panels={panels} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Video state store                                                  */
/* ------------------------------------------------------------------ */

export interface LedWallVideoState {
  videoId: string | null;
  playing: boolean;
  muted: boolean;
  status: string;
  error: string | null;
}

let ledVideoSnapshot: LedWallVideoState = {
  videoId: null, playing: false, muted: true, status: '', error: null,
};
const ledVideoListeners = new Set<() => void>();
export const getLedWallVideo = () => ledVideoSnapshot;
export const subscribeLedWallVideo = (listener: () => void) => {
  ledVideoListeners.add(listener);
  return () => { ledVideoListeners.delete(listener); };
};
function emitLedVideo() {
  for (const listener of ledVideoListeners) listener();
}
export function setLedWallVideo(patch: Partial<LedWallVideoState>) {
  ledVideoSnapshot = { ...ledVideoSnapshot, ...patch };
  emitLedVideo();
}

/** Accepts a bare 11-character ID or any youtube.com / youtu.be URL form. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s.includes('://') ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split(/[?#/]/)[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
        const id = parts[1].split(/[?#]/)[0];
        if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const LED_VIDEO_PRESETS = [
  { label: 'Big Buck Bunny', id: 'aqz-KE-bpKQ' },
  { label: 'Nature 4K', id: 'LXb3EKWsInQ' },
  { label: 'Lofi', id: '5qap5aO4i9A' },
] as const;

export async function playLedWallVideo(input: string): Promise<boolean> {
  const youtubeId = parseYouTubeId(input);
  if (!youtubeId) {
    setLedWallVideo({ error: 'Enter a valid YouTube video URL or 11-character ID.' });
    return false;
  }
  setLedWallVideo({
    videoId: youtubeId,
    playing: true,
    error: null,
    status: 'Playing on all three LED walls.',
  });
  return true;
}

export function stopLedWallVideo() {
  setLedWallVideo({ videoId: null, playing: false, status: '', error: null });
}

export function setLedWallMuted(muted: boolean) {
  setLedWallVideo({ muted });
}

/* ------------------------------------------------------------------ */
/*  drei <Html transform> 3D-pinned video panels                       */
/* ------------------------------------------------------------------ */

// Distance factor: 1 meter in 3D = (400 / distanceFactor) px in HTML.
// With factor = 4, 1m = 100px.
const DF = 4;
const VIDEO_LIFT = 0.015;
// Deliberately exclude the LED quads and their backing from occlusion targets.
// Raycasting just these opaque meshes avoids testing the instanced greenery.
const VIDEO_OCCLUDERS = new Set([
  'Frame_White_Concrete', 'Facade_Core_Dark', 'Lobby_Interior_White',
  'Podium_LedFrames', 'Entrance_Portal_Concrete', 'Entrance_Canopy_Dark',
]);

function LedWallSinglePanel({ panel, videoId, muted, index }: { panel: LedPanelPlane; videoId: string; muted: boolean; index: number }) {
  const { scene } = useThree();
  const mount = useRef<THREE.Group>(null);
  const content = useRef<HTMLDivElement>(null);
  const occluded = useRef(false);
  const visibility = useRef({ visible: false, clip: '' });
  const blockers = useMemo<RefObject<THREE.Object3D>[]>(() => [], []);
  const occluders = useMemo<RefObject<THREE.Object3D>[]>(() => [], []);
  const scratch = useMemo(() => ({
    inverse: new THREE.Matrix4(),
    camera: new THREE.Vector3(),
    localCamera: new THREE.Vector3(),
    clip: { visible: false, top: 0, right: 0, bottom: 0, left: 0 },
  }), []);

  useLayoutEffect(() => {
    blockers.length = 0;
    scene.traverse((object) => {
      if (VIDEO_OCCLUDERS.has(object.name)) blockers.push({ current: object });
    });
    return () => { blockers.length = 0; occluders.length = 0; };
  }, [scene, blockers, occluders]);

  useFrame(({ camera }) => {
    const group = mount.current;
    const element = content.current;
    if (!group || !element) return;
    group.updateWorldMatrix(true, false);
    camera.getWorldPosition(scratch.camera);
    scratch.inverse.copy(group.matrixWorld).invert();
    scratch.localCamera.copy(scratch.camera).applyMatrix4(scratch.inverse);
    // A negative local Z is the far/back face, even if its HTML portal was
    // visible through the building before. No arbitrary 75-degree fade cutoff.
    const clip = calculateLedPanelClip(scratch.localCamera, panel.width, panel.height,
      LED_WALL.inset - VIDEO_LIFT, scratch.clip);
    const facing = clip.visible && isWorldVisible(group);
    occluders.length = 0;
    if (facing) {
      for (const blocker of blockers) {
        if (isWorldVisible(blocker.current)) occluders.push(blocker);
      }
    }
    const visible = facing && !occluded.current;
    if (visible !== visibility.current.visible) {
      element.style.opacity = visible ? '1' : '0';
      visibility.current.visible = visible;
    }
    if (visible) {
      const inset = `inset(${clip.top.toFixed(4)}% ${clip.right.toFixed(4)}% ${clip.bottom.toFixed(4)}% ${clip.left.toFixed(4)}%)`;
      if (inset !== visibility.current.clip) {
        element.style.clipPath = inset;
        visibility.current.clip = inset;
      }
    }
  });

  const pxWidth = Math.round(panel.width * 100);
  const pxHeight = Math.round(panel.height * 100);
  // 16:9 video width needed to cover this panel's height:
  const iframeWidth = Math.max(pxWidth, Math.round(pxHeight * (16 / 9)));
  const iframeHeight = Math.max(pxHeight, Math.round(pxWidth * (9 / 16)));

  // Use the standard embed domain; mute=1 is required for autoplay in all modern browsers.
  // The first panel (index 0) unmutes when the user un-mutes, so audio is single-source.
  const isAudioLeader = index === 0;
  const isMuted = muted || !isAudioLeader;
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${videoId}&controls=0&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3&fs=0&disablekb=1`;

  // Still recessed behind the white perimeter, exactly at the video-plane size.
  const pos: [number, number, number] = [
    panel.center.x + panel.normal.x * VIDEO_LIFT,
    panel.center.y,
    panel.center.z + panel.normal.z * VIDEO_LIFT,
  ];

  return (
    <group ref={mount} position={pos} rotation={[0, panel.ry, 0]}>
      <Html
        transform
        distanceFactor={DF}
        occlude={occluders}
        onOcclude={(hidden) => {
          occluded.current = hidden;
          if (hidden && content.current) {
            content.current.style.opacity = '0';
            visibility.current.visible = false;
          }
        }}
        zIndexRange={[4, 0]}
        pointerEvents="none"
        wrapperClass="led-wall-video"
        style={{ pointerEvents: 'none', backfaceVisibility: 'hidden' }}
      >
        <div
          ref={content}
          style={{
            width: `${pxWidth}px`,
            height: `${pxHeight}px`,
            overflow: 'hidden',
            clipPath: 'inset(0)',
            contain: 'layout paint',
            backfaceVisibility: 'hidden',
            opacity: 0,
            position: 'relative',
            background: '#05070d',
            pointerEvents: 'none',
          }}
        >
          <iframe
            src={src}
            title={`LED_Panel_${index}`}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${iframeWidth}px`,
              height: `${iframeHeight}px`,
              border: 0,
              pointerEvents: 'none',
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      </Html>
    </group>
  );
}

function LedWallVideoPanels({ panels }: { panels: LedPanelPlane[] }) {
  const { videoId, playing, muted } = useSyncExternalStore(subscribeLedWallVideo, getLedWallVideo, getLedWallVideo);
  if (!playing || !videoId) return null;
  return (
    <group name="LedWall_Video_Panels">
      {panels.map((panel, i) => (
        <LedWallSinglePanel
          key={`${panel.ry}-${videoId}-${muted ? 'm' : 'u'}`}
          panel={panel}
          videoId={videoId}
          muted={muted}
          index={i}
        />
      ))}
    </group>
  );
}
