import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from './materials';
import { box, cyl, merge, rng, ring, type G } from './geo';
import { Instances, type InstanceItem } from './Instances';

/* ================================================================== */
/*  STYLISED PLANT LIBRARY                                             */
/*  ------------------------------------------------------------------ */
/*  A deliberately SMALL library that is reused everywhere:            */
/*    4 foliage variants   – arching fern / fan palm / dome shrub /    */
/*                            upright tropical                         */
/*    3 pot variants       – round lip pot / square planter / bowl     */
/*    2 tree canopy shapes + 1 trunk                                   */
/*    1 trough planter profile (any length)                            */
/*  Everything is instanced per variant, so the whole building's       */
/*  greenery costs ~20 draw calls and 6 materials.                     */
/* ================================================================== */

/** Balanced, slightly desaturated natural greens — no neon, no mud. */
export const LEAF_TONES = ['#4c7a39', '#5d8f45', '#6f9c4e', '#3f6b3c', '#7fa85a', '#4f8a5b'] as const;

/** Modern coastal planter tones: off-white, stone, sand, terracotta, charcoal, slate. */
export const POT_TONES = ['#ece7de', '#b9b4ab', '#c9bda9', '#a9714f', '#3c3f45', '#82898c'] as const;

/** Restrained bloom tones — accents only, never a bright wash. */
export const FLOWER_TONES = ['#f0e9df', '#e3b3bf', '#e08d78', '#c6b6d8', '#e6c36a'] as const;

/* ---------------- low level helpers ---------------- */

/** Uniform vertex colour so a merged mesh can vary tone in a single draw call. */
function paintSolid(g: G, shade: number): G {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Vertical gradient vertex colour — darker at the base, brighter at the tips. */
function paintGradient(g: G, low: number, high: number): G {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-4, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    const s = low + (high - low) * t;
    col[i * 3] = s;
    col[i * 3 + 1] = s;
    col[i * 3 + 2] = s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A single leaf blade: a 3-vertex-wide ribbon with a centre crease so it never
 * reads as flat paper. Rises along +Y, droops and sweeps toward +Z.
 * 12 triangles — cheap enough to use dozens of times per plant.
 */
function blade(len: number, width: number, segs: number, droop: number, sweep: number, tint: number): G {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = len * t * (1 - 0.2 * t * t) - droop * len * t * t;
    const z = sweep * len * t * t;
    const w = width * Math.sin(Math.PI * (0.12 + 0.88 * t));
    pos.push(-w, y, z, 0, y - width * 0.14, z, w, y, z);
    const s = tint * (0.74 + 0.4 * t);
    col.push(s, s, s, s * 0.9, s * 0.9, s * 0.9, s, s, s);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Blades merge with non-indexed icosphere lobes, so flatten the index.
  const flat = g.toNonIndexed();
  g.dispose();
  return flat;
}

/** Low-poly lobe with the uv attribute stripped so it can merge with blades. */
function lobe(r: number, detail = 0): G {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  return g;
}

/* ---------------- foliage variants (nominal height ≈ 0.45 m) ---------------- */

/** 0 — arching fern: the classic balcony fern, refined silhouettes, no blobs. */
function makeFern(seed: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const l = 0.4 + rand() * 0.22;
    const b = blade(l, 0.048, 3, 0.68 + rand() * 0.3, 0.28 + rand() * 0.22, 0.88 + rand() * 0.24);
    b.rotateX(-(0.62 + rand() * 0.5));
    b.rotateY(a);
    parts.push(b);
  }
  // tight crown so the plant reads as growing out of the soil
  parts.push(paintGradient(lobe(0.075), 0.7, 1.0).translate(0, 0.03, 0));
  return merge(parts);
}

/** 1 — fan palm: stiffer, wider radiating blades. Compact and premium. */
function makeFanPalm(seed: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const l = 0.46 + rand() * 0.16;
    const b = blade(l, 0.075, 3, 0.4 + rand() * 0.18, 0.18, 0.9 + rand() * 0.22);
    b.rotateX(-(0.4 + rand() * 0.28));
    b.rotateY(a);
    parts.push(b);
  }
  parts.push(paintGradient(lobe(0.07), 0.7, 1.0).translate(0, 0.04, 0));
  return merge(parts);
}

