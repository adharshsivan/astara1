import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { box, merge, type G } from './geo';
import { MAT, registerDayMaterial } from './materials';
import { SITE } from './layout';

/* ================================================================== */
/*  ENTRANCE FORECOURT LED ADVERTISEMENT SCREENS (ASTARA SEAWAYS)      */
/*  ------------------------------------------------------------------ */
/*  Two premium, tall, double-sided digital LED advertisement totems:  */
/*   • Left Screen  (x = -15.2, z = 23.1):                             */
/*     Luxury tropical day beach resort visual: azure ocean, sun       */
/*     flare, palm trees, white sand, and "ASTARA" luxury branding.    */
/*   • Right Screen (x = +15.2, z = 23.1):                             */
/*     Luxury tropical sunset coastal visual: golden-purple twilight,  */
/*     setting sun reflection, palm silhouettes, "ASTARA" branding.    */
/*                                                                     */
/*  Placement:                                                         */
/*   • Symmetrically located on the forecourt stone pavement in front   */
/*     of the left and right tree planter beds.                        */
/*   • Trees and shrubs remain completely intact behind the totems.    */
/*   • Walking paths, canopy columns, zebra crossings and entrance      */
/*     doors remain completely unobstructed.                           */
/* ================================================================== */

export const TOTEM = {
  // Symmetrical coordinates on the forecourt pavement
  leftX: -15.2,
  rightX: 15.2,
  z: 23.1,
  groundY: SITE.pavingY, // 0.18

  // Plinth dimensions
  plinthWidth: 1.96,
  plinthDepth: 0.68,
  plinthHeight: 0.18,

  // Main Totem Frame
  frameWidth: 1.66,
  frameDepth: 0.32,
  frameHeight: 4.22,
  topCapHeight: 0.14,
  totalHeight: 4.54, // reaches y = 4.72m from ground

  // Active Screen Dimensions (Double-Sided: front +Z and back -Z)
  screenWidth: 1.44,
  screenHeight: 3.76,
  screenZOffset: 0.162, // sits flush on front and back faces
} as const;

/* ------------------------------------------------------------------ */
/*  Procedural High-Resolution Luxury Advertising Textures             */
/* ------------------------------------------------------------------ */

function drawAstaraBrandCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  subtitle: string,
  accentColor: string,
) {
  const cardH = h * 0.23;
  const cardY = h - cardH - h * 0.035;
  const cardW = w * 0.88;
  const cardX = (w - cardW) / 2;
  const radius = 24;

  ctx.save();

  // Glass card shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;

  // Dark translucent frosted glass background
  const bgGrad = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
  bgGrad.addColorStop(0, 'rgba(10, 18, 30, 0.90)');
  bgGrad.addColorStop(1, 'rgba(6, 12, 22, 0.96)');
  ctx.fillStyle = bgGrad;

  // Rounded rectangle card path
  ctx.beginPath();
  ctx.moveTo(cardX + radius, cardY);
  ctx.lineTo(cardX + cardW - radius, cardY);
  ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
  ctx.lineTo(cardX + cardW, cardY + cardH - radius);
  ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
  ctx.lineTo(cardX + radius, cardY + cardH);
  ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
  ctx.lineTo(cardX, cardY + radius);
  ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
  ctx.closePath();
  ctx.fill();

  // Subtle luminous rim border
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Luxury Brand Title: "ASTARA"
  ctx.save();
  const textY = cardY + cardH * 0.44;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Letter glow
  ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
  ctx.shadowBlur = 12;

  // Brand Name
  ctx.font = '600 58px "Cinzel", "Times New Roman", "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#ffffff';

  // Render with elegant letter spacing
  const text = 'ASTARA';
  const letterSpacing = 16;
  const totalW = ctx.measureText(text).width + (text.length - 1) * letterSpacing;
  let startX = w / 2 - totalW / 2;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    ctx.fillText(char, startX, textY);
    startX += ctx.measureText(char).width + letterSpacing;
  }

  // Thin Luxury Divider Rule with center diamond
  const lineY = cardY + cardH * 0.62;
  const lineHalfW = cardW * 0.36;
  const lineGrad = ctx.createLinearGradient(w / 2 - lineHalfW, 0, w / 2 + lineHalfW, 0);
  lineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  lineGrad.addColorStop(0.25, accentColor);
  lineGrad.addColorStop(0.5, '#ffffff');
  lineGrad.addColorStop(0.75, accentColor);
  lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - lineHalfW, lineY);
  ctx.lineTo(w / 2 + lineHalfW, lineY);
  ctx.stroke();

  // Small center accent diamond
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(w / 2, lineY - 4);
  ctx.lineTo(w / 2 + 4, lineY);
  ctx.lineTo(w / 2, lineY + 4);
  ctx.lineTo(w / 2 - 4, lineY);
  ctx.closePath();
  ctx.fill();

  // Luxury Subtitle
  ctx.font = '500 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = 'rgba(235, 245, 255, 0.85)';
  ctx.shadowBlur = 0;
  ctx.fillText(subtitle, w / 2, cardY + cardH * 0.79);

  ctx.restore();
}

