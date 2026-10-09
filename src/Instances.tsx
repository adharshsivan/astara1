import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface InstanceItem {
  p: [number, number, number];
  r?: [number, number, number];
  s?: number | [number, number, number];
  c?: THREE.ColorRepresentation;
}

interface Props {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceItem[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Thin wrapper around THREE.InstancedMesh.
 * All N copies render in a single draw call and export to glTF via
 * EXT_mesh_gpu_instancing.
 */
export function Instances({ name, geometry, material, items, castShadow, receiveShadow }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const helpers = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { o, c } = helpers;
    let hasColor = false;
    items.forEach((it, i) => {
      o.position.set(it.p[0], it.p[1], it.p[2]);
      const r = it.r ?? [0, 0, 0];
      o.rotation.set(r[0], r[1], r[2]);
      const s = it.s ?? 1;
      if (typeof s === 'number') o.scale.setScalar(s);
      else o.scale.set(s[0], s[1], s[2]);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (it.c !== undefined) {
        mesh.setColorAt(i, c.set(it.c));
        hasColor = true;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, helpers]);

  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, Math.max(1, items.length)]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