/** 2 — dome shrub: a neat clipped dome built from one slightly larger core lobe
 * plus a tighter outer ring, so it reads as one tidy shape, not a pile of blobs. */
function makeShrub(seed: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  const core = paintGradient(lobe(0.13, 1), 0.58, 1.02);
  core.scale(1.05, 0.82 + rand() * 0.18, 1.05);
  core.translate(0, 0.13, 0);
  parts.push(core);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const r = 0.065 + rand() * 0.055;
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const rad = 0.08 + rand() * 0.07;
    const g = paintGradient(lobe(r, 1), 0.6, 1.1);
    g.scale(1, 0.72 + rand() * 0.26, 1);
    g.rotateY(rand() * Math.PI);
    g.translate(Math.cos(a) * rad, 0.11 + rand() * 0.13, Math.sin(a) * rad);
    parts.push(g);
  }
  return merge(parts);
}

/** 3 — upright tropical: near-vertical blades (snake / bird's-nest read). */
function makeUpright(seed: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const l = 0.4 + rand() * 0.22;
    const b = blade(l, 0.062, 3, 0.2 + rand() * 0.16, 0.1, 0.86 + rand() * 0.26);
    b.rotateX(-(0.1 + rand() * 0.26));
    b.rotateY(a);
    b.translate(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03);
    parts.push(b);
  }
  parts.push(paintGradient(lobe(0.06), 0.7, 1.0).translate(0, 0.03, 0));
  return merge(parts);
}

/** 4 — flowering accent: compact mound on slim upright stems that carry the blooms. */
function makeFlowering(seed: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  for (let i = 0; i < 8; i++) {
    const r = 0.075 + rand() * 0.055;
    const a = (i / 8) * Math.PI * 2 + rand() * 0.4;
    const rad = 0.015 + rand() * 0.1;
    const g = paintGradient(lobe(r), 0.62, 1.0);
    g.scale(1, 0.62 + rand() * 0.24, 1);
    g.rotateY(rand() * Math.PI);
    g.translate(Math.cos(a) * rad, 0.055 + rand() * 0.11, Math.sin(a) * rad);
    parts.push(g);
  }
  // stems the petal clusters sit on
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    const rad = 0.035 + rand() * 0.07;
    const h = 0.19 + rand() * 0.13;
    parts.push(paintGradient(cyl(0.007, 0.011, h, Math.cos(a) * rad, h / 2, Math.sin(a) * rad, 5), 0.7, 1.0));
  }
  return merge(parts);
}

/** 5 — topiary: a small clipped form on a slim stem, a premium ornamental accent. */
function makeTopiary(seed: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  // slim trunk and a neat base tuft
  parts.push(paintGradient(cyl(0.011, 0.02, 0.2, 0, 0.1, 0, 6), 0.6, 0.95));
  const tuft = paintGradient(lobe(0.085, 1), 0.6, 1.0);
  tuft.scale(1, 0.7, 1);
  tuft.translate(0, 0.14, 0);
  parts.push(tuft);
  // two clipped domes, the upper one slightly off-centre for a hand-trimmed feel
  const crown = paintGradient(lobe(0.125, 1), 0.6, 1.05);
  crown.scale(0.94, 0.86, 0.94);
  crown.translate(0, 0.315, 0);
  parts.push(crown);
  const top = paintGradient(lobe(0.088, 1), 0.66, 1.08);
  top.scale(0.95, 0.84, 0.95);
  top.translate((rand() - 0.5) * 0.03, 0.46, (rand() - 0.5) * 0.03);
  parts.push(top);
  return merge(parts);
}

/**
 * Flower-bed clump: a dense dome of ~40 blooms covering roughly a 0.5 m
 * footprint, with only a thin dark base ring under the lowest flowers. No
 * leaves or stems — this is what fills the long trays edge to edge. Instance-
 * coloured, one shared geometry for every bed colour.
 */
