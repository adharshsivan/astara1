import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three-stdlib';
import { getMotionQA, stopMotionQA, updateMotionQA } from './motionState';
import { runInteriorValidation } from './validation';
import type { InteriorAudit } from './units';

const PHASES = ['Parallel facade walk', 'Full building orbit', 'Approach / retreat / LOD', 'Grazing-angle sweep'];
const PHASE_SECONDS = 12;
const TOTAL = PHASES.length * PHASE_SECONDS;

function pose(time: number, position: THREE.Vector3, target: THREE.Vector3) {
  const index = Math.min(3, Math.floor(time / PHASE_SECONDS));
  const t = (time - index * PHASE_SECONDS) / PHASE_SECONDS;
  const ease = t * t * (3 - 2 * t);
  if (index === 0) {
    const x = -18 + 36 * ease;
    position.set(x, 18.6, 19);
    target.set(x, 18.6, 9.7);
  } else if (index === 1) {
    const a = Math.PI / 2 + Math.PI * 2 * ease;
    position.set(52 * Math.cos(a), 23, 52 * Math.sin(a));
    target.set(0, 19, 0);
  } else if (index === 2) {
    const zoom = Math.sin(Math.PI * t) ** 2;
    position.set(-5.675, 18.6, 17.5 + zoom * 130);
    target.set(-5.675, 18.6, 9.7);
  } else {
    position.set(-38 + 76 * ease, 18.6, 12.8 + Math.sin(Math.PI * t) * 1.5);
    target.set(-5.675, 18.6, 9.7);
  }
  return index;
}

/** Debug-only camera motion and measurements. Idle mode does no work or rendering. */
export function InteriorMotionQA({ controls }: { controls: RefObject<OrbitControls | null> }) {
  const { camera, gl, scene } = useThree();
  const runtime = useRef({
    active: false, run: 0, elapsed: 0, updateAt: 0, frames: 0, sum: 0, max: 0,
    savedPosition: new THREE.Vector3(), savedTarget: new THREE.Vector3(),
    position: new THREE.Vector3(), target: new THREE.Vector3(),
    transitionPosition: new THREE.Vector3(), transitionTarget: new THREE.Vector3(), phase: -1,
    enabled: true, damping: true, orbit: false, recorder: null as MediaRecorder | null,
  });

  useEffect(() => {
    // Shader failures are captured from the very first frame by
    // installInteriorShaderDiagnostics (installed in Canvas onCreated), not
    // here: this effect runs after the first draw has already compiled.
    const stop = () => stopMotionQA();
    gl.domElement.addEventListener('pointerdown', stop);
    return () => {
      gl.domElement.removeEventListener('pointerdown', stop);
      if (runtime.current.recorder?.state === 'recording') runtime.current.recorder.stop();
    };
  }, [gl]);

  useFrame((_, dt) => {
    const state = getMotionQA();
    const run = runtime.current;
    const c = controls.current;
    if (!c) return;
    if (state.running && (!run.active || state.run !== run.run)) {
      run.savedPosition.copy(camera.position);
      run.savedTarget.copy(c.target);
      run.enabled = c.enabled;
      run.damping = c.enableDamping;
      run.orbit = c.autoRotate;
      c.enabled = false;
      c.enableDamping = false;
      c.autoRotate = false;
      run.active = true;
      run.run = state.run;
      run.elapsed = run.frames = run.sum = run.max = run.updateAt = 0;
      run.phase = -1;
      try {
        const validation = runInteriorValidation();
        const mesh = scene.getObjectByName('Windows_ParallaxInteriors') as THREE.Mesh | undefined;
        const audit = mesh?.geometry.userData.interiorAudit as InteriorAudit | undefined;
        updateMotionQA({ tests: validation.checks, rayChecks: validation.rays, audit: audit ?? null });
        const currentRun = state.run;
        void gl.compileAsync(scene, camera).then(() => {
          const now = getMotionQA();
          if (now.run !== currentRun) return;
          // A program that failed at load is cached: compileAsync resolves
          // without re-reporting it, so keep the persisted failure visible.
          if (now.shaderFailure) updateMotionQA({ shaderStatus: 'Shader error' });
          else if (!now.errors.length) updateMotionQA({ shaderStatus: 'Compiled; watching for errors' });
        }).catch((error: unknown) => {
          updateMotionQA({ shaderStatus: 'Compile failed', errors: [...getMotionQA().errors, String(error)] });
        });
      } catch (error) {
        updateMotionQA({ running: false, errors: [...getMotionQA().errors, String(error)] });
      }
      if (state.record) {
        try {
          if (typeof MediaRecorder === 'undefined' || !gl.domElement.captureStream) throw new Error('Canvas recording is not supported by this browser.');
          const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
          if (!mimeType) throw new Error('WebM recording is unavailable.');
          const stream = gl.domElement.captureStream(30);
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
          const chunks: Blob[] = [];
          recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            if (!chunks.length) return;
            const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'lokam-interior-motion-qa.webm';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          };
          recorder.start();
          run.recorder = recorder;
        } catch (error) {
          updateMotionQA({ errors: [...getMotionQA().errors, `Recording: ${String(error)}`] });
        }
      }
    }
    if (run.active && !getMotionQA().running) {
      camera.position.copy(run.savedPosition);
      c.target.copy(run.savedTarget);
      c.update();
      c.enabled = run.enabled;
      c.enableDamping = run.damping;
      c.autoRotate = run.orbit;
      if (run.recorder?.state === 'recording') run.recorder.stop();
      run.recorder = null;
      run.active = false;
      return;
    }
    if (!run.active) return;

    run.elapsed = Math.min(TOTAL - 0.0001, run.elapsed + Math.min(dt, 0.08));
    const phase = pose(run.elapsed, run.position, run.target);
    if (phase !== run.phase) {
      run.transitionPosition.copy(camera.position);
      run.transitionTarget.copy(c.target);
      run.phase = phase;
    }
    const blend = THREE.MathUtils.smoothstep(run.elapsed % PHASE_SECONDS, 0, 1.1);
    camera.position.lerpVectors(run.transitionPosition, run.position, blend);
    c.target.lerpVectors(run.transitionTarget, run.target, blend);
    c.update();
    run.frames++;
    run.sum += dt * 1000;
    run.max = Math.max(run.max, dt * 1000);
    if (run.elapsed - run.updateAt >= 0.25) {
      const context = gl.getContext();
      const gpuError = context.getError();
      if (gpuError !== context.NO_ERROR) updateMotionQA({ errors: [...getMotionQA().errors, `WebGL error ${gpuError}`] });
      updateMotionQA({ phase: PHASES[phase], progress: run.elapsed / TOTAL, frames: run.frames,
        averageMs: run.sum / run.frames, maxMs: run.max });
      run.updateAt = run.elapsed;
    }
    if (run.elapsed >= TOTAL - 0.001) {
      updateMotionQA({ running: false, phase: 'Finished - review motion visually', progress: 1,
        frames: run.frames, averageMs: run.sum / run.frames, maxMs: run.max });
    }
  });
  return null;
}
