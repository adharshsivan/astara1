import { useState, type ReactNode } from 'react';
import {
  COLUMN_COLORS,
  COLUMN_EFFECTS,
  COLUMN_INTENSITIES,
  COLUMN_SPEEDS,
  columnLight,
  type ColumnLightState,
} from './ColumnLight';

/**
 * Small settings card for the MAIN VERTICAL COLUMN STRIP LIGHTS only.
 * Everything else on the building keeps its original static lighting.
 */

const CHIP = 'rounded-md border px-2 py-1 text-[10px] transition';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">{label}</div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        on
          ? `${CHIP} border-white/20 bg-white/12 text-white`
          : `${CHIP} border-white/5 bg-white/[0.02] text-white/45 hover:bg-white/[0.06]`
      }
    >
      {children}
    </button>
  );
}

function Swatch({ label, a, b, on, onClick }: {
  label: string; a: string; b: string; on: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-8 rounded-md border transition ${on ? 'border-white/70' : 'border-white/10 hover:border-white/30'}`}
      style={{ background: `linear-gradient(180deg, ${a}, ${b})` }}
    >
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function ColumnLightPanel() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const set = <K extends keyof ColumnLightState>(key: K, value: ColumnLightState[K]) => {
    columnLight[key] = value;
    refresh();
  };

  return (
    <>
      {/* Small trigger, tucked under the inspector toggle on the opposite side. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Column light settings"
        className="absolute left-5 bottom-5 z-30 flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 text-[11px] text-white/80 backdrop-blur-md transition hover:bg-black/70"
      >
        <span
          className="h-3 w-1.5 rounded-full"
          style={{ background: 'linear-gradient(180deg, #4ceaff, #9b52ff)' }}
        />
        Column lights
      </button>

      {open && (
        <div className="absolute left-5 bottom-16 z-30 w-[248px] rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
              Column lights
            </h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-white/40 transition hover:text-white/80"
            >
              ×
            </button>
          </div>

          <div className="space-y-3.5">
            <Field label="Effect">
              <div className="grid grid-cols-2 gap-1.5">
                {COLUMN_EFFECTS.map((e) => (
                  <Chip key={e.id} on={columnLight.effect === e.id} onClick={() => set('effect', e.id)}>
                    {e.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Color">
              <div className="grid grid-cols-6 gap-1.5">
                {COLUMN_COLORS.map((c) => (
                  <Swatch
                    key={c.id}
                    label={c.label}
                    a={c.a}
                    b={c.b}
                    on={columnLight.color === c.id}
                    onClick={() => {
                      if (c.id !== 'custom') {
                        columnLight.colorA = c.a;
                        columnLight.colorB = c.b;
                      }
                      set('color', c.id);
                    }}
                  />
                ))}
              </div>
              {columnLight.color === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex flex-1 items-center gap-1.5 text-[10px] text-white/50">
                    A
                    <input
                      type="color"
                      value={columnLight.colorA}
                      onChange={(e) => set('colorA', e.target.value)}
                      className="h-6 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                    />
                  </label>
                  <label className="flex flex-1 items-center gap-1.5 text-[10px] text-white/50">
                    B
                    <input
                      type="color"
                      value={columnLight.colorB}
                      onChange={(e) => set('colorB', e.target.value)}
                      className="h-6 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                    />
                  </label>
                </div>
              )}
            </Field>

            <Field label="Speed">
              <div className="grid grid-cols-3 gap-1.5">
                {COLUMN_SPEEDS.map((s) => (
                  <Chip key={s.id} on={columnLight.speed === s.id} onClick={() => set('speed', s.id)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Intensity">
              <div className="grid grid-cols-3 gap-1.5">
                {COLUMN_INTENSITIES.map((i) => (
                  <Chip key={i.id} on={columnLight.intensity === i.id} onClick={() => set('intensity', i.id)}>
                    {i.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <button
              onClick={() => set('animate', !columnLight.animate)}
              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] transition ${
                columnLight.animate
                  ? 'border-white/15 bg-white/10 text-white'
                  : 'border-white/5 bg-white/[0.02] text-white/45 hover:bg-white/[0.06]'
              }`}
            >
              Animation
              <span
                className={`h-2 w-2 rounded-full ${columnLight.animate ? 'bg-cyan-400' : 'bg-white/15'}`}
              />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
