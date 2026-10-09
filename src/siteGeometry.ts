import * as THREE from 'three';
import { merge, rng, type G } from './geo';
import { MAT, registerDayMaterial } from './materials';
import { installDayContactShading } from './dayShading';
import type { Point2, SiteRect } from './layout';

export function rectPoints({ x0, x1, z0, z1 }: SiteRect): Point2[] {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

export function roundedRect(rect: SiteRect, radius = 0.6, segments = 6): Point2[] {
  const { x0, x1, z0, z1 } = rect;
  const r = Math.min(radius, (x1 - x0) / 2, (z1 - z0) / 2);
  const points: Point2[] = [];
  const corners: [number, number, number][] = [
    [x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI],
  ];
  for (const [x, z, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const angle = start + i * Math.PI / (segments * 2);
      points.push([x + r * Math.cos(angle), z + r * Math.sin(angle)]);
    }
  }
  return points;
}

export function insetRect(rect: SiteRect, inset: number): SiteRect {
  return { x0: rect.x0 + inset, x1: rect.x1 - inset, z0: rect.z0 + inset, z1: rect.z1 - inset };
}

function path(points: Point2[], clockwise: boolean): THREE.Vector2[] {
  const vectors = points.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(vectors) !== clockwise) vectors.reverse();
  return vectors;
}

/** Closed, non-overlapping hardscape solids with world-aligned paving UVs. */
export function siteSurface(outline: Point2[], bottom: number, top: number, holes: Point2[][] = []): G {
  const shape = new THREE.Shape(path(outline, true));
  for (const hole of holes) shape.holes.push(new THREE.Path(path(hole, false)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, steps: 1, curveSegments: 6 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return pavingUV(geometry);
}

export function pavingUV(geometry: G): G {
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3.2, pos.getZ(i) / 1.6);
  return geometry;
}

export function mergeSite(parts: G[]): G {
  return merge(parts.map((part) => {
    if (!part.index) return part;
    const plain = part.toNonIndexed();
    part.dispose();
    return plain;
  }));
}

/** A true sloped solid, not thin surfaces stacked over a path. */
export function ramp(rect: SiteRect, backY: number, frontY: number): G {
  const shape = new THREE.Shape([
    new THREE.Vector2(rect.z0, -0.06), new THREE.Vector2(rect.z1, -0.06),
    new THREE.Vector2(rect.z1, frontY), new THREE.Vector2(rect.z0, backY),
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: rect.x1 - rect.x0, bevelEnabled: false, steps: 1 });
  // Original x becomes world z; extrusion depth becomes world x.
  geometry.applyMatrix4(new THREE.Matrix4().set(
    0, 0, -1, rect.x1,
    0, 1, 0, 0,
    1, 0, 0, 0,
    0, 0, 0, 1,
  ));
  return pavingUV(geometry);
}

export function rampX(rect: SiteRect, leftY: number, rightY: number): G {
  const shape = new THREE.Shape([
    new THREE.Vector2(rect.x0, -0.06), new THREE.Vector2(rect.x1, -0.06),
    new THREE.Vector2(rect.x1, rightY), new THREE.Vector2(rect.x0, leftY),
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: rect.z1 - rect.z0, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, rect.z0);
  return pavingUV(geometry);
}

let pavingMaterial: THREE.MeshStandardMaterial | null = null;

/** One shared 256px texture replaces hundreds of coplanar decorative paving strips. */
export function getPavingMaterial(): THREE.MeshStandardMaterial {
  if (pavingMaterial) return pavingMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = rng(725);
  ctx.fillStyle = '#e6e4df';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(96,89,81,${0.015 + random() * 0.035})`;
    ctx.fillRect(random() * 256, random() * 256, 1, 1);
  }
  ctx.strokeStyle = '#cfcdc7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, 254.5, 254.5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Site_Large_Format_Stone';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const material = MAT.stoneLight.clone();
  material.name = 'Site_Honed_Stone';
  material.map = texture;
  material.roughness = 0.9;
  registerDayMaterial(material, {
    color: '#b8b6ad', roughness: 0.92, envMapIntensity: 0.25,
  }, { color: '#c9c7c1', roughness: 0.9, envMapIntensity: 1 });
  installDayContactShading(material);
  pavingMaterial = material;
  return material;
}
