import { interiorDebugMode } from './InteriorWindows';
import { getMotionQA, startMotionQA, stopMotionQA, subscribeMotionQA } from './motionState';
import { useState, useSyncExternalStore } from 'react';

export function InteriorQAPanel() {
  const qa = useSyncExternalStore(subscribeMotionQA, getMotionQA, getMotionQA);
  const [debug, setDebug] = useState(0);
  const [record, setRecord] = useState(false);
  return (
    <details className="border-t border-white/10 pt-3 text-xs text-white/70">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.2em]">Interior motion QA</summary>
      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between gap-2">
          View
          <select aria-label="Interior debug view" value={debug} onChange={(event) => {
            const value = Number(event.target.value);
            setDebug(value);
            interiorDebugMode.value = value;
          }} className="rounded border border-white/15 bg-[#171c28] px-2 py-1 text-white">
            <option value={0}>Normal interiors</option>
            <option value={1}>Shared unit IDs</option>
            <option value={2}>Depth zones</option>
            <option value={3}>Unit occupancy</option>
            <option value={4}>Wall & curtain finish</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={record} disabled={qa.running} onChange={(event) => setRecord(event.target.checked)} />
          Save motion video (WebM)
        </label>
        <button onClick={() => qa.running ? stopMotionQA() : startMotionQA(record)}
          className="w-full rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-cyan-100">
          {qa.running ? 'Stop test' : 'Run 48-second motion test'}
        </button>
        <progress aria-label="Motion test progress" value={qa.progress} max={1} className="h-1 w-full accent-cyan-300" />
        <p role="status">{qa.phase}</p>
        <p className="text-[10px] leading-relaxed text-white/45">
          Parallel walk, orbit, zoom, and grazing angles. Click the viewport to stop.
          Repeat in Day and Night, with Bloom on and off.
        </p>
        {qa.tests.length > 0 && <p>{qa.tests.length} CPU checks passed; {qa.rayChecks.toLocaleString()} bounded-ray samples.</p>}
        {qa.audit && <p>{qa.audit.units} units / {qa.audit.panes} panes. Spans: {qa.audit.spans['1']} single, {qa.audit.spans['2']} double, {qa.audit.spans['3']} triple.</p>}
        {qa.audit && <p className="text-[10px] text-white/50">
          {Object.keys(qa.audit.templates).length} room types / {Object.keys(qa.audit.palettes).length} palettes / {Object.keys(qa.audit.layouts).length} layouts.
          {' '}{qa.audit.richness.Minimal ?? 0} minimal, {qa.audit.richness.Composed ?? 0} composed, {qa.audit.richness.Layered ?? 0} layered.
        </p>}
        {qa.audit && <p className="text-[10px] text-white/50">
          Walls: {qa.audit.neutralWallPercent}% plain neutral, {qa.audit.accentWallPercent}% accent/feature.
          {' '}Curtains: {qa.audit.openPercent}% open, {qa.audit.privatePercent}% private,
          {' '}avg privacy {qa.audit.averagePrivacy.toFixed(2)}, {Object.keys(qa.audit.curtainFabrics).length} fabrics in use.
          {(qa.audit.templates.Lobby ?? 0) > 0 && ` Lobby halls: ${qa.audit.templates.Lobby}.`}
        </p>}
        {qa.frames > 0 && <p className="font-mono text-[10px]">{qa.frames} frames / {qa.averageMs.toFixed(1)} ms avg / {qa.maxMs.toFixed(1)} ms max</p>}
        <p className="text-[10px]">Shader: {qa.shaderStatus}</p>
        {qa.shaderFailure && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-red-300">{qa.shaderFailure}</pre>
        )}
        {qa.errors.length > 0 && <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[10px] text-red-300">{qa.errors.join('\n')}</pre>}
        <p className="text-[10px] text-white/40">CPU/GPU error checks do not certify visual stability. Review the moving view or recorded video for shimmer and seams.</p>
      </div>
    </details>
  );
}
