/**
 * Shared types for ArchiVR floor plan analysis & 3D rendering.
 *
 * Coordinate system:
 *  - All coordinates are in METERS.
 *  - The plan lives on the XZ plane (Y is up).
 *  - Walls are line segments on the XZ plane extruded upward.
 */

export interface WallSegment {
  /** Start point X (meters) */
  x1: number;
  /** Start point Z (meters) */
  z1: number;
  /** End point X (meters) */
  x2: number;
  /** End point Z (meters) */
  z2: number;
  /** Wall height in meters (default 2.7) */
  height?: number;
  /** Wall thickness in meters (default 0.15) */
  thickness?: number;
}

export interface Room {
  id: string;
  name: string;
  /** Center of the room (meters) */
  cx: number;
  cz: number;
  /** Approximate area in m² */
  area: number;
  /** Floor color hint */
  color?: string;
}

export interface DoorOpening {
  /** Position on the wall midpoint (meters) */
  x: number;
  z: number;
  /** Door width in meters */
  width: number;
  /** Rotation around Y in radians (0 = door faces along X axis) */
  rotation: number;
}

export interface WindowOpening {
  x: number;
  z: number;
  width: number;
  /** Height of the sill from the floor (meters) */
  sillHeight: number;
  /** Window height (meters) */
  height: number;
  rotation: number;
}

/** A simple piece of furniture placed on the floor */
export interface FurnitureItem {
  type: 'sofa' | 'table' | 'bed' | 'chair' | 'counter' | 'toilet' | 'sink' | 'fridge' | 'tree';
  x: number;
  z: number;
  rotation: number;
  /** scale multiplier */
  scale?: number;
}

export interface DimensionInfo {
  /** Total plan width along X (meters) */
  width: number;
  /** Total plan depth along Z (meters) */
  depth: number;
  /** Number of floors (always 1 for now) */
  floors: number;
}

export interface FloorPlanData {
  /** Schema version */
  version: number;
  scale: number;
  dimensions: DimensionInfo;
  walls: WallSegment[];
  rooms: Room[];
  doors: DoorOpening[];
  windows: WindowOpening[];
  furniture: FurnitureItem[];
  /** Style / building type guessed from the plan */
  buildingType?: string;
  /** Human-readable summary */
  summary?: string;
  /** Ceiling height default (meters) */
  ceilingHeight?: number;
}

/** Result returned by the /api/analyze-plan endpoint */
export interface AnalyzePlanResponse {
  success: boolean;
  data?: FloorPlanData;
  error?: string;
  /** Raw model output for debugging */
  raw?: string;
}

/** A 3D measurement point (meters, world space). */
export interface MeasurePoint {
  x: number;
  y: number;
  z: number;
}

/** A completed measurement segment between two points. */
export interface MeasureSegment {
  id: string;
  a: MeasurePoint;
  b: MeasurePoint;
  /** Distance in meters */
  distance: number;
}

/** A saved camera bookmark (position + target + label). */
export interface CameraBookmark {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  createdAt: number;
}

/** Section plane configuration (clipping). */
export interface SectionPlane {
  /** Whether the section cut is active */
  enabled: boolean;
  /** Axis to cut along: 'x' clips everything with x > value, 'y' clips y > value (horizontal cut, reveals interior), 'z' clips z > value */
  axis: 'x' | 'y' | 'z';
  /** Cut position in meters along the axis (world space, before building offset) */
  value: number;
}

/** Per-category layer visibility. */
export interface LayerVisibility {
  walls: boolean;
  furniture: boolean;
  doors: boolean;
  windows: boolean;
  labels: boolean;
  ceiling: boolean;
  roof: boolean;
}

/** Live-editable scene appearance settings (controlled from the viewer sidebar). */
export interface SceneSettings {
  /** Time-of-day lighting: 'day' = bright noon, 'sunset' = warm low sun, 'night' = moonlight */
  lighting: 'day' | 'sunset' | 'night';
  /** Render walls as wireframe overlay */
  wireframe: boolean;
  /** Wall surface color */
  wallColor: string;
  /** Floor slab color */
  floorColor: string;
  /** Show the translucent ceiling */
  showCeiling: boolean;
  /** Auto-rotate the camera around the model */
  autoRotate: boolean;
  /** Room id to focus the camera on (set transiently, then cleared) */
  focusRoomId?: string | null;
  /** Sun hour for solar study (0-23). When set (not null), overrides the lighting preset's sun position. */
  sunHour: number | null;
  /** Section/cut plane configuration */
  section: SectionPlane;
  /** Per-category layer visibility */
  layers: LayerVisibility;
}
