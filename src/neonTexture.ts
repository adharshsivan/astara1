import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Shared canvas baker for the cursive neon signage.
 *
 * Extracted from the old CursiveNeon so the rooftop logo, the entrance pier
 * wordmarks and the lintel sign all share one code path, one font stack and one
 * set of day/night rules. Adding a new sign never means re-deriving the look.
 */

const FAMILY = "'Pacifico','Segoe Script','Brush Script MT','Snell Roundhand','Apple Chancery',cursive";
const FS = 170;

export interface BakedNeon {
  texture: THREE.CanvasTexture;
  /** canvas width in px */
  width: number;
  /** canvas height in px */
  height: number;
}

/**
 * Resolves once the bundled Pacifico face has actually loaded, so a sign never
 * gets stuck showing the OS fallback script. Shared across every instance.
 */
let fontLoaded = false;
const fontWaiters = new Set<() => void>();

export function useNeonFontTick(): number {
  const [tick, setTick] = useState(fontLoaded ? 1 : 0);
  useEffect(() => {
    if (fontLoaded) return;
    let alive = true;
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts
      ?.load(`400 ${FS}px Pacifico`, 'MEGHAM AAZHI SEAWAYS')
      .then(() => {
        fontLoaded = true;
        fontWaiters.forEach((fn) => fn());
      })
      .catch(() => undefined);
    const wake = () => {
      if (alive) setTick((n) => n + 1);
    };
    fontWaiters.add(wake);
    return () => {
      alive = false;
      fontWaiters.delete(wake);
    };
  }, []);
  return tick;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Four-point sparkle with concave sides, centred on (cx, cy). */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const k = r * 0.17;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
  ctx.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
  ctx.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
  ctx.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
  ctx.closePath();
}

/**
 * Bakes one line of neon script to a canvas.
 *
 * `sparkle` appends a four-point star to the word and keeps the whole lockup
 * optically centred, so the logo never looks off-centre on its mount.
 */
export function bakeNeonTexture(
  text: string,
  color: string,
  plate: boolean,
  isNight: boolean,
  sparkle = false,
): BakedNeon {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `400 ${FS}px ${FAMILY}`;
  const tw = Math.ceil(probe.measureText(text).width);

  const starR = sparkle ? FS * 0.36 : 0;
  const starGap = sparkle ? FS * 0.2 : 0;
  const padX = (plate ? 130 : 100) + (sparkle ? starR + starGap : 0);
  const W = tw + padX * 2;
  const H = Math.round(FS * (plate ? 1.75 : 1.6));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  if (plate) {
    roundRectPath(ctx, 6, 6, W - 12, H - 12, 44);
    ctx.fillStyle = 'rgba(4,8,20,0.96)';
    ctx.fill();
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    roundRectPath(ctx, 20, 20, W - 40, H - 40, 34);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = `400 ${FS}px ${FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // Centre the word + sparkle as one lockup.
  const cx = W / 2;
  const cy = H / 2 + FS * 0.03;
  const textCx = sparkle ? cx - starGap / 2 - starR : cx;

  if (isNight) {
    // Dark contrast perimeter so the neon never bleeds into the sky.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 8, 20, 0.95)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#05121e';
    ctx.lineWidth = 9;
    ctx.strokeText(text, textCx, cy);
    ctx.restore();

    // Tight coloured halo, then a hot luminous core.
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    ctx.fillText(text, textCx, cy);
    ctx.restore();

    ctx.fillStyle = '#d6f2ff';
    ctx.fillText(text, textCx, cy);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.strokeText(text, textCx, cy);

    if (sparkle) {
      const sx = cx + tw / 2 + starGap / 2 + starR;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = color;
      starPath(ctx, sx, cy, starR);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      starPath(ctx, sx, cy, starR * 0.62);
      ctx.fill();
    }
  } else {
    // Daytime: dimensional unlit lettering — dark, readable, never glowing.
    ctx.save();
    ctx.shadowColor = 'rgba(10, 16, 26, 0.45)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#101d2e';
    ctx.fillText(text, textCx, cy);
    ctx.restore();

    ctx.fillStyle = '#1b3550';
    ctx.fillText(text, textCx, cy);

    ctx.strokeStyle = '#44688a';
    ctx.lineWidth = 2.2;
    ctx.strokeText(text, textCx, cy);

    if (sparkle) {
      const sx = cx + tw / 2 + starGap / 2 + starR;
      ctx.fillStyle = '#1b3550';
      starPath(ctx, sx, cy, starR);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.name = `Neon_${text.replace(/\s+/g, '')}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { texture: tex, width: W, height: H };
}
