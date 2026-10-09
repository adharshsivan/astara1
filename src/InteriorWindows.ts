import * as THREE from 'three';
import { merge, type G } from './geo';
import { envNight } from './visualProfiles';
import { assignInteriorUnits, auditInteriorUnits, paneRoomMapping, type Pane } from './units';
import { interiorFragmentShader, interiorVertexShader } from './shaders';

export type { Pane, InteriorUnit, InteriorAudit } from './units';
export { assignInteriorUnits } from './units';

export const interiorDebugMode = { value: 0 };

/** A single opaque facade draw with fused glass sheen and three virtual depths. */
export function createInteriorMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'Window_ParallaxInterior',
    glslVersion: THREE.GLSL3,
    vertexShader: interiorVertexShader,
    fragmentShader: interiorFragmentShader,
    uniforms: {
      uDepth: { value: 1.7 },
      uNight: envNight,
      uSkyColor: { value: new THREE.Color('#141c3a') },
      uWorldToLocal: { value: new THREE.Matrix4() },
      uDebugMode: interiorDebugMode,
    },
    transparent: false,
    depthTest: true,
    depthWrite: true,
    alphaHash: false,
    dithering: false,
    side: THREE.FrontSide,
    // The actual panes are already 0.3 m in front of the opaque core. No
    // polygon-offset trick or additional nearly coplanar glass layer is needed.
    polygonOffset: false,
  });
  material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => {
    (material.uniforms.uWorldToLocal.value as THREE.Matrix4).copy(object.matrixWorld).invert();
    material.uniformsNeedUpdate = true;
  };
  return material;
}

/** Positions, normals, UVs and triangle counts match the original pane quads. */
export function buildPaneGeometry(panes: Pane[]): G {
  if (panes.some((pane) => !pane.room)) assignInteriorUnits(panes);
  const units = [...new Map(panes.map((p) => [p.room!.id, p.room!])).values()];
  const audit = auditInteriorUnits(panes, units);
  // Facade artwork must never take the whole viewer down. Report audit issues
  // (they also surface in Interior motion QA) and keep rendering.
  if (audit.errors.length) {
    console.error(`[Lokam interiors] ${audit.errors.length} layout audit issue(s); rendering continues.`, audit.errors);
  }
  const parts: G[] = [];
  for (const pane of panes) {
    const room = pane.room!;
    const g = new THREE.PlaneGeometry(pane.w, pane.h);
    const vertexCount = g.getAttribute('position').count;
    const fill = (values: number[]) => {
      const array = new Float32Array(vertexCount * values.length);
      for (let i = 0; i < vertexCount; i++) array.set(values, i * values.length);
      return new THREE.BufferAttribute(array, values.length);
    };
    const height = room.top - room.bottom;
    g.setAttribute('aTangent', fill([Math.cos(pane.ry), 0, -Math.sin(pane.ry)]));
    g.setAttribute('aRoomMap', fill(paneRoomMapping(pane)));
    g.setAttribute('aUnitInfo', fill([room.roomType, room.palette, room.brightness, room.curtainMode]));
    g.setAttribute('aRoomConfig', fill([(room.right - room.left) / height, room.depth * 2 / height, height / 2, room.dayLift]));
    g.setAttribute('aRoomStyle', fill([room.curtainAmount, room.mainAnchor, room.secondaryAnchor, room.mainHalfWidth]));
    // Discrete styles share the existing four-float attribute; no extra buffers.
    g.setAttribute('aPalette', fill([room.finishVariation, room.fabricVariation,
      room.artVariation + room.richness * 4, room.layoutVariant + (room.mirrorX < 0 ? 4 : 0)]));
    // One extra flat vec4 carries the whole room's wall + curtain dressing. It is
    // a per-unit constant, so it costs one attribute slot and no draw calls.
    g.setAttribute('aRoomFinish', fill([room.wallStyle + room.wallTreatment * 8,
      room.wallTone, room.curtainFabric, room.curtainFullness]));
    g.setAttribute('aUnitOrigin', fill(room.origin));
    g.rotateY(pane.ry);
    g.translate(pane.x, pane.y, pane.z);
    parts.push(g);
  }
  const geometry = merge(parts);
  if (geometry.index?.count !== panes.length * 6 || geometry.getAttribute('position')?.count !== panes.length * 4) {
    const message = 'Interior geometry budget changed: expected one four-vertex, two-triangle quad per pane.';
    audit.errors.push(message);
    console.error(`[Lokam interiors] ${message}`);
  }
  geometry.name = 'Windows_UnitParallax_Quads';
  geometry.userData.interiorAudit = audit;
  geometry.userData.interiorUnits = units;
  geometry.computeBoundingBox();
  return geometry;
}
