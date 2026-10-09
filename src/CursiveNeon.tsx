import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bakeNeonTexture, useNeonFontTick, type BakedNeon } from './neonTexture';

/**
 * One line of cursive neon.
 *
 * Rendered as a group + mesh so two rotations compose predictably:
 *   group.rotation  — aims the sign's normal at its host surface
 *   mesh.rotation.z — stacks the letters vertically (pier signage)
 *   mesh.position.z — lifts the plane clear of that surface
 *
 * Keeping the lift on the mesh's own normal axis is what stops the plane
 * landing exactly on a wall and z-fighting while the camera orbits.
 */

interface Props {
  name?: string;
  text: string;
  color: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  /** letter height in metres (the sign's short axis) */
  height?: number;
  /** dark backing plate with a neon border */
  plate?: boolean;
  /** brightness multiplier (>1 feeds bloom) */
  intensity?: number;
  night?: boolean;
  /** append a four-point sparkle, centred as part of the lockup */
  sparkle?: boolean;
  /** stack the reading direction along the group's local Y */
  vertical?: boolean;
  /** reverse the vertical reading direction */
  flip?: boolean;
  /** standoff from the host surface, along the sign's own normal */
  lift?: number;
  /**
   * Pre-baked texture. When supplied the caller owns it (and its disposal) and
   * the component skips its own bake — used where the mount has to be sized
   * from the real texture dimensions before the sign is rendered.
   */
  baked?: BakedNeon;
}

export function CursiveNeon({
  name,
  text,
  color,
  position,
  rotation = [0, 0, 0],
  height = 1,
  plate = false,
  intensity = 1.5,
  night = true,
  sparkle = false,
  vertical = false,
  flip = false,
  lift = 0.02,
  baked,
}: Props) {
  const fontTick = useNeonFontTick();
  const owned = useMemo<BakedNeon | null>(
    () => (baked ? null : bakeNeonTexture(text, color, plate, night, sparkle)),
    [baked, text, color, plate, night, sparkle, fontTick],
  );
  const sign = (baked ?? owned) as BakedNeon;

  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      name: `Neon_Cursive_${text.replace(/\s+/g, '')}`,
      map: sign.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    m.color.setScalar(night ? intensity : 1.0);
    return m;
  }, [sign.texture, intensity, night, text]);

  // Only dispose a texture this component baked itself.
  useEffect(() => {
    if (!owned) return;
    return () => owned.texture.dispose();
  }, [owned]);

  useEffect(() => () => mat.dispose(), [mat]);

  // Reading length along X, letter height along Y — rotated by phi when vertical.
  const w = height * (sign.width / sign.height);
  const phi = vertical ? (flip ? Math.PI / 2 : -Math.PI / 2) : 0;
  const label = name ?? 'Neon_Cursive';

  return (
    <group name={`${label}_Mount`} position={position} rotation={rotation}>
      <mesh name={label} material={mat} renderOrder={13} rotation={[0, 0, phi]} position={[0, 0, lift]}>
        <planeGeometry args={[w, height]} />
      </mesh>
    </group>
  );
}
