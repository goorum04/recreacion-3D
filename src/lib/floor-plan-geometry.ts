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

/**
 * Approximate footprint radius (meters) per furniture type — matches the
 * rough size of each <Furniture> mesh in BuildingModel.tsx. Used only to
 * detect/resolve overlaps, so it doesn't need to be exact.
 */
const FURNITURE_RADIUS: Record<string, number> = {
  sofa: 1.05,
  table: 0.85,
  bed: 1.05,
  chair: 0.32,
  counter: 1.0,
  toilet: 0.3,
  sink: 0.35,
  fridge: 0.4,
  tree: 0.45,
};

/**
 * Pushes apart any two furniture pieces whose (approximate, circular)
 * footprints overlap, so items the VLM placed on top of each other end up
 * with realistic clearance instead — a real room's furniture never
 * physically overlaps, even if the VLM's per-item position guess is rough.
 */
export function resolveFurnitureOverlaps<T extends { type: string; x: number; z: number }>(
  items: T[],
): T[] {
  const pts = items.map((it) => ({ x: it.x, z: it.z, r: FURNITURE_RADIUS[it.type] ?? 0.4 }));
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const minDist = (a.r + b.r) * 0.92;
        if (dist < 1e-4) {
          a.x -= 0.05;
          b.x += 0.05;
        } else if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const ux = dx / dist;
          const uz = dz / dist;
          a.x -= ux * overlap;
          a.z -= uz * overlap;
          b.x += ux * overlap;
          b.z += uz * overlap;
        }
      }
    }
  }
  return items.map((it, i) => ({ ...it, x: pts[i].x, z: pts[i].z }));
}

/**
 * Pulls every chair to sit snugly beside the nearest table (within 1.6m)
 * and face it, instead of trusting the VLM's independent, often
 * disconnected-looking guess for each chair's position/rotation. Run this
 * AFTER resolveFurnitureOverlaps so the deliberate close placement here
 * doesn't get treated as an overlap and pushed back apart.
 */
export function snapChairsToTables<T extends { type: string; x: number; z: number; rotation: number }>(
  items: T[],
): T[] {
  const tables = items.filter((it) => it.type === 'table');
  if (tables.length === 0) return items;
  const MAX_DIST = 1.6;
  const OFFSET = 0.55;

  return items.map((it) => {
    if (it.type !== 'chair') return it;
    let nearest: T | null = null;
    let nearestDist = Infinity;
    for (const t of tables) {
      const d = Math.hypot(t.x - it.x, t.z - it.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = t;
      }
    }
    if (!nearest || nearestDist > MAX_DIST) return it;

    const dx = it.x - nearest.x;
    const dz = it.z - nearest.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ux = dx / dist;
    const uz = dz / dist;
    // <Furniture>'s chair backrest sits at local -Z, so it faces local +Z;
    // point that toward the table (the direction from chair to table).
    const rotation = Math.atan2(-ux, -uz);
    return { ...it, x: nearest.x + ux * OFFSET, z: nearest.z + uz * OFFSET, rotation };
  });
}

export interface OpeningSpan {
  x: number;
  z: number;
  width: number;
}

export interface WindowSpan extends OpeningSpan {
  sillHeight: number;
  height: number;
}

/** A rectangular piece of wall: a horizontal run at a given vertical band. */
export interface WallSlab {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  thickness: number;
  yFrom: number;
  yTo: number;
}

interface Interval {
  from: number;
  to: number;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.from - b.from);
  const merged: Interval[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last && c.from <= last.to + 0.02) {
      last.to = Math.max(last.to, c.to);
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}

/** The parts of [domainFrom, domainTo] not covered by any of `voids`. */
function complementIntervals(voids: Interval[], domainFrom: number, domainTo: number): Interval[] {
  const remain: Interval[] = [];
  let cursor = domainFrom;
  for (const v of voids) {
    if (v.from - cursor > 0.05) remain.push({ from: cursor, to: v.from });
    cursor = Math.max(cursor, v.to);
  }
  if (domainTo - cursor > 0.05) remain.push({ from: cursor, to: domainTo });
  return remain;
}

