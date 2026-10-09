import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Scene, VIEWS, type ViewId } from './Scene';
import { LAYERS, type LayerState } from './Building';
import { TRANSITION_SPEEDS, transitionSettings } from './visualProfiles';
import { gateState } from './layout';
import { exportGLB, inspectAsset, type AssetStats } from './exportGLB';
import { InteriorQAPanel } from './InteriorQAPanel';
import { ColumnLightPanel } from './ColumnLightPanel';
import { SceneBoundary, ShaderStatusBanner } from './SceneDiagnostics';
import { installInteriorShaderDiagnostics } from './motionState';
import {
  LED_VIDEO_PRESETS,
  getLedWallVideo,
  playLedWallVideo,
  setLedWallMuted,
  stopLedWallVideo,
  subscribeLedWallVideo,
} from './LedWall';
import { cn } from './cn';

type Accent = 'pink' | 'cyan' | 'lime' | 'amber' | 'violet';

const ACCENT: Record<Accent, string> = {
  pink: 'border-pink-400/30 bg-pink-400/10 text-pink-100',
  cyan: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  lime: 'border-lime-300/30 bg-lime-300/10 text-lime-100',
  amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  violet: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
};

function Toggle({
  label,
  on,
  onClick,
  accent = 'cyan',
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  accent?: Accent;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[11px] transition',
        on ? ACCENT[accent] : 'border-white/5 bg-white/[0.02] text-white/45 hover:bg-white/[0.06]',
      )}
    >
      {label}
      <span className={cn('h-2 w-2 rounded-full', on ? 'bg-current' : 'bg-white/15')} />
    </button>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-[10px] transition',
        on
          ? 'border-white/20 bg-white/12 text-white'
          : 'border-white/5 bg-white/[0.02] text-white/45 hover:bg-white/[0.06]',
      )}
    >
      {label}
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-white/40">{k}</dt>
      <dd className="font-mono text-white/80">{v}</dd>
    </div>
  );
}

