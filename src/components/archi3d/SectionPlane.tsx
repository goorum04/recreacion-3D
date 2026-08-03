'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { SectionPlane as SectionPlaneConfig, FloorPlanData } from '@/lib/floor-plan-types';

/**
 * Creates a THREE.Plane suitable for `renderer.clippingPlanes`.
 *
 * The plane clips (discards) fragments on the positive side of the plane normal.
 * - axis 'y' (horizontal cut): clips everything ABOVE `value` → reveals interior.
 *   Normal points up (0,1,0), constant = -value → plane at y=value, clips y>value.
 * - axis 'x': clips everything with x > value (normal +X).
 * - axis 'z': clips everything with z > value (normal +Z).
 */
export function makeClippingPlane(cfg: SectionPlaneConfig): THREE.Plane {
  const v = cfg.value;
  if (cfg.axis === 'y') {
    // Plane: y = v  →  normal (0,1,0), constant = -v  →  clips y > v
    return new THREE.Plane(new THREE.Vector3(0, -1, 0), v);
  }
  if (cfg.axis === 'x') {
    return new THREE.Plane(new THREE.Vector3(-1, 0, 0), v);
  }
  return new THREE.Plane(new THREE.Vector3(0, 0, -1), v);
}

/**
 * Visual representation of the section plane (a translucent colored quad
 * showing where the cut happens). Only rendered when section is enabled.
 */
export function SectionPlaneVisual({
  config,
  data,
}: {
  config: SectionPlaneConfig;
  data: FloorPlanData;
}) {
  const { width, depth } = data.dimensions;
  const ceilingHeight = data.ceilingHeight ?? 2.7;
  // The building is centered, so the world-space bounds are:
  // X: [-width/2, width/2], Z: [-depth/2, depth/2], Y: [0, ceilingHeight]
  const halfW = width / 2;
  const halfD = depth / 2;

  // Geometry + position depend on the axis
  const { geometry, position, rotation } = useMemo(() => {
    if (config.axis === 'y') {
      // Horizontal plane at y = value, spans the full footprint
      return {
        geometry: new THREE.PlaneGeometry(width + 1, depth + 1),
        position: [0, config.value, 0] as [number, number, number],
        rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
      };
    }
    if (config.axis === 'x') {
      // Vertical plane at x = value, spans width × height
      return {
        geometry: new THREE.PlaneGeometry(depth + 1, ceilingHeight + 0.5),
        position: [config.value, ceilingHeight / 2, 0] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
      };
    }
    // z axis
    return {
      geometry: new THREE.PlaneGeometry(width + 1, ceilingHeight + 0.5),
      position: [0, ceilingHeight / 2, config.value] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    };
  }, [config.axis, config.value, width, depth, ceilingHeight]);

  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <meshBasicMaterial
        color="#ef4444"
        transparent
        opacity={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Default section plane config (disabled, horizontal cut at 1.5m to reveal interior). */
export const DEFAULT_SECTION: SectionPlaneConfig = {
  enabled: false,
  axis: 'y',
  value: 1.5,
};

/** Default layer visibility (everything on). */
export const DEFAULT_LAYERS = {
  walls: true,
  furniture: true,
  doors: true,
  windows: true,
  labels: true,
  ceiling: true,
  roof: true,
};

export default SectionPlaneVisual;
