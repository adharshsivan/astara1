import type { WebGLRenderer } from 'three';
import type { InteriorAudit } from './units';

export interface MotionQAState {
  running: boolean;
  run: number;
  phase: string;
  progress: number;
  frames: number;
  averageMs: number;
  maxMs: number;
  tests: string[];
  rayChecks: number;
  shaderStatus: string;
  errors: string[];
  record: boolean;
  audit: InteriorAudit | null;
  /**
   * Compile/link log of the interior window shader, captured from the very
   * first frame. It persists across QA runs, so a shader that failed at load is
   * never later reported as compiled.
   */
  shaderFailure: string | null;
}

let snapshot: MotionQAState = {
  running: false, run: 0, phase: 'Not run', progress: 0, frames: 0,
  averageMs: 0, maxMs: 0, tests: [], rayChecks: 0,
  shaderStatus: 'Not checked', errors: [], record: false, audit: null,
  shaderFailure: null,
};
const listeners = new Set<() => void>();
export const getMotionQA = () => snapshot;
export const subscribeMotionQA = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function updateMotionQA(patch: Partial<MotionQAState>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}
export function startMotionQA(record = false) {
  updateMotionQA({ running: true, run: snapshot.run + 1, phase: 'Preparing', progress: 0,
    frames: 0, averageMs: 0, maxMs: 0, tests: [], rayChecks: 0, errors: [], record, shaderStatus: 'Compiling' });
}
export function stopMotionQA() {
  if (snapshot.running) updateMotionQA({ running: false, phase: 'Stopped' });
}

const instrumented = new WeakSet<WebGLRenderer>();

/**
 * Install from Canvas `onCreated`, which runs before the first frame renders,
 * so an interior shader that fails to compile on the very first draw is still
 * recorded. Other materials' errors pass through to the previous handler or
 * to the console unchanged.
 */
export function installInteriorShaderDiagnostics(gl: WebGLRenderer) {
  if (instrumented.has(gl)) return;
  instrumented.add(gl);
  const previous = gl.debug.onShaderError;
  gl.debug.onShaderError = (context, program, vertex, fragment) => {
    const log = [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join('\n');
    if ((context.getShaderSource(fragment) ?? '').includes('LOKAM_INTERIOR_V3')) {
      updateMotionQA({
        shaderStatus: 'Shader error',
        shaderFailure: log || 'The interior window shader failed to compile or link (the driver gave no log).',
      });
    }
    if (previous) previous(context, program, vertex, fragment);
    else console.error(`THREE.WebGLProgram: shader error\n${log}`);
  };
}
