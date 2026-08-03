'use client';

import { useCallback } from 'react';

/**
 * Captures the current WebGL canvas as a PNG and triggers a download.
 *
 * R3F's renderer needs `preserveDrawingBuffer: true` OR we must render a frame
 * and immediately read it. To keep things simple and robust we set
 * `preserveDrawingBuffer: true` on the Canvas (configured in ArchiScene) so
 * `toDataURL()` works at any time.
 */
export function useScreenshot() {
  return useCallback(async (fileName = 'archivr-vista.png') => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('No se encontró el canvas 3D.');
    }
    // Force a fresh render frame then grab the pixels.
    // preserveDrawingBuffer is set on the Canvas gl props, so toDataURL works.
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);
}
