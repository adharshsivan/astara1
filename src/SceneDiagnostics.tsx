import { Component, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getMotionQA, subscribeMotionQA } from './motionState';

interface BoundaryState {
  error: Error | null;
}

/**
 * Catches anything thrown while the 3D scene is built or rendered. React
 * Three Fiber re-throws canvas errors outward, so without a boundary a single
 * exception unmounts the whole app and leaves a black page. This keeps the
 * inspector alive and shows the actual message instead.
 */
export class SceneBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[Lokam] The 3D scene failed to render:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-red-400/25 bg-black/60 p-5 text-white/80 backdrop-blur-md"
        >
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-red-300">
            The 3D scene failed to load
          </h2>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-red-100/80">
            {error.message || String(error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white/80 transition hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Shown only if the interior window shader cannot compile on this device. The
 * rest of the building still renders; the full log is in Interior motion QA.
 * It subscribes on its own so QA updates never re-render the scene.
 */
export function ShaderStatusBanner() {
  const qa = useSyncExternalStore(subscribeMotionQA, getMotionQA, getMotionQA);
  const [dismissed, setDismissed] = useState(false);
  if (!qa.shaderFailure || dismissed) return null;
  return (
    <div
      role="alert"
      className="absolute left-5 top-24 z-20 max-w-md rounded-xl border border-amber-300/30 bg-black/60 p-3 text-[11px] leading-relaxed text-amber-100 backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-3">
        <p>
          <span className="font-semibold">Window interiors could not compile on this GPU.</span>{' '}
          The building still renders; the compile log is under Inspector → Interior motion QA.
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-amber-100/60 transition hover:text-amber-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
