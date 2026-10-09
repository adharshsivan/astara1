import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * Exports the building group to a binary .glb and triggers a download.
 * Instanced meshes are written with EXT_mesh_gpu_instancing,
 * neon materials carry KHR_materials_emissive_strength and the
 * point lights are stored via KHR_lights_punctual.
 */
export async function exportGLB(root: THREE.Object3D, filename = 'lokam_sky_lounge.glb') {
  // Temporarily force everything visible so hidden layers are still in the file.
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });

  const exporter = new GLTFExporter();
  try {
    const result = await exporter.parseAsync(root, {
      binary: true,
      onlyVisible: true,
      includeCustomExtensions: false,
    });
    const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } finally {
    hidden.forEach((o) => (o.visible = false));
  }
}

export interface AssetStats {
  meshes: number;
  instancedMeshes: number;
  instances: number;
  materials: number;
  triangles: number;
  lights: number;
}

/** Cheap census of the exported asset, shown in the inspector. */
export function inspectAsset(root: THREE.Object3D): AssetStats {
  let meshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let triangles = 0;
  let lights = 0;
  const materials = new Set<string>();

  root.traverse((o) => {
    const anyObj = o as unknown as { isMesh?: boolean; isInstancedMesh?: boolean; isLight?: boolean; count?: number };
    if (anyObj.isInstancedMesh) {
      instancedMeshes++;
      instances += anyObj.count ?? 0;
    } else if (anyObj.isMesh) {
      meshes++;
    }
    if (anyObj.isLight) lights++;

    const mesh = o as unknown as THREE.Mesh;
    if (mesh.geometry?.attributes?.position) {
      const pos = mesh.geometry.attributes.position;
      triangles += (mesh.geometry.index ? mesh.geometry.index.count : pos.count) / 3;
    }
    const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m.uuid));
    else if (mat) materials.add(mat.uuid);
  });

  return {
    meshes,
    instancedMeshes,
    instances,
    materials: materials.size,
    triangles: Math.round(triangles),
    lights,
  };
}
