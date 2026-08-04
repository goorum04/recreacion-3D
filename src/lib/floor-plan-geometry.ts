import type { WallSegment } from './floor-plan-types';

export function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * Snaps every wall to horizontal/vertical, then clusters nearby endpoints
 * (within SNAP_TOL) so shared corners land on the exact same point across
 * every wall that touches them. Raw wall coordinates (whether hand-authored
 * or VLM-detected) are rarely perfectly axis-aligned/closed, which makes
 * the 3D model look skewed with gaps at joints.
 */
const SNAP_TOL = 0.3; // meters

export function orthogonalizeWalls(walls: WallSegment[]): WallSegment[] {
  const ortho = walls.map((w) => {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    if (Math.abs(dx) >= Math.abs(dz)) {
      const z = (w.z1 + w.z2) / 2;
      return { ...w, z1: z, z2: z };
    }
    const x = (w.x1 + w.x2) / 2;
    return { ...w, x1: x, x2: x };
  });

  const clusters: { x: number; z: number; n: number }[] = [];
  const snap = (x: number, z: number) => {
    for (const c of clusters) {
      if (Math.abs(c.x - x) < SNAP_TOL && Math.abs(c.z - z) < SNAP_TOL) {
        c.x = (c.x * c.n + x) / (c.n + 1);
        c.z = (c.z * c.n + z) / (c.n + 1);
        c.n += 1;
        return c;
      }
    }
    const created = { x, z, n: 1 };
    clusters.push(created);
    return created;
  };

  return ortho
    .map((w) => {
      const p1 = snap(w.x1, w.z1);
      const p2 = snap(w.x2, w.z2);
      return { ...w, x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z };
    })
    .filter((w) => Math.abs(w.x2 - w.x1) + Math.abs(w.z2 - w.z1) > 0.05);
}

/**
 * Projects a door/window position onto the nearest wall segment and returns
 * the point on that wall plus the wall's own rotation (matching the <Wall>
 * component's `Math.atan2(dx, dz)` convention), so openings always sit
 * flush in a wall instead of floating at an unrelated angle.
 */
export function snapToNearestWall(
  walls: WallSegment[],
  x: number,
  z: number,
): { x: number; z: number; rotation: number } {
  let best: { x: number; z: number; rotation: number; dist: number } | null = null;
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) continue;
    let t = ((x - w.x1) * dx + (z - w.z1) * dz) / lenSq;
    t = clamp(t, 0.08, 0.92); // keep openings away from corners
    const px = w.x1 + t * dx;
    const pz = w.z1 + t * dz;
    const dist = Math.hypot(px - x, pz - z);
    if (!best || dist < best.dist) {
      best = { x: px, z: pz, rotation: Math.atan2(dx, dz), dist };
    }
  }
  return best ? { x: best.x, z: best.z, rotation: best.rotation } : { x, z, rotation: 0 };
}