/** Projects an opening onto a wall's length axis; null if it isn't on this wall. */
function projectSpan(
  wall: WallSegment,
  ux: number,
  uz: number,
  length: number,
  o: OpeningSpan,
): Interval | null {
  const t = (o.x - wall.x1) * ux + (o.z - wall.z1) * uz;
  if (t <= 0 || t >= length) return null;
  const px = wall.x1 + t * ux;
  const pz = wall.z1 + t * uz;
  const perpDist = Math.hypot(px - o.x, pz - o.z);
  const thickness = wall.thickness ?? 0.15;
  if (perpDist > thickness * 2 + 0.15) return null;
  const half = o.width / 2;
  return { from: clamp(t - half, 0, length), to: clamp(t + half, 0, length) };
}

/**
 * Splits a wall into the slabs that remain after cutting real openings for
 * every door and window that lies on it, instead of the single solid box
 * <Wall> used to draw regardless of doors/windows. Doors remove the wall
 * entirely (floor to ceiling) at their span; windows only remove the band
 * between their sill and header, leaving wall below the sill and above the
 * window — like a real window opening instead of a floating glass overlay.
 */
export function buildWallSlabs(
  wall: WallSegment,
  doors: OpeningSpan[],
  windows: WindowSpan[],
): WallSlab[] {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const length = Math.hypot(dx, dz);
  const thickness = wall.thickness ?? 0.15;
  const wallHeight = wall.height ?? 2.7;
  if (length < 0.01) {
    return [{ x1: wall.x1, z1: wall.z1, x2: wall.x2, z2: wall.z2, thickness, yFrom: 0, yTo: wallHeight }];
  }
  const ux = dx / length;
  const uz = dz / length;

  const toXZ = (from: number, to: number) => ({
    x1: wall.x1 + ux * from,
    z1: wall.z1 + uz * from,
    x2: wall.x1 + ux * to,
    z2: wall.z1 + uz * to,
  });

  const doorVoids = mergeIntervals(
    doors
      .map((d) => projectSpan(wall, ux, uz, length, d))
      .filter((v): v is Interval => v !== null),
  );
  const wallRanges = doorVoids.length ? complementIntervals(doorVoids, 0, length) : [{ from: 0, to: length }];

  const slabs: WallSlab[] = [];
  for (const range of wallRanges) {
    const winsHere = windows
      .map((w) => {
        const span = projectSpan(wall, ux, uz, length, w);
        if (!span) return null;
        const from = Math.max(span.from, range.from);
        const to = Math.min(span.to, range.to);
        if (to - from < 0.05) return null;
        return { from, to, sillHeight: w.sillHeight, height: w.height };
      })
      .filter((w): w is { from: number; to: number; sillHeight: number; height: number } => w !== null)
      .sort((a, b) => a.from - b.from);

    if (winsHere.length === 0) {
      const { x1, z1, x2, z2 } = toXZ(range.from, range.to);
      slabs.push({ x1, z1, x2, z2, thickness, yFrom: 0, yTo: wallHeight });
      continue;
    }

    const solidRanges = complementIntervals(
      winsHere.map((w) => ({ from: w.from, to: w.to })),
      range.from,
      range.to,
    );
    for (const r of solidRanges) {
      const { x1, z1, x2, z2 } = toXZ(r.from, r.to);
      slabs.push({ x1, z1, x2, z2, thickness, yFrom: 0, yTo: wallHeight });
    }
    for (const w of winsHere) {
      const { x1, z1, x2, z2 } = toXZ(w.from, w.to);
      if (w.sillHeight > 0.05) slabs.push({ x1, z1, x2, z2, thickness, yFrom: 0, yTo: w.sillHeight });
      const top = w.sillHeight + w.height;
      if (wallHeight - top > 0.05) slabs.push({ x1, z1, x2, z2, thickness, yFrom: top, yTo: wallHeight });
    }
  }
  return slabs;
}
