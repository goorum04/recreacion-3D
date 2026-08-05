'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * Procedurally generated PBR-ish material maps (albedo + roughness), drawn
 * on a <canvas> at runtime and cached by (kind, baseColor). Flat
 * meshStandardMaterial colors read as a "toy model"; a bit of grain/noise
 * is what makes a render look like an actual material instead of a solid
 * plastic block, without needing to ship or fetch any external texture
 * files.
 */
export type TextureKind = 'paint' | 'wood' | 'marble' | 'concrete' | 'grass';

const SIZE = 256;
const canvasCache = new Map<string, { albedo: HTMLCanvasElement; rough: HTMLCanvasElement }>();

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Deterministic pseudo-random in [0,1) so repeated renders look identical. */
function hashNoise(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return { canvas, ctx: canvas.getContext('2d')! };
}

/** Generates (and caches, by pixel content only — not by repeat) the albedo + roughness canvases for a material kind. */
function getCanvases(kind: TextureKind, baseColor: string) {
  const key = `${kind}:${baseColor.toLowerCase()}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const [br, bg, bb] = hexToRgb(baseColor);
  const { canvas: albedo, ctx: a } = makeCanvas();
  const { canvas: rough, ctx: r } = makeCanvas();
  const aData = a.createImageData(SIZE, SIZE);
  const rData = r.createImageData(SIZE, SIZE);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      let dr = 0, dg = 0, db = 0; // color delta from base
      let roughness = 0.82; // 0 = mirror, 1 = fully matte

      if (kind === 'paint') {
        // Very subtle trowel-mark noise — walls should read as flat paint,
        // not perfectly uniform plastic.
        const n = hashNoise(x * 0.4, y * 0.4, 1) - 0.5;
        const blotch = (hashNoise(x * 0.03, y * 0.03, 2) - 0.5) * 10;
        const v = n * 6 + blotch;
        dr = dg = db = v;
        roughness = 0.88 + n * 0.06;
      } else if (kind === 'wood') {
        // Horizontal grain: low-frequency bands + fine fiber noise + occasional darker streaks.
        // Mostly a luminance (all-channel) delta so it reads as grain on
        // any base color — including pastel room-floor tints — rather than
        // dragging every color toward brown; only a light warm bias remains.
        const band = Math.sin(y * 0.18) * 6 + Math.sin(y * 0.6 + x * 0.02) * 3;
        const fiber = (hashNoise(x * 0.9, y * 0.15, 3) - 0.5) * 8;
        const streak = hashNoise(0, Math.floor(y / 3), 4) > 0.93 ? -12 : 0;
        const v = band + fiber + streak;
        dr = v * 1.0;
        dg = v * 0.9;
        db = v * 0.8;
        roughness = 0.55 + hashNoise(x * 0.5, y * 0.5, 5) * 0.25;
      } else if (kind === 'marble') {
        // Soft veins: layered sine "turbulence" for a marbled look.
        const vein = Math.sin(x * 0.06 + Math.sin(y * 0.05) * 4) * 14 + Math.sin((x + y) * 0.03) * 8;
        const speckle = (hashNoise(x, y, 6) - 0.5) * 4;
        const v = vein + speckle;
        dr = dg = db = v;
        roughness = 0.18 + hashNoise(x * 0.3, y * 0.3, 7) * 0.1; // polished
      } else if (kind === 'concrete') {
        const coarse = (hashNoise(x * 0.08, y * 0.08, 8) - 0.5) * 22;
        const fine = (hashNoise(x, y, 9) - 0.5) * 10;
        const v = coarse + fine;
        dr = dg = db = v;
        roughness = 0.78 + hashNoise(x * 0.4, y * 0.4, 10) * 0.15;
      } else if (kind === 'grass') {
        const tuft = (hashNoise(x * 0.5, y * 0.5, 11) - 0.5) * 26;
        const patch = (hashNoise(x * 0.04, y * 0.04, 12) - 0.5) * 16;
        const v = tuft + patch;
        dr = v * 0.5;
        dg = v;
        db = v * 0.5;
        roughness = 0.95;
      }

      aData.data[i] = clamp255(br + dr);
      aData.data[i + 1] = clamp255(bg + dg);
      aData.data[i + 2] = clamp255(bb + db);
      aData.data[i + 3] = 255;

      const g = clamp255(roughness * 255);
      rData.data[i] = g;
      rData.data[i + 1] = g;
      rData.data[i + 2] = g;
      rData.data[i + 3] = 255;
    }
  }
  a.putImageData(aData, 0, 0);
  r.putImageData(rData, 0, 0);
  const result = { albedo, rough };
  canvasCache.set(key, result);
  return result;
}

export interface ProceduralMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/**
 * React hook returning albedo/roughness textures for a material, tiled so
 * one repeat spans `tileMeters` world units. Textures are memoized per
 * (kind, baseColor, repeat) and disposed on cleanup — each caller gets its
 * own Texture instance (repeat/wrapping is per-Texture-object state in
 * three.js, so sharing one instance across differently-sized surfaces would
 * make them fight over the same tiling), while the expensive canvas pixel
 * generation itself is cached and reused across all of them.
 */
export function useProceduralMaterial(
  kind: TextureKind,
  baseColor: string,
  widthMeters: number,
  heightMeters: number,
  tileMeters = 1.2,
): ProceduralMaps {
  const repeatX = Math.max(0.5, widthMeters / tileMeters);
  const repeatY = Math.max(0.5, heightMeters / tileMeters);

  const maps = useMemo(() => {
    const { albedo, rough } = getCanvases(kind, baseColor);
    const map = new THREE.CanvasTexture(albedo);
    const roughnessMap = new THREE.CanvasTexture(rough);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeatX, repeatY);
    }
    return { map, roughnessMap };
  }, [kind, baseColor, repeatX, repeatY]);

  useEffect(() => {
    return () => {
      maps.map.dispose();
      maps.roughnessMap.dispose();
    };
  }, [maps]);

  return maps;
}

const FLOOR_KIND_BY_COLOR: Record<string, TextureKind> = {
  '#c9a27a': 'wood', // Madera
  '#e0d0b0': 'wood', // Haya
  '#ececec': 'marble', // Mármol
  '#b8b0a4': 'concrete', // Cemento
  '#d8b888': 'wood', // Pino
  '#3a3a3a': 'concrete', // Pizarra
};

/** Best-guess material kind for a floor color, defaulting to wood (the most common residential floor). */
export function floorKindFor(color: string): TextureKind {
  return FLOOR_KIND_BY_COLOR[color.toLowerCase()] ?? 'wood';
}
