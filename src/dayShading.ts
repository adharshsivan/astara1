import * as THREE from 'three';
import { PODIUM, TOWER, TOWER_BASE, TOWER_H } from './dims';
import { visualDay } from './visualProfiles';

/** Analytic ambient/contact shading for the existing fixed landmark geometry.
 * Only indirect light is attenuated; sunlight and shadow maps stay physical.
 * No AO render target, noisy samples, texture, vertex attribute or extra mesh.
 */
export function installDayContactShading(material: THREE.MeshStandardMaterial) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const cacheKey = previousKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uDayContact = visualDay;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vDayWorld;
varying vec3 vDayNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 dayLocal = vec4(transformed, 1.0);
#ifdef USE_BATCHING
dayLocal = batchingMatrix * dayLocal;
#endif
#ifdef USE_INSTANCING
dayLocal = instanceMatrix * dayLocal;
#endif
vDayWorld = (modelMatrix * dayLocal).xyz;
vDayNormal = inverseTransformDirection(transformedNormal, viewMatrix);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uDayContact;
varying vec3 vDayWorld;
varying vec3 vDayNormal;
float dayAmbientVisibility(vec3 p, vec3 n) {
  float occlusion = 0.10 * smoothstep(0.15, 0.9, -n.y);
  float towerZone = step(${TOWER_BASE.toFixed(2)}, p.y)
    * (1.0 - step(${(TOWER_BASE + TOWER_H).toFixed(2)}, p.y))
    * (1.0 - step(${(TOWER.w / 2 + 2).toFixed(2)}, abs(p.x)))
    * (1.0 - step(${(TOWER.d / 2 + 2).toFixed(2)}, abs(p.z)));
  float zFace = step(abs(n.x), abs(n.z));
  float u = mix(p.z, p.x, zFace);
  float halfFace = mix(${(TOWER.d / 2).toFixed(2)}, ${(TOWER.w / 2).toFixed(2)}, zFace);
  float nearPier = min(abs(abs(u) - 0.85), abs(abs(u) - (halfFace - 1.5)));
  float pierContact = 1.0 - smoothstep(0.02, 0.32, nearPier);
  float ceilingGap = mod(${(TOWER_BASE - 0.1).toFixed(2)} - p.y + 100.0 * ${TOWER.fh.toFixed(2)}, ${TOWER.fh.toFixed(2)});
  float slabContact = 1.0 - smoothstep(0.03, 0.6, ceilingGap);
  occlusion += towerZone * (1.0 - abs(n.y)) * (0.12 * pierContact + 0.14 * slabContact);

  vec2 outside = max(abs(p.xz) - vec2(${(PODIUM.w / 2 + 0.6).toFixed(2)}, ${(PODIUM.d / 2 + 0.6).toFixed(2)}), vec2(0.0));
  float atFoot = (1.0 - smoothstep(0.02, 0.7, length(outside)))
    * (1.0 - smoothstep(0.18, 0.55, p.y)) * max(n.y, 0.0);
  occlusion += 0.18 * atFoot;
  return 1.0 - min(0.24, max(0.0, occlusion));
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
if (uDayContact > 0.0001) {
  float dayAO = mix(1.0, dayAmbientVisibility(vDayWorld, normalize(vDayNormal)), uDayContact);
  reflectedLight.indirectDiffuse *= dayAO;
  reflectedLight.indirectSpecular *= mix(1.0, dayAO, 0.55);
}`);
  };
  material.customProgramCacheKey = () => `${cacheKey}|day-contact-v1`;
}