export default function App() {
  const [night, setNight] = useState(true);
  const [doorOpen, setDoorOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(true);
  const [fade, setFade] = useState(true);
  const [speed, setSpeed] = useState<string>('medium');
  const [bloom, setBloom] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [layers, setLayers] = useState<LayerState>(
    LAYERS.reduce((acc, l) => ({ ...acc, [l.id]: true }), {} as LayerState),
  );
  const [view, setView] = useState<{ id: ViewId; nonce: number }>({ id: 'overview', nonce: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  const [frame, setFrame] = useState({ calls: 0, triangles: 0 });
  const [asset, setAsset] = useState<AssetStats | null>(null);
  const [ledUrl, setLedUrl] = useState('');
  const [ledError, setLedError] = useState<string | null>(null);
  const [ledBusy, setLedBusy] = useState(false);
  const ledVideo = useSyncExternalStore(subscribeLedWallVideo, getLedWallVideo, getLedWallVideo);
  const root = useRef<THREE.Group | null>(null);

  const playLedUrl = useCallback(async (raw?: string) => {
    const input = (raw ?? ledUrl).trim();
    if (!input) {
      setLedError('Paste a YouTube link or a direct video URL.');
      return;
    }
    setLedError(null);
    setLedBusy(true);
    const ok = await playLedWallVideo(input);
    setLedBusy(false);
    if (!ok) setLedError(getLedWallVideo().error ?? 'Playback failed.');
  }, [ledUrl]);

  const viewIds = Object.keys(VIEWS) as ViewId[];
  const go = (id: ViewId) => setView((v) => ({ id, nonce: v.nonce + 1 }));
  const onStats = useCallback((s: { calls: number; triangles: number }) => setFrame(s), []);
  const onReady = useCallback((r: THREE.Group) => {
    root.current = r;
    setAsset(inspectAsset(r));
  }, []);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d]">
      <SceneBoundary>
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [58, 40, 62], fov: 42, near: 0.5, far: 900 }}
          onCreated={({ gl }) => installInteriorShaderDiagnostics(gl)}
        >
          <Scene
            night={night}
            doorOpen={doorOpen}
            bloom={bloom}
            autoRotate={autoRotate}
            layers={layers}
            view={view}
            onStats={onStats}
            onReady={onReady}
          />
        </Canvas>
      </SceneBoundary>
      <ShaderStatusBanner />

      <div className="pointer-events-none absolute left-5 top-5 select-none">
        <h1 className="text-[15px] font-semibold tracking-[0.18em] text-white/85">
          Astara Seaways
          <span className="ml-2 font-normal tracking-[0.3em] text-cyan-200/70">MEGHAM</span>
        </h1>
        <p className="mt-1 max-w-md text-[11px] leading-relaxed text-white/40">
          Lokam Mini landmark asset — Astara entrance signage, double-sided LED advertisement totems,
          daytime visual refinement, and infinity pool depth.
        </p>
      </div>

      {/* Panel toggle */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        aria-label="Toggle inspector"
        className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur-md transition hover:bg-black/70"
      >
        {panelOpen ? '×' : '☰'}
      </button>

      {/* Inspector */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 z-30 flex w-[330px] max-w-[86vw] flex-col gap-5 overflow-y-auto border-l border-white/10 bg-black/45 p-5 backdrop-blur-md transition-transform duration-300',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Render</h2>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Night" on={night} onClick={() => setNight((v) => !v)} accent="pink" />
            <Toggle
              label="Gate open"
              on={gateOpen}
              onClick={() => {
                gateState.open = !gateOpen;
                setGateOpen(!gateOpen);
              }}
              accent="cyan"
            />
            <Toggle
              label="Doors open"
              on={doorOpen}
              onClick={() => setDoorOpen((open) => !open)}
              accent="cyan"
            />
            <Toggle
              label="Staged fade"
              on={fade}
              onClick={() => {
                transitionSettings.fade = !fade;
                setFade(!fade);
              }}
              accent="lime"
            />
            <Toggle label="Bloom" on={bloom} onClick={() => setBloom((v) => !v)} accent="cyan" />
            <Toggle label="Auto-orbit" on={autoRotate} onClick={() => setAutoRotate((v) => !v)} accent="amber" />
            <Toggle
              label="All layers"
              on={Object.values(layers).every(Boolean)}
              onClick={() => {
                const all = Object.values(layers).every(Boolean);
                setLayers(LAYERS.reduce((acc, l) => ({ ...acc, [l.id]: !all }), {} as LayerState));
              }}
              accent="violet"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
            Day → Night transition
          </h2>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {TRANSITION_SPEEDS.map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  on={speed === s.id}
                  onClick={() => {
                    transitionSettings.speed = s.id;
                    setSpeed(s.id);
                  }}
                />
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-white/45">
              {fade
                ? 'Dusk settles first, a few warm lights come up, then neon and site lighting complete the night.'
                : 'Staged fade is off — Day and Night switch immediately.'}
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Camera</h2>
          <div className="grid grid-cols-2 gap-2">
            {viewIds.map((id) => (
              <Toggle key={id} label={VIEWS[id].label} on={view.id === id} onClick={() => go(id)} accent="lime" />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">LED walls</h2>
          <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-white/45">
              {ledVideo.playing && ledVideo.videoId
                ? `Streaming YouTube on all 3 walls.${ledVideo.muted ? ' Muted for autoplay — click Unmute for audio.' : ''}`
                : ledVideo.status || 'Procedural column-light gradient active. Enter a YouTube URL or video ID to stream on all walls.'}
            </p>
            <input
              value={ledUrl}
              onChange={(e) => { setLedUrl(e.target.value); setLedError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void playLedUrl(); }}
              placeholder="YouTube link or video ID"
              spellCheck={false}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 font-mono text-[11px] text-white/85 placeholder:text-white/30 focus:border-cyan-300/40 focus:outline-none"
            />
            {ledError && <p className="text-[11px] text-red-300">{ledError}</p>}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => void playLedUrl()}
                disabled={ledBusy || ledVideo.playing}
                className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1.5 text-[11px] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ledBusy ? 'Loading…' : 'Play'}
              </button>
              <button
                onClick={() => stopLedWallVideo()}
                disabled={!ledVideo.playing}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/70 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stop
              </button>
              <button
                onClick={() => setLedWallMuted(!ledVideo.muted)}
                disabled={!ledVideo.playing}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/70 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ledVideo.muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LED_VIDEO_PRESETS.map((preset) => (
                <Chip
                  key={preset.id}
                  label={preset.label}
                  on={ledVideo.playing && ledVideo.videoId === preset.id}
                  onClick={() => { setLedError(null); void playLedUrl(preset.id); }}
                />
              ))}
            </div>
          </div>
        </section>

        <InteriorQAPanel />

        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Mesh layers</h2>
          <div className="grid grid-cols-2 gap-2">
            {LAYERS.map((l) => (
              <Toggle
                key={l.id}
                label={l.label}
                on={layers[l.id]}
                onClick={() => setLayers({ ...layers, [l.id]: !layers[l.id] })}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Asset budget</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <Stat k="Draw calls / frame" v={String(frame.calls)} />
            <Stat k="Frame triangles" v={fmt(frame.triangles)} />
            <Stat k="Static meshes" v={asset?.meshes ? String(asset.meshes) : '—'} />
            <Stat k="Instanced meshes" v={asset?.instancedMeshes ? String(asset.instancedMeshes) : '—'} />
            <Stat k="Instances" v={asset?.instances ? String(asset.instances) : '—'} />
            <Stat k="Materials" v={asset?.materials ? String(asset.materials) : '—'} />
            <Stat k="Asset triangles" v={asset ? fmt(asset.triangles) : '—'} />
            <Stat k="Lights" v={asset?.lights ? String(asset.lights) : '—'} />
          </dl>
        </section>

        <section className="space-y-2">
          <button
            onClick={() => root.current && exportGLB(root.current)}
            className="w-full rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[11px] text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Export .glb
          </button>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
              Forecourt & Architecture Features
            </h3>
            <ul className="space-y-1 text-[11px] leading-relaxed text-white/45">
              <li>· Multi-window architectural unit parallax interiors (1–3 panel rooms)</li>
              <li>· Seeded wall finishes, curtain fabrics & per-room privacy variation</li>
              <li>· Empty two-storey white hall, clear through the entrance and upper windows</li>
              <li>· Integrated full-wall LED displays on the rear and both side elevations</li>
              <li>· Full 3-wall YouTube playback with column-light matching gradient when idle</li>
              <li>· Grand 2-storey empty white hall interior with working double entrance doors</li>
              <li>· Continuous bronze slats under ASTARA with clean white columns</li>
              <li>· Double-sided luxury LED advertisement totems (Astara day & sunset)</li>
              <li>· Astara entrance lintel sign with illuminated horizontal rules</li>
              <li>· Vertical cyan-blue Seaways neon sign on entrance portal pier</li>
              <li>· Rooftop Megham monoline cursive logo with four-point star</li>
              <li>· Deep infinity pool with swimmable volume & floating swim rings</li>
              <li>· Daytime visual refinement pass with contact ambient shading</li>
            </ul>
          </div>

          <p className="text-[11px] leading-relaxed text-white/45">
            Y-up, metres, origin at ground-centre. Named groups (MainBuilding, Entrance, RooftopCafe, InfinityPool,
            RooftopBar, SeatingArea, Signage, Lights, Decor, Site_Parking, Site_Perimeter), shared PBR materials, GPU instancing
            & emissive-strength neon. Every window is 2 triangles; shared unit interiors use three analytical depth zones, not ray-marching. Please
            re-apply <span className="font-mono text-white/60">createInteriorMaterial()</span> to{' '}
            <span className="font-mono text-white/60">Windows_ParallaxInteriors</span> after importing the GLB.
          </p>
        </section>
      </div>

      <ColumnLightPanel />
    </div>
  );
}
