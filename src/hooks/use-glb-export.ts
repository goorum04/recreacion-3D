'use client';

import { useCallback } from 'react';
import { getSceneAndRenderer } from '@/lib/camera-bridge';

/**
 * Triggers a GLB (binary glTF) download of the current THREE scene.
 *
 * The scene is obtained via the module-level camera bridge (populated by
 * <CameraBridge/> inside the Canvas), since R3F v9 no longer exposes `__r3f`
 * on the canvas element.
 */
export function useGlbExport() {
  return useCallback(async (fileName = 'archivr-model.glb') => {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

    const handle = getSceneAndRenderer();
    if (!handle) {
      throw new Error('No se pudo acceder a la escena 3D.');
    }
    const { scene } = handle;

    const exporter = new GLTFExporter();
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error('El exportador devolvió JSON en lugar de GLB.'));
        },
        (err) => reject(err),
        { binary: true, onlyVisible: true, maxTextureSize: 2048 },
      );
    });

    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.glb') ? fileName : `${fileName}.glb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, []);
}