function makeBloomMass(): G {
  const rand = rng(1313);
  const parts: G[] = [];
  const rings = [
    { n: 1, rad: 0, y: 0.19, r: 0.052 },
    { n: 6, rad: 0.075, y: 0.17, r: 0.048 },
    { n: 11, rad: 0.15, y: 0.135, r: 0.046 },
    { n: 15, rad: 0.225, y: 0.09, r: 0.044 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + rand() * 0.5;
      const rad = ring.rad * (0.9 + rand() * 0.18);
      const r = ring.r * (0.9 + rand() * 0.22);
      const g = new THREE.ConeGeometry(r, r * 0.9, 5, 1);
      g.scale(1, 0.46, 1);
      g.rotateX((rand() - 0.5) * 0.5);
      g.rotateZ((rand() - 0.5) * 0.5);
      g.translate(Math.cos(a) * rad, ring.y + (rand() - 0.5) * 0.03, Math.sin(a) * rad);
      parts.push(g);
    }
  }
  return merge(parts);
}

/**
 * Petal clusters that ride on the flowering stems — 14 squat five-sided blooms.
 * Instance-coloured, so one shared geometry covers every flower colour.
 */
function makePetals(): G {
  const rand = rng(808);
  const parts: G[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const rad = rand() * 0.115;
    const r = 0.026 + rand() * 0.014;
    const g = new THREE.ConeGeometry(r, r * 0.95, 5, 1);
    g.scale(1, 0.42, 1);
    g.translate(Math.cos(a) * rad, 0.22 + rand() * 0.15, Math.sin(a) * rad);
    parts.push(g);
  }
  return merge(parts);
}

/* ---------------- pots (base at y = 0) ---------------- */

/** Tapered round pot with a proper lip and a recessed interior. */
function makePotRound(): G {
  const p: [number, number][] = [
    [0, 0], [0.108, 0], [0.148, 0.012], [0.192, 0.2], [0.206, 0.25],
    [0.216, 0.288], [0.216, 0.318], [0.19, 0.318], [0.178, 0.288], [0.166, 0.272],
  ];
  const g = new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), 14);
  g.computeVertexNormals();
  return g;
}

/** Square tapered planter with a proud rim — the "architectural" pot. */
function makePotSquare(): G {
  const tapered = (rT: number, rB: number, h: number, zs: number, y: number) => {
    const g = new THREE.CylinderGeometry(rT, rB, h, 4, 1, true);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, zs);
    g.translate(0, y + h / 2, 0);
    return g;
  };
  return merge([
    tapered(0.2 * Math.SQRT2, 0.152 * Math.SQRT2, 0.27, 1, 0),
    tapered(0.228 * Math.SQRT2, 0.228 * Math.SQRT2, 0.045, 1, 0.262),
  ]);
}

/** Low wide bowl for compact ornamentals. */
function makePotBowl(): G {
  const p: [number, number][] = [
    [0, 0], [0.17, 0], [0.26, 0.022], [0.305, 0.085], [0.318, 0.15],
    [0.318, 0.176], [0.294, 0.176], [0.282, 0.148], [0.268, 0.132],
  ];
  const g = new THREE.LatheGeometry(p.map(([x, y]) => new THREE.Vector2(x, y)), 16);
  g.computeVertexNormals();
  return g;
}

/** Nominal soil level and radius per pot variant (used to seat the plants). */
export const POT_SOIL_Y = [0.286, 0.286, 0.148];
export const POT_RADIUS = [0.178, 0.196, 0.27];

