import type { FloorPlanData, WallSegment } from './floor-plan-types';
import { orthogonalizeWalls, snapToNearestWall } from './floor-plan-geometry';

const DEMO_WALLS: WallSegment[] = orthogonalizeWalls([
  // Perimeter
  { x1: 0, z1: 0, x2: 11, z2: 0 },
  { x1: 11, z1: 0, x2: 11, z2: 9 },
  { x1: 11, z1: 9, x2: 0, z2: 9 },
  { x1: 0, z1: 9, x2: 0, z2: 0 },
  // Living | Kitchen partition
  { x1: 6, z1: 0, x2: 6, z2: 5 },
  // Bottom (living+kitchen) | top partition
  { x1: 0, z1: 5, x2: 11, z2: 5 },
  // Bedroom1 | Hallway
  { x1: 4, z1: 5, x2: 4, z2: 9 },
  // Hallway | Bedroom2
  { x1: 8, z1: 5, x2: 8, z2: 9 },
  // Bathroom enclosure
  { x1: 4, z1: 7, x2: 8, z2: 7 },
]);

/**
 * Doors/windows are authored as a rough (x, z) position on the wall they
 * belong to; `snapToNearestWall` projects that point onto the actual wall
 * line and derives the correct rotation, instead of trusting a hand-picked
 * rotation value (which previously didn't match the <Wall> component's own
 * rotation convention and made openings float at the wrong angle).
 */
function snappedOpenings<T extends { x: number; z: number }>(
  openings: T[],
): (T & { rotation: number })[] {
  return openings.map((o) => {
    const snap = snapToNearestWall(DEMO_WALLS, o.x, o.z);
    return { ...o, x: snap.x, z: snap.z, rotation: snap.rotation };
  });
}

/**
 * A realistic 2-bedroom apartment demo plan.
 * Used by the "Probar demo" button so users can explore the 3D / VR
 * experience without uploading their own floor plan.
 */
export const DEMO_PLAN: FloorPlanData = {
  version: 1,
  scale: 1,
  dimensions: { width: 11, depth: 9, floors: 1 },
  ceilingHeight: 2.7,
  buildingType: 'apartment',
  summary: 'Apartamento de 2 dormitorios con sala, cocina, baño y pasillo distribuidor.',
  walls: DEMO_WALLS,
  rooms: [
    { id: 'r1', name: 'Sala de estar', cx: 3, cz: 2.5, area: 30, color: '#e7ddc9' },
    { id: 'r2', name: 'Cocina', cx: 8.5, cz: 2.5, area: 20, color: '#d9e4d0' },
    { id: 'r3', name: 'Pasillo', cx: 6, cz: 6, area: 8, color: '#ece7dd' },
    { id: 'r4', name: 'Dormitorio 1', cx: 2, cz: 8, area: 16, color: '#d7d2e0' },
    { id: 'r5', name: 'Dormitorio 2', cx: 9.5, cz: 8, area: 12, color: '#d2dfd9' },
    { id: 'r6', name: 'Baño', cx: 6, cz: 8, area: 8, color: '#cfe0e8' },
  ],
  doors: snappedOpenings([
    { x: 0, z: 2, width: 0.9 }, // main entrance
    { x: 6, z: 2.5, width: 0.9 }, // living <-> kitchen
    { x: 3, z: 5, width: 0.9 }, // living <-> hallway
    { x: 4, z: 6.2, width: 0.8 }, // hallway <-> bedroom1
    { x: 8, z: 6.2, width: 0.8 }, // hallway <-> bedroom2
    { x: 6, z: 7, width: 0.7 }, // hallway <-> bathroom
  ]),
  windows: snappedOpenings([
    { x: 3, z: 0, width: 2, sillHeight: 0.9, height: 1.3 },
    { x: 11, z: 2.5, width: 1.5, sillHeight: 0.9, height: 1.2 },
    { x: 2, z: 9, width: 1.5, sillHeight: 0.9, height: 1.2 },
    { x: 11, z: 8, width: 1.2, sillHeight: 0.9, height: 1.2 },
  ]),
  furniture: [
    { type: 'sofa', x: 2, z: 3.8, rotation: Math.PI },
    { type: 'table', x: 3.5, z: 2.2, rotation: 0 },
    { type: 'chair', x: 5, z: 3.5, rotation: 0 },
    { type: 'counter', x: 9.5, z: 1.5, rotation: 0 },
    { type: 'fridge', x: 10.5, z: 4, rotation: -Math.PI / 2 },
    { type: 'bed', x: 2, z: 7.8, rotation: 0 },
    { type: 'bed', x: 9.5, z: 7.8, rotation: 0 },
    { type: 'toilet', x: 4.6, z: 8.5, rotation: 0 },
    { type: 'sink', x: 7.4, z: 8.5, rotation: Math.PI },
    { type: 'tree', x: -1.5, z: -1.5, rotation: 0, scale: 1.2 },
  ],
};