/** Draws realistic tropical palm fronds radiating from (cx, cy). */
function drawPalmTree(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  curveX: number,
  crownX: number,
  crownY: number,
  trunkColor: string,
  leafColor1: string,
  leafColor2: string,
  frondScale = 1,
) {
  ctx.save();

  // Trunk: curved quadratic tapering upward
  ctx.beginPath();
  ctx.moveTo(startX - 18 * frondScale, startY);
  ctx.quadraticCurveTo(curveX - 12 * frondScale, (startY + crownY) / 2, crownX - 8 * frondScale, crownY);
  ctx.lineTo(crownX + 8 * frondScale, crownY);
  ctx.quadraticCurveTo(curveX + 12 * frondScale, (startY + crownY) / 2, startX + 18 * frondScale, startY);
  ctx.closePath();
  ctx.fillStyle = trunkColor;
  ctx.fill();

  // Palm Fronds: multiple radiating graceful arched leaves
  const angles = [
    -Math.PI * 0.85, -Math.PI * 0.65, -Math.PI * 0.45, -Math.PI * 0.25,
    -Math.PI * 0.05, Math.PI * 0.15, Math.PI * 0.35, -Math.PI * 0.95,
    -Math.PI * 0.75, -Math.PI * 0.55, -Math.PI * 0.35, -Math.PI * 0.15,
  ];

  for (let idx = 0; idx < angles.length; idx++) {
    const baseAngle = angles[idx];
    const frondLength = (130 + (idx % 4) * 25) * frondScale;
    const endX = crownX + Math.cos(baseAngle) * frondLength;
    const endY = crownY + Math.sin(baseAngle) * frondLength + 35 * frondScale; // droop
    const midX = crownX + Math.cos(baseAngle) * frondLength * 0.55;
    const midY = crownY + Math.sin(baseAngle) * frondLength * 0.45 - 20 * frondScale;

    // Stem spine
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.strokeStyle = idx % 2 === 0 ? leafColor1 : leafColor2;
    ctx.lineWidth = 3.5 * frondScale;
    ctx.stroke();

    // Leaflets along spine
    const steps = 18;
    for (let s = 3; s < steps; s++) {
      const t = s / steps;
      const curX = (1 - t) * (1 - t) * crownX + 2 * (1 - t) * t * midX + t * t * endX;
      const curY = (1 - t) * (1 - t) * crownY + 2 * (1 - t) * t * midY + t * t * endY;
      const leafletLen = Math.sin(t * Math.PI) * 44 * frondScale;

      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(curX + Math.cos(baseAngle + Math.PI / 2.3) * leafletLen, curY + Math.sin(baseAngle + Math.PI / 2.3) * leafletLen + 14 * t);
      ctx.strokeStyle = idx % 2 === 0 ? leafColor1 : leafColor2;
      ctx.lineWidth = 2.2 * frondScale;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(curX - Math.cos(baseAngle + Math.PI / 2.3) * leafletLen * 0.85, curY - Math.sin(baseAngle + Math.PI / 2.3) * leafletLen * 0.85 + 14 * t);
      ctx.strokeStyle = leafColor2;
      ctx.lineWidth = 1.8 * frondScale;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Left Screen: Tropical Coastal Day Resort Ad Texture */
export function createTropicalDayAdTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 1340;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. Tropical Azure Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  skyGrad.addColorStop(0, '#0c528e');
  skyGrad.addColorStop(0.28, '#1b7ec6');
  skyGrad.addColorStop(0.55, '#38aee2');
  skyGrad.addColorStop(0.78, '#70d2f4');
  skyGrad.addColorStop(1, '#d8f4ff');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Radiant Tropical Sun Burst & Atmospheric Haze
  const sunX = W * 0.72;
  const sunY = H * 0.28;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 260);
  sunGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  sunGrad.addColorStop(0.18, 'rgba(240, 250, 255, 0.75)');
  sunGrad.addColorStop(0.45, 'rgba(180, 235, 255, 0.40)');
  sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, W, H * 0.6);

  // Wispy cirrus clouds
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  for (const [cx, cy, cw, ch] of [
    [W * 0.25, H * 0.16, 220, 24],
    [W * 0.60, H * 0.12, 180, 18],
    [W * 0.15, H * 0.38, 240, 28],
    [W * 0.75, H * 0.42, 200, 20],
  ]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, ch / 2, -0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 3. Distant Islands on Horizon
  const seaY = H * 0.58;
  ctx.save();
  ctx.fillStyle = 'rgba(40, 110, 145, 0.42)';
  ctx.beginPath();
  ctx.moveTo(0, seaY);
  ctx.quadraticCurveTo(W * 0.2, seaY - 28, W * 0.45, seaY - 8);
  ctx.quadraticCurveTo(W * 0.65, seaY - 38, W * 0.88, seaY - 14);
  ctx.lineTo(W, seaY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(30, 95, 125, 0.55)';
  ctx.beginPath();
  ctx.moveTo(W * 0.35, seaY);
  ctx.quadraticCurveTo(W * 0.55, seaY - 22, W * 0.8, seaY - 4);
  ctx.lineTo(W * 0.8, seaY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 4. Crystal Turquoise Ocean Shallows
  const seaGrad = ctx.createLinearGradient(0, seaY, 0, H);
  seaGrad.addColorStop(0, '#0a789c');
  seaGrad.addColorStop(0.18, '#0da8c4');
  seaGrad.addColorStop(0.42, '#18cbe4');
  seaGrad.addColorStop(0.70, '#3ae4f2');
  seaGrad.addColorStop(1, '#52eaf6');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, seaY, W, H - seaY);

  // Sea wave crests and sunlight caustics
  ctx.save();
  for (let i = 0; i < 45; i++) {
    const wy = seaY + Math.pow(i / 45, 1.4) * (H - seaY);
    const alpha = 0.12 + (i / 45) * 0.28;
    ctx.strokeStyle = `rgba(230, 255, 255, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.2 + (i / 45) * 2.2;
    ctx.beginPath();
    const waveW = 35 + Math.sin(i * 1.7) * 20;
    const waveX = (i * 97) % W;
    ctx.moveTo(waveX - waveW, wy);
    ctx.quadraticCurveTo(waveX, wy - 3, waveX + waveW, wy);
    ctx.stroke();
  }
  ctx.restore();

  // White sand beach curve at bottom left
  ctx.save();
  const sandGrad = ctx.createLinearGradient(0, H * 0.72, W * 0.55, H);
  sandGrad.addColorStop(0, 'rgba(255, 248, 235, 0.88)');
  sandGrad.addColorStop(0.75, 'rgba(242, 230, 205, 0.95)');
  sandGrad.addColorStop(1, '#eddab5');
  ctx.fillStyle = sandGrad;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.74);
  ctx.quadraticCurveTo(W * 0.35, H * 0.78, W * 0.55, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 5. Majestic Tropical Palm Trees leaning across the sky
  drawPalmTree(ctx, -20, H * 0.88, 80, 130, H * 0.22, '#2c221a', '#145c36', '#26824e', 1.35);
  drawPalmTree(ctx, 45, H * 0.92, 120, 220, H * 0.28, '#362a20', '#1c7244', '#38a466', 1.05);
  drawPalmTree(ctx, -40, H * 0.82, 40, 90, H * 0.35, '#201812', '#0e4a2b', '#1e6d3f', 0.88);

  // 6. Luxury Brand Bottom Card
  drawAstaraBrandCard(ctx, W, H, 'HOTEL & PRIVATE RESIDENCES', '#38ddf4');

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'Entrance_Ad_TropicalDay';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Right Screen: Tropical Sunset Paradise Ad Texture */
export function createSunsetParadiseAdTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 1340;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. Twilight Sunset Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  skyGrad.addColorStop(0, '#1c0932'); // deep royal purple
  skyGrad.addColorStop(0.22, '#381254');
  skyGrad.addColorStop(0.44, '#7a1c66'); // rich orchid
  skyGrad.addColorStop(0.64, '#c63462'); // vibrant rose coral
  skyGrad.addColorStop(0.82, '#f25a4a'); // radiant sunset orange
  skyGrad.addColorStop(1, '#ffb83d'); // golden horizon
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Setting Sun on the Horizon & Radiant Aura
  const seaY = H * 0.58;
  const sunX = W * 0.42;
  const sunY = seaY - 8;

  // Broad sunset atmospheric halo
  const haloGrad = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 320);
  haloGrad.addColorStop(0, 'rgba(255, 245, 200, 0.98)');
  haloGrad.addColorStop(0.18, 'rgba(255, 185, 70, 0.85)');
  haloGrad.addColorStop(0.45, 'rgba(240, 85, 110, 0.45)');
  haloGrad.addColorStop(0.8, 'rgba(160, 40, 110, 0.18)');
  haloGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(0, 0, W, H * 0.62);

  // Bright sun disc at horizon
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, 38, 0, Math.PI * 2);
  ctx.fillStyle = '#fff9e4';
  ctx.shadowColor = '#ffa834';
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.restore();

  // Dramatic Sunset Clouds
  ctx.save();
  for (const [cx, cy, cw, ch, col] of [
    [W * 0.72, H * 0.16, 240, 32, 'rgba(90, 24, 78, 0.55)'],
    [W * 0.22, H * 0.24, 210, 26, 'rgba(120, 32, 90, 0.50)'],
    [W * 0.85, H * 0.36, 260, 30, 'rgba(190, 52, 95, 0.62)'],
    [W * 0.30, H * 0.46, 280, 36, 'rgba(235, 95, 75, 0.72)'],
    [W * 0.68, H * 0.52, 220, 24, 'rgba(255, 160, 70, 0.78)'],
  ] as [number, number, number, number, string][]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, ch / 2, -0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 3. Distant Coastline Silhouette on Horizon
  ctx.save();
  ctx.fillStyle = 'rgba(45, 12, 38, 0.65)';
  ctx.beginPath();
  ctx.moveTo(0, seaY);
  ctx.quadraticCurveTo(W * 0.18, seaY - 18, W * 0.32, seaY - 4);
  ctx.lineTo(W * 0.32, seaY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(W * 0.62, seaY);
  ctx.quadraticCurveTo(W * 0.82, seaY - 26, W, seaY - 6);
  ctx.lineTo(W, seaY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 4. Calm Mirror-Like Ocean Reflecting the Sunset
  const seaGrad = ctx.createLinearGradient(0, seaY, 0, H);
  seaGrad.addColorStop(0, '#42103e'); // deep purple
  seaGrad.addColorStop(0.22, '#6e1a4d');
  seaGrad.addColorStop(0.48, '#9c2a52');
  seaGrad.addColorStop(0.74, '#bf444d');
  seaGrad.addColorStop(1, '#db6a46'); // warm golden shore
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, seaY, W, H - seaY);

  // Shimmering Golden Sun Reflection Path across the Water
  ctx.save();
  for (let i = 0; i < 50; i++) {
    const t = i / 50;
    const wy = seaY + Math.pow(t, 1.25) * (H - seaY);
    const pathWidth = 35 + t * 140;
    const rx = sunX + (Math.sin(i * 1.8) * 12 * t);
    const waveLen = 14 + t * 45 + Math.sin(i * 2.3) * 15;

    const alpha = 0.35 + (1 - t) * 0.55;
    ctx.strokeStyle = `rgba(255, ${Math.floor(210 + t * 45)}, ${Math.floor(120 + t * 80)}, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.4 + t * 2.8;

    ctx.beginPath();
    ctx.moveTo(rx - waveLen, wy);
    ctx.quadraticCurveTo(rx, wy - 2, rx + waveLen, wy);
    ctx.stroke();

    // Secondary glitter sparkles in sun trail
    if (i % 3 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 235, 0.85)';
      ctx.fillRect(rx + (Math.sin(i * 3.7) * pathWidth * 0.35), wy, 3, 2);
    }
  }
  ctx.restore();

  // 5. Silhouetted Tropical Palm Trees framing the Right side
  drawPalmTree(ctx, W + 30, H * 0.90, W - 60, W - 120, H * 0.22, '#180816', '#220b22', '#140616', 1.38);
  drawPalmTree(ctx, W - 35, H * 0.94, W - 110, W - 210, H * 0.28, '#200a1e', '#2c102c', '#18081a', 1.02);
  drawPalmTree(ctx, W + 50, H * 0.84, W - 30, W - 80, H * 0.36, '#150614', '#1e081c', '#100412', 0.84);

  // 6. Luxury Brand Bottom Card
  drawAstaraBrandCard(ctx, W, H, 'EXCLUSIVE SUNSET RETREAT', '#ffaa44');

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'Entrance_Ad_SunsetParadise';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  3D Totem Hardware Geometry Builder                                 */
/* ------------------------------------------------------------------ */

function buildTotemHardware(): {
  plinth: G;
  frame: G;
  accentLeft: G;
  accentRight: G;
  groundHalo: G;
} {
  const t = TOTEM;
  const plinthParts: G[] = [];
  const frameParts: G[] = [];
  const accentLParts: G[] = [];
  const accentRParts: G[] = [];
  const haloParts: G[] = [];

  // 1. Plinth (Base at y = groundY)
  // Stepped architectural base
  const bY0 = t.groundY;
  const bY1 = bY0 + t.plinthHeight;
  plinthParts.push(
    // Lower wider base footing
    box(t.plinthWidth, t.plinthHeight * 0.45, t.plinthDepth, 0, bY0 + (t.plinthHeight * 0.45) / 2, 0),
    // Upper stepped plinth tier
    box(t.plinthWidth - 0.16, t.plinthHeight * 0.55, t.plinthDepth - 0.16, 0, bY0 + t.plinthHeight * 0.45 + (t.plinthHeight * 0.55) / 2, 0),
  );

  // Ground Halo light strip running around the base perimeter on the stone pavement
  const haloW = t.plinthWidth + 0.08;
  const haloD = t.plinthDepth + 0.08;
  const haloThick = 0.035;
  const haloY = bY0 + 0.015;
  haloParts.push(
    // front and back halo strips
    box(haloW, 0.02, haloThick, 0, haloY, haloD / 2),
    box(haloW, 0.02, haloThick, 0, haloY, -haloD / 2),
    // left and right halo strips
    box(haloThick, 0.02, haloD - haloThick * 2, haloW / 2, haloY, 0),
    box(haloThick, 0.02, haloD - haloThick * 2, -haloW / 2, haloY, 0),
  );

  // 2. Totem Frame / Housing (y from bY1 to top)
  const fY0 = bY1;
  const fH = t.frameHeight;
  const fY1 = fY0 + fH;
  const fW = t.frameWidth;
  const fD = t.frameDepth;

  // Side vertical posts / bezels (left and right of screen)
  const sidePostW = (fW - t.screenWidth) / 2; // ~0.11m
  const sideLeftX = -fW / 2 + sidePostW / 2;
  const sideRightX = fW / 2 - sidePostW / 2;

  frameParts.push(
    // Left vertical frame post
    box(sidePostW, fH, fD, sideLeftX, fY0 + fH / 2, 0),
    // Right vertical frame post
    box(sidePostW, fH, fD, sideRightX, fY0 + fH / 2, 0),
    // Bottom frame sill (between plinth and screen bottom)
    box(t.screenWidth, 0.18, fD - 0.02, 0, fY0 + 0.09, 0),
    // Top frame header (between screen top and top cap)
    box(t.screenWidth, fH - (0.18 + t.screenHeight), fD - 0.02, 0, fY1 - (fH - (0.18 + t.screenHeight)) / 2, 0),
    // Center divider core between front and back screen backings
    box(t.screenWidth, t.screenHeight, 0.08, 0, fY0 + 0.18 + t.screenHeight / 2, 0),
    // Architectural Top Cap
    box(fW + 0.08, t.topCapHeight, fD + 0.06, 0, fY1 + t.topCapHeight / 2, 0),
  );

  // 3. Vertical Accent Light Strips running along the outer sides of the totem
  const stripW = 0.025;
  const stripD = 0.025;
  const stripH = t.screenHeight + 0.2;
  const stripY = fY0 + 0.18 + t.screenHeight / 2;

  // Left and Right outer edge strips (for Left totem: cyan-blue; for Right totem: warm sunset rose)
  accentLParts.push(
    box(stripW, stripH, stripD, -fW / 2 - stripW / 2, stripY, 0),
    box(stripW, stripH, stripD, fW / 2 + stripW / 2, stripY, 0),
  );

  accentRParts.push(
    box(stripW, stripH, stripD, -fW / 2 - stripW / 2, stripY, 0),
    box(stripW, stripH, stripD, fW / 2 + stripW / 2, stripY, 0),
  );

  return {
    plinth: merge(plinthParts),
    frame: merge(frameParts),
    accentLeft: merge(accentLParts),
    accentRight: merge(accentRParts),
    groundHalo: merge(haloParts),
  };
}

/** Builds the double-sided display quad (front +Z and back -Z) */
function buildScreenPlanes(): { front: G; back: G } {
  const w = TOTEM.screenWidth;
  const h = TOTEM.screenHeight;
  const z = TOTEM.screenZOffset;

  // Front display facing +Z (south towards driveway/gate)
  const front = new THREE.PlaneGeometry(w, h);
  front.translate(0, 0, z);

  // Back display facing -Z (north towards building/terrace)
  const back = new THREE.PlaneGeometry(w, h);
  back.rotateY(Math.PI);
  back.translate(0, 0, -z);

  return { front, back };
}

/* ------------------------------------------------------------------ */
/*  Main Component: EntranceScreens                                    */
/* ------------------------------------------------------------------ */

interface Props {
  night?: boolean;
}

export function EntranceScreens({ night = true }: Props) {
  // 1. Generate procedural high-definition luxury advertising textures
  const leftAdTexture = useMemo(() => createTropicalDayAdTexture(), []);
  const rightAdTexture = useMemo(() => createSunsetParadiseAdTexture(), []);

  // 2. Hardware Geometries
  const hardware = useMemo(() => buildTotemHardware(), []);
  const screens = useMemo(() => buildScreenPlanes(), []);

  // 3. Materials
  // Left Screen Material (Tropical Day Ad - Vibrant High-Nit LED Display)
  const leftScreenMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      name: 'AdScreen_TropicalDay_LED',
      map: leftAdTexture,
      emissiveMap: leftAdTexture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 1.35,
      roughness: 0.15,
      metalness: 0.05,
      toneMapped: false,
    });
    return mat;
  }, [leftAdTexture]);

  // Right Screen Material (Sunset Paradise Ad - Vibrant High-Nit LED Display)
  const rightScreenMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      name: 'AdScreen_SunsetParadise_LED',
      map: rightAdTexture,
      emissiveMap: rightAdTexture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 1.35,
      roughness: 0.15,
      metalness: 0.05,
      toneMapped: false,
    });
    return mat;
  }, [rightAdTexture]);

  // Accent Edge Glow Materials
  const cyanAccentMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      name: 'Totem_Accent_Cyan',
      color: '#0d2836',
      emissive: new THREE.Color('#22d4f5'),
      emissiveIntensity: 2.2,
      roughness: 0.3,
      metalness: 0.1,
      toneMapped: false,
    });
    return m;
  }, []);

  const sunsetAccentMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      name: 'Totem_Accent_SunsetAmber',
      color: '#361810',
      emissive: new THREE.Color('#ff9c3a'),
      emissiveIntensity: 2.2,
      roughness: 0.3,
      metalness: 0.1,
      toneMapped: false,
    });
    return m;
  }, []);

  const haloMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      name: 'Totem_Ground_Halo',
      color: '#1a2228',
      emissive: new THREE.Color('#d8f2ff'),
      emissiveIntensity: 1.8,
      roughness: 0.4,
      metalness: 0,
      toneMapped: false,
    });
    return m;
  }, []);

  // 4. Smooth Day / Night Material Profiles
  useLayoutEffect(() => {
    const r1 = registerDayMaterial(
      leftScreenMat,
      { emissiveIntensity: 0.55 },
      { emissiveIntensity: 1.35 },
      'late',
    );
    const r2 = registerDayMaterial(
      rightScreenMat,
      { emissiveIntensity: 0.55 },
      { emissiveIntensity: 1.35 },
      'late',
    );
    const r3 = registerDayMaterial(
      cyanAccentMat,
      { color: '#2a353d', emissiveIntensity: 0 },
      { color: '#0d2836', emissiveIntensity: 2.2 },
      'late',
    );
    const r4 = registerDayMaterial(
      sunsetAccentMat,
      { color: '#3d302a', emissiveIntensity: 0 },
      { color: '#361810', emissiveIntensity: 2.2 },
      'late',
    );
    const r5 = registerDayMaterial(
      haloMat,
      { color: '#363d42', emissiveIntensity: 0 },
      { color: '#1a2228', emissiveIntensity: 1.8 },
      'late',
    );

    return () => {
      r1();
      r2();
      r3();
      r4();
      r5();
    };
  }, [leftScreenMat, rightScreenMat, cyanAccentMat, sunsetAccentMat, haloMat]);

  // Clean disposal on unmount
  useEffect(() => {
    return () => {
      leftAdTexture.dispose();
      rightAdTexture.dispose();
      leftScreenMat.dispose();
      rightScreenMat.dispose();
      cyanAccentMat.dispose();
      sunsetAccentMat.dispose();
      haloMat.dispose();
      hardware.plinth.dispose();
      hardware.frame.dispose();
      hardware.accentLeft.dispose();
      hardware.accentRight.dispose();
      hardware.groundHalo.dispose();
      screens.front.dispose();
      screens.back.dispose();
    };
  }, [
    leftAdTexture,
    rightAdTexture,
    leftScreenMat,
    rightScreenMat,
    cyanAccentMat,
    sunsetAccentMat,
    haloMat,
    hardware,
    screens,
  ]);

  // Calculate screen center Y position
  const screenCenterY = TOTEM.groundY + TOTEM.plinthHeight + 0.18 + TOTEM.screenHeight / 2;

  return (
    <group name="Entrance_Advertisement_Screens">
      {/* ============================================================== */}
      {/*  LEFT TOTEM: Tropical Day Beach Resort Visual ("ASTARA")       */}
      {/*  Positioned on pavement at x = -15.2, z = 23.1 in front of bed  */}
      {/* ============================================================== */}
      <group name="Totem_Left_AstaraDay" position={[TOTEM.leftX, 0, TOTEM.z]}>
        {/* Base Plinth */}
        <mesh
          name="Totem_Left_Plinth"
          geometry={hardware.plinth}
          material={MAT.concreteDark}
          castShadow
          receiveShadow
        />
        {/* Ground Perimeter Halo Light */}
        <mesh
          name="Totem_Left_GroundHalo"
          geometry={hardware.groundHalo}
          material={haloMat}
        />
        {/* Sleek Charcoal Frame & Cornice */}
        <mesh
          name="Totem_Left_Frame"
          geometry={hardware.frame}
          material={MAT.darkMetal}
          castShadow
          receiveShadow
        />
        {/* Vertical Edge Accent Glow Strips (Cyan-Blue) */}
        <mesh
          name="Totem_Left_EdgeAccents"
          geometry={hardware.accentLeft}
          material={cyanAccentMat}
        />

        {/* Double-Sided High-Definition LED Display (Front +Z and Back -Z) */}
        <group position={[0, screenCenterY, 0]}>
          <mesh
            name="Totem_Left_Display_Front"
            geometry={screens.front}
            material={leftScreenMat}
          />
          <mesh
            name="Totem_Left_Display_Back"
            geometry={screens.back}
            material={leftScreenMat}
          />
        </group>

        {/* Subtle nocturnal ambient ground puddle reflection */}
        <pointLight
          name="PL_Screen_Left"
          position={[0, 1.8, 0.4]}
          color="#42d8f8"
          intensity={night ? 10 : 0}
          distance={6}
          decay={2}
        />
      </group>

      {/* ============================================================== */}
      {/*  RIGHT TOTEM: Sunset Paradise Visual ("ASTARA")                */}
      {/*  Positioned on pavement at x = +15.2, z = 23.1 in front of bed  */}
      {/* ============================================================== */}
      <group name="Totem_Right_AstaraSunset" position={[TOTEM.rightX, 0, TOTEM.z]}>
        {/* Base Plinth */}
        <mesh
          name="Totem_Right_Plinth"
          geometry={hardware.plinth}
          material={MAT.concreteDark}
          castShadow
          receiveShadow
        />
        {/* Ground Perimeter Halo Light */}
        <mesh
          name="Totem_Right_GroundHalo"
          geometry={hardware.groundHalo}
          material={haloMat}
        />
        {/* Sleek Charcoal Frame & Cornice */}
        <mesh
          name="Totem_Right_Frame"
          geometry={hardware.frame}
          material={MAT.darkMetal}
          castShadow
          receiveShadow
        />
        {/* Vertical Edge Accent Glow Strips (Warm Sunset Amber) */}
        <mesh
          name="Totem_Right_EdgeAccents"
          geometry={hardware.accentRight}
          material={sunsetAccentMat}
        />

        {/* Double-Sided High-Definition LED Display (Front +Z and Back -Z) */}
        <group position={[0, screenCenterY, 0]}>
          <mesh
            name="Totem_Right_Display_Front"
            geometry={screens.front}
            material={rightScreenMat}
          />
          <mesh
            name="Totem_Right_Display_Back"
            geometry={screens.back}
            material={rightScreenMat}
          />
        </group>

        {/* Subtle nocturnal ambient ground puddle reflection */}
        <pointLight
          name="PL_Screen_Right"
          position={[0, 1.8, 0.4]}
          color="#ff9c42"
          intensity={night ? 10 : 0}
          distance={6}
          decay={2}
        />
      </group>
    </group>
  );
}