/* ---------------- soil plug (unit cylinder, base at y = 0) ---------------- */
function makeSoil(): G {
  const g = new THREE.CylinderGeometry(1, 0.94, 1, 12, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/* ---------------- trees ---------------- */

/** Shared tapered, slightly leaning trunk with three branches. Height ≈ 1.95. */
function makeTrunk(): G {
  const seg = (rT: number, rB: number, len: number, ox: number, oy: number, oz: number) => {
    const g = new THREE.CylinderGeometry(rT, rB, len, 7, 1);
    g.translate(0, len / 2, 0);
    g.translate(ox, oy, oz);
    return g;
  };
  const branch = (len: number, rT: number, rB: number, rx: number, rz: number, ox: number, oy: number, oz: number) => {
    const g = new THREE.CylinderGeometry(rT, rB, len, 6, 1);
    g.translate(0, len / 2, 0);
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(ox, oy, oz);
    return g;
  };
  const root = cyl(0.22, 0.32, 0.16, 0, 0.08, 0, 9);
  return merge([
    root,
    seg(0.09, 0.14, 0.7, 0, 0.12, 0),
    seg(0.065, 0.092, 0.64, 0.03, 0.78, 0.015),
    seg(0.04, 0.066, 0.55, 0.07, 1.38, 0.04),
    // branches splay out under the base ring of the crown instead of poking
    // through it
    branch(0.72, 0.03, 0.052, 0.95, 0.3, 0.05, 1.06, 0.02),
    branch(0.6, 0.026, 0.044, 0.4, -1.05, 0.04, 1.2, 0.05),
    branch(0.52, 0.022, 0.038, -0.9, -0.25, 0.02, 1.36, -0.03),
  ]);
}

/**
 * Canopy: a deliberate three-tier crown — a wide base ring, a tighter middle
 * layer and a top knot. The tiers give a readable silhouette at distance;
 * per-lobe jitter keeps individual trees from looking cloned.
 */
function canopyLobes(seed: number, n: number, spread: number, squash: number, baseY: number): G {
  const rand = rng(seed);
  const parts: G[] = [];
  const baseCount = 4 + (n % 2); // 5 or 4 lobes on the bottom ring
  const tiers = [
    { count: baseCount, y: 0, r: 0.34, rad: 0.52, squish: 1 },
    { count: 3, y: 0.3, r: 0.29, rad: 0.3, squish: 0.9 },
    { count: 2, y: 0.52, r: 0.23, rad: 0.15, squish: 0.8 },
  ];
  let first = true;
  for (const tier of tiers) {
    for (let j = 0; j < tier.count; j++) {
      const a = (j / tier.count) * Math.PI * 2 + (first ? 0.4 : rand() * 0.7);
      const r = spread * tier.r * (0.86 + rand() * 0.26);
      const rad = spread * tier.rad * (0.78 + rand() * 0.44);
      const g = paintGradient(lobe(r, 1), 0.56, 1.1);
      g.scale(1, squash * tier.squish * (0.82 + rand() * 0.3), 0.94 + rand() * 0.12);
      g.rotateY(rand() * Math.PI);
      g.translate(
        Math.cos(a) * rad,
        baseY + tier.y * spread + (rand() - 0.32) * 0.09,
        Math.sin(a) * rad * 0.92,
      );
      parts.push(g);
      first = false;
    }
  }
  // a few small outer tufts soften the outline without reading as a ball
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const rad = spread * (0.42 + rand() * 0.22);
    const r = spread * (0.13 + rand() * 0.09);
    const g = paintGradient(lobe(r, 0), 0.68, 1.1);
    g.scale(1, 0.66 + rand() * 0.3, 1);
    g.translate(Math.cos(a) * rad, baseY + (0.18 + rand() * 0.4) * spread, Math.sin(a) * rad);
    parts.push(g);
  }
  return merge(parts);
}


/* ---------------- trough / planter bodies ---------------- */

export interface TroughSpec {
  x: number;
  y: number;
  z: number;
  len: number;
  alongZ?: boolean;
  tone?: number;
  /** Y rotation applied after alongZ — lets a trough follow any facade face. */
  ry?: number;
}

const troughCache = new Map<string, G>();

/**
 * Modern tapered trough: body + proud rim, both baked into one geometry with a
 * vertex-colour tone. Height 0.55, base tapers in 12 % — reads as site furniture
 * rather than a leftover block.
 */
export function troughGeometry(len: number): G {
  const key = len.toFixed(2);
  const hit = troughCache.get(key);
  if (hit) return hit;
  const w = 0.62;
  const h = 0.55;
  const body = (() => {
    const rT = (w / 2) * Math.SQRT2;
    const rB = (w / 2 * 0.86) * Math.SQRT2;
    const g = new THREE.CylinderGeometry(rT, rB, h, 4, 1, true);
    g.rotateY(Math.PI / 4);
    g.scale(len / w, 1, 1);
    g.translate(0, h / 2, 0);
    return g;
  })();
  const cap = 0.07;
  const parts: G[] = [
    body,
    // proud rim, sunk 1 cm into the body so it can never float
    ...ring(len + cap, w + cap, cap, 0.08, 0, h - 0.012, 0),
  ];
  const g = merge(parts);
  troughCache.set(key, g);
  return g;
}

/** Top opening size of a trough (used to seat the plants). */
export const TROUGH_SOIL_Y = 0.46;

/** Dark liner so an open planter never shows a see-through wall. */
function makeLiner(len: number): G {
  return box(len - 0.03, 0.06, 0.6, 0, TROUGH_SOIL_Y - 0.03, 0);
}

/* ================================================================== */
/*  ASSETS                                                             */
/* ================================================================== */

export interface PlantAssets {
  pot: [G, G, G];
  soil: G;
  /** 0 fern · 1 fan palm · 2 dome shrub · 3 upright tropical · 4 flowering · 5 topiary */
  leaf: G[];
  /** Instance-coloured blooms that ride on the flowering stems. */
  petal: G;
  /** Dense bloom dome used to fill the long flower trays edge to edge. */
  bloomMass: G;
  canopy: [G, G];
  trunk: G;
}

let cached: PlantAssets | null = null;

/** Built once for the whole project and shared by every plant group. */
export function plantAssets(): PlantAssets {
  if (cached) return cached;
  cached = {
    pot: [makePotRound(), makePotSquare(), makePotBowl()],
    soil: makeSoil(),
    leaf: [
      makeFern(101), makeFanPalm(202), makeShrub(303), makeUpright(404),
      makeFlowering(505), makeTopiary(606),
    ],
    petal: makePetals(),
    bloomMass: makeBloomMass(),
    canopy: [
      canopyLobes(909, 9, 1.12, 0.84, 1.72),
      canopyLobes(1201, 8, 0.98, 1.0, 1.62),
    ],
    trunk: makeTrunk(),
  };
  return cached;
}

export function disposePlantAssets() {
  if (!cached) return;
  cached.pot.forEach((g) => g.dispose());
  cached.soil.dispose();
  cached.leaf.forEach((g) => g.dispose());
  cached.petal.dispose();
  cached.bloomMass.dispose();
  cached.canopy.forEach((g) => g.dispose());
  cached.trunk.dispose();
  cached = null;
}

/* ================================================================== */
/*  PLACEMENT TYPES                                                    */
/* ================================================================== */

export interface PottedPlantSpec {
  p: [number, number, number];
  ry?: number;
  s?: number;
  /** foliage variant 0..3 */
  v?: number;
  /** pot variant 0..2 */
  pot?: number;
  /** index into POT_TONES */
  tone?: number;
  /** index into LEAF_TONES */
  leaf?: number;
  /** index into FLOWER_TONES — only used by the flowering variant (4) */
  flower?: number;
  /** Absolute foliage base height; overrides the pot's own soil level. */
  soilY?: number;
}

export interface TreeSpec {
  p: [number, number, number];
  ry?: number;
  s?: number;
  /** canopy variant 0..1 */
  v?: number;
  leaf?: number;
  /** index into POT_TONES, omit for trees planted in ground */
  pot?: number;
  /** pot variant 0..2 (defaults to the round lip pot) */
  potShape?: number;
  /** index into POT_TONES for the pot body */
  potTone?: number;
  /** extra size multiplier for the tree's planter (trees need much bigger pots) */
  potScale?: number;
}

export function potItems(items: PottedPlantSpec[]): { geo: G; items: InstanceItem[] }[] {
  const a = plantAssets();
  return a.pot.map((geo, variant) => ({
    geo,
    items: items
      .filter((it) => (it.pot ?? 0) === variant)
      .map<InstanceItem>((it) => ({
        p: it.p,
        r: [0, it.ry ?? 0, 0],
        s: it.s ?? 1,
        c: POT_TONES[(it.tone ?? 0) % POT_TONES.length],
      })),
  }));
}

export function soilItems(items: PottedPlantSpec[]): InstanceItem[] {
  const items2 = items.map<InstanceItem>((it) => {
    const v = it.pot ?? 0;
    const s = it.s ?? 1;
    return {
      p: [it.p[0], (it.soilY ?? it.p[1] + POT_SOIL_Y[v] * s - 0.02) - 0.012, it.p[2]],
      s: [POT_RADIUS[v] * s * 0.94, 0.05, POT_RADIUS[v] * s * 0.94],
      c: '#4a3a2c',
    };
  });
  return items2;
}

export function leafItems(items: PottedPlantSpec[]): { geo: G; items: InstanceItem[] }[] {
  const a = plantAssets();
  return a.leaf.map((geo, variant) => ({
    geo,
    items: items
      .filter((it) => (it.v ?? 0) === variant)
      .map<InstanceItem>((it) => {
        const v = it.pot ?? 0;
        const s = it.s ?? 1;
        return {
          p: [it.p[0], it.soilY ?? it.p[1] + POT_SOIL_Y[v] * s - 0.02, it.p[2]],
          r: [0, it.ry ?? 0, 0],
          s,
          c: LEAF_TONES[(it.leaf ?? 0) % LEAF_TONES.length],
        };
      }),
  }));
}

export function treeCanopyItems(items: TreeSpec[]): { geo: G; items: InstanceItem[] }[] {
  const a = plantAssets();
  return a.canopy.map((geo, variant) => ({
    geo,
    items: items
      .filter((it) => (it.v ?? 0) === variant)
      .map<InstanceItem>((it) => ({
        p: it.p,
        r: [0, it.ry ?? 0, 0],
        s: it.s ?? 1,
        c: LEAF_TONES[(it.leaf ?? 0) % LEAF_TONES.length],
      })),
  }));
}

export function treeTrunkItems(items: TreeSpec[]): InstanceItem[] {
  return items.map<InstanceItem>((it) => ({ p: it.p, r: [0, it.ry ?? 0, 0], s: it.s ?? 1 }));
}

/* ================================================================== */
/*  COMPONENTS                                                         */
/* ================================================================== */

interface PottedPlantsProps {
  name: string;
  items: PottedPlantSpec[];
  castShadow?: boolean;
}

/** Pot + soil + foliage for a set of potted plants. Empty variants are skipped. */
export function PottedPlants({ name, items, castShadow = true }: PottedPlantsProps) {
  const a = plantAssets();
  const pots = useMemo(() => potItems(items), [items]);
  const soil = useMemo(() => soilItems(items), [items]);
  const leaves = useMemo(() => leafItems(items), [items]);
  // Blooms ride at the same soil offset as the flowering foliage they belong to.
  const petals = useMemo(() => {
    const out: InstanceItem[] = [];
    for (const it of items) {
      if ((it.v ?? 0) !== 4) continue;
      const s = it.s ?? 1;
      out.push({
        p: [it.p[0], it.p[1] + POT_SOIL_Y[it.pot ?? 0] * s - 0.02, it.p[2]],
        r: [0, it.ry ?? 0, 0],
        s,
        c: FLOWER_TONES[(it.flower ?? 0) % FLOWER_TONES.length],
      });
    }
    return out;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <group name={name}>
      {pots.map(
        (g, i) =>
          g.items.length > 0 && (
            <Instances key={`pot${i}`} name={`${name}_Pot${i}`} geometry={g.geo} material={MAT.pottery} items={g.items} castShadow={castShadow} receiveShadow />
          ),
      )}
      {soil.length > 0 && (
        <Instances name={`${name}_Soil`} geometry={a.soil} material={MAT.soil} items={soil} />
      )}
      {leaves.map(
        (g, i) =>
          g.items.length > 0 && (
            <Instances key={`leaf${i}`} name={`${name}_Foliage${i}`} geometry={g.geo} material={MAT.foliage} items={g.items} castShadow={castShadow} />
          ),
      )}
      {petals.length > 0 && (
        <Instances name={`${name}_Blooms`} geometry={a.petal} material={MAT.petal} items={petals} />
      )}
    </group>
  );
}

interface TreesProps {
  name: string;
  items: TreeSpec[];
  castShadow?: boolean;
}

/** Potted or in-ground trees: trunk + canopy (+ optional pot). */
export function Trees({ name, items, castShadow = true }: TreesProps) {
  const a = plantAssets();
  // A potted tree is lifted so its trunk base sits at the planter's soil level.
  const lifted = useMemo(
    () =>
      items.map((it) => ({
        it,
        lift: it.pot !== undefined ? POT_SOIL_Y[it.potShape ?? 0] * (it.s ?? 1) * (it.potScale ?? 1) : 0,
      })),
    [items],
  );
  const canopies = useMemo(() => treeCanopyItems(items), [items]);
  const trunks = useMemo(
    () =>
      lifted.map<InstanceItem>(({ it, lift }) => ({
        p: [it.p[0], it.p[1] + lift, it.p[2]],
        r: [0, it.ry ?? 0, 0],
        s: it.s ?? 1,
      })),
    [lifted],
  );
  const potted = useMemo(
    () =>
      items
        .filter((it) => it.pot !== undefined)
        .map<PottedPlantSpec>((it) => ({
          p: it.p,
          s: (it.s ?? 1) * (it.potScale ?? 1),
          pot: it.potShape ?? 0,
          tone: it.potTone ?? it.pot,
          ry: it.ry,
        })),
    [items],
  );
  if (items.length === 0) return null;
  return (
    <group name={name}>
      {potted.length > 0 && <PottedPlantsOnlyPots name={`${name}_Pots`} items={potted} />}
      <Instances name={`${name}_Trunks`} geometry={a.trunk} material={MAT.bark} items={trunks} castShadow={castShadow} />
      {canopies.map(
        (g, i) =>
          g.items.length > 0 && (
            <Instances key={`c${i}`} name={`${name}_Canopy${i}`} geometry={g.geo} material={MAT.foliage} items={g.items} castShadow={castShadow} />
          ),
      )}
    </group>
  );
}

/** Pot + soil only (no foliage) — used for tree pots. */
function PottedPlantsOnlyPots({ name, items }: { name: string; items: PottedPlantSpec[] }) {
  const a = plantAssets();
  const pots = useMemo(() => potItems(items), [items]);
  const soil = useMemo(() => soilItems(items), [items]);
  return (
    <group name={name}>
      {pots.map(
        (g, i) =>
          g.items.length > 0 && (
            <Instances key={`p${i}`} name={`${name}_Pot${i}`} geometry={g.geo} material={MAT.pottery} items={g.items} castShadow receiveShadow />
          ),
      )}
      {soil.length > 0 && <Instances name={`${name}_Soil`} geometry={a.soil} material={MAT.soil} items={soil} />}
    </group>
  );
}

interface TroughsProps {
  name: string;
  troughs: TroughSpec[];
  /** Foliage specs (absolute world/parent space) planted in each trough. */
  planting: (t: TroughSpec, index: number) => PottedPlantSpec[];
  castShadow?: boolean;
}

/**
 * Trough planters with the ugly green block replaced by a row of properly
 * modelled plants. Bodies merge into one draw call (tone baked per trough).
 */
export function TroughPlanters({ name, troughs, planting, castShadow = true }: TroughsProps) {
  const a = plantAssets();
  const bodies = useMemo(() => {
    const parts: G[] = [];
    troughs.forEach((t) => {
      const g = troughGeometry(t.len).clone();
      if (t.alongZ) g.rotateY(Math.PI / 2);
      if (t.ry) g.rotateY(t.ry);
      g.translate(t.x, t.y, t.z);
      parts.push(paintSolid(g, 0.62 + ((t.tone ?? 0) % 3) * 0.19));
    });
    return parts.length ? merge(parts) : null;
  }, [troughs]);

  const liners = useMemo(() => {
    const parts: G[] = troughs.map((t) => {
      const g = makeLiner(t.len);
      if (t.alongZ) g.rotateY(Math.PI / 2);
      if (t.ry) g.rotateY(t.ry);
      g.translate(t.x, t.y, t.z);
      return g;
    });
    return parts.length ? merge(parts) : null;
  }, [troughs]);

  const all = useMemo(
    () => troughs.flatMap((t, i) => planting(t, i).map((f) => ({ ...f }))),
    [troughs, planting],
  );
  // Ordinary potted specs (v 0–5) render as foliage. Specs tagged v = BLOOM_MASS
  // are dense flower clumps and render on the bloom-mass geometry instead.
  const foliage = useMemo(() => leafItems(all.filter((s) => (s.v ?? 0) !== BLOOM_MASS)), [all]);
  const petals = useMemo(
    () =>
      all
        .filter((spec) => (spec.v ?? 0) === 4)
        .map<InstanceItem>((spec) => ({
          p: [spec.p[0], spec.soilY ?? spec.p[1], spec.p[2]],
          r: [0, spec.ry ?? 0, 0],
          s: spec.s ?? 1,
          c: FLOWER_TONES[(spec.flower ?? 0) % FLOWER_TONES.length],
        })),
    [all],
  );
  const masses = useMemo(
    () =>
      all
        .filter((spec) => (spec.v ?? 0) === BLOOM_MASS)
        .map<InstanceItem>((spec) => ({
          p: [spec.p[0], spec.soilY ?? spec.p[1], spec.p[2]],
          r: [0, spec.ry ?? 0, 0],
          s: spec.s ?? 1,
          c: FLOWER_TONES[(spec.flower ?? 0) % FLOWER_TONES.length],
        })),
    [all],
  );

  if (troughs.length === 0) return null;
  return (
    <group name={name}>
      {bodies && (
        <mesh name={`${name}_Bodies`} geometry={bodies} material={MAT.planterStone} castShadow={castShadow} receiveShadow />
      )}
      {liners && <mesh name={`${name}_Liners`} geometry={liners} material={MAT.soil} />}
      {foliage.map(
        (g, i) =>
          g.items.length > 0 && (
            <Instances key={`f${i}`} name={`${name}_Foliage${i}`} geometry={g.geo} material={MAT.foliage} items={g.items} castShadow={castShadow} />
          ),
      )}
      {petals.length > 0 && (
        <Instances name={`${name}_Blooms`} geometry={a.petal} material={MAT.petal} items={petals} />
      )}
      {masses.length > 0 && (
        <Instances name={`${name}_FlowerBed`} geometry={a.bloomMass} material={MAT.petal} items={masses} castShadow={castShadow} />
      )}
    </group>
  );
}

/** Variant tag that tells TroughPlanters to render a dense bloom clump. */
export const BLOOM_MASS = 9;

/**
 * A solid flower bed for the long troughs: dense bloom clumps tiled edge to
 * edge along the tray with no gaps and no green plants between them. One
 * trough keeps one or two tones in a soft alternating rhythm, so the bed reads
 * as designed rather than mixed. Honours alongZ and ry so the bed follows a
 * rotated trough.
 */
export function troughFlowerRow(
  t: TroughSpec,
  seed: number,
  opts: { count?: number; scale?: [number, number]; tones?: number[] } = {},
): PottedPlantSpec[] {
  const rand = rng(seed);
  // Clump footprint ≈ 0.5 m; pitch 0.36 m gives ~30 % overlap so no gaps show.
  const pitch = 0.36;
  const usable = Math.max(0.3, t.len - 0.26);
  const count = opts.count ?? Math.max(2, Math.ceil(usable / pitch) + 1);
  const [s0, s1] = opts.scale ?? [0.9, 1.08];
  const tones = opts.tones ?? [0, 2];
  const c = Math.cos(t.ry ?? 0);
  const s = Math.sin(t.ry ?? 0);
  const out: PottedPlantSpec[] = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : (i / (count - 1) - 0.5) * usable;
    const jx = (rand() - 0.5) * 0.05;
    const jz = (rand() - 0.5) * 0.08;
    const lx = t.alongZ ? jz : u + jx;
    const lz = t.alongZ ? u + jx : jz;
    out.push({
      p: [t.x + lx * c + lz * s, t.y, t.z - lx * s + lz * c],
      soilY: t.y + TROUGH_SOIL_Y - 0.1,
      ry: rand() * Math.PI * 2,
      s: s0 + rand() * (s1 - s0),
      v: BLOOM_MASS,
      flower: tones[i % tones.length],
    });
  }
  return out;
}
