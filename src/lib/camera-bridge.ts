'use client';

import * as THREE from 'three';

/**
 * A tiny module-level store that lets the viewer UI read/write the active
 * R3F camera + OrbitControls without reaching into the canvas internals
 * (R3F v9 no longer exposes `__r3f` on the canvas element).
 *
 * The ArchiScene component calls `setCameraRef` from inside the Canvas
 * (via the <CameraBridge/> component), and the viewer reads it from here.
 */
interface CameraHandle {
  camera: THREE.Camera;
  controls: { target: THREE.Vector3; update: () => void } | null;
  scene: THREE.Scene;
  gl: THREE.WebGLRenderer;
}

let handle: CameraHandle | null = null;

export function setCameraHandle(h: CameraHandle | null) {
  handle = h;
}

export function getCameraHandle(): CameraHandle | null {
  return handle;
}

/** Returns the R3F scene + renderer, or null if not registered. */
export function getSceneAndRenderer(): { scene: THREE.Scene; gl: THREE.WebGLRenderer } | null {
  if (!handle) return null;
  return { scene: handle.scene, gl: handle.gl };
}

export function readCamera(): {
  position: [number, number, number];
  target: [number, number, number];
} | null {
  if (!handle) return null;
  const { camera, controls } = handle;
  const position: [number, number, number] = [
    Number(camera.position.x.toFixed(3)),
    Number(camera.position.y.toFixed(3)),
    Number(camera.position.z.toFixed(3)),
  ];
  let target: [number, number, number] = [0, 0.5, 0];
  if (controls?.target) {
    target = [
      Number(controls.target.x.toFixed(3)),
      Number(controls.target.y.toFixed(3)),
      Number(controls.target.z.toFixed(3)),
    ];
  }
  return { position, target };
}

/**
 * Animates the camera + controls target from their current values to the
 * given position/target over ~600ms (easeOutCubic).
 */
export function animateCameraTo(
  endPos: [number, number, number],
  endT: [number, number, number],
  duration = 600,
): boolean {
  if (!handle) return false;
  const { camera, controls } = handle;
  if (!controls) return false;
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    camera.position.set(
      startPos.x + (endPos[0] - startPos.x) * ease,
      startPos.y + (endPos[1] - startPos.y) * ease,
      startPos.z + (endPos[2] - startPos.z) * ease,
    );
    controls.target.set(
      startTarget.x + (endT[0] - startTarget.x) * ease,
      startTarget.y + (endT[1] - startTarget.y) * ease,
      startTarget.z + (endT[2] - startTarget.z) * ease,
    );
    controls.update();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
}
