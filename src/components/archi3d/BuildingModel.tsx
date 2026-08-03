'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type {
  FloorPlanData,
  WallSegment,
  DoorOpening,
  WindowOpening,
  FurnitureItem,
  Room,
  LayerVisibility,
} from '@/lib/floor-plan-types';

/* ------------------------------------------------------------------ */
/* Wall                                                                */
/* ------------------------------------------------------------------ */

interface WallProps {
  wall: WallSegment;
  offsetX: number;
  offsetZ: number;
  color: string;
  wireframe?: boolean;
  clippingPlanes?: THREE.Plane[];
}

function Wall({ wall, offsetX, offsetZ, color, wireframe, clippingPlanes = [] }: WallProps) {
  const { x1, z1, x2, z2, height = 2.7, thickness = 0.15 } = wall;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (x1 + x2) / 2 + offsetX;
  const cz = (z1 + z2) / 2 + offsetZ;

  // Slightly darker shade for baseboard/trim derived from the wall color.
  // (must be called before any early return to respect the rules of hooks)
  const trimColor = useMemo(() => shadeColor(color, -18), [color]);

  if (length < 0.01) return null;

  return (
    <group position={[cx, 0, cz]} rotation={[0, angle, 0]}>
      {/* Wall body */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, height, length]} />
        <meshStandardMaterial color={color} roughness={0.9} wireframe={wireframe} clippingPlanes={clippingPlanes} clipShadows />
      </mesh>
      {!wireframe && (
        <>
          {/* Baseboard */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[thickness * 1.05, 0.12, length]} />
            <meshStandardMaterial color={trimColor} roughness={0.8} clippingPlanes={clippingPlanes} />
          </mesh>
          {/* Top trim */}
          <mesh position={[0, height - 0.05, 0]}>
            <boxGeometry args={[thickness * 1.08, 0.08, length]} />
            <meshStandardMaterial color={trimColor} roughness={0.85} clippingPlanes={clippingPlanes} />
          </mesh>
        </>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Door (frame + open gap visual)                                      */
/* ------------------------------------------------------------------ */

interface DoorProps {
  door: DoorOpening;
  offsetX: number;
  offsetZ: number;
  ceilingHeight: number;
  clippingPlanes?: THREE.Plane[];
}

function Door({ door, offsetX, offsetZ, ceilingHeight, clippingPlanes = [] }: DoorProps) {
  const { x, z, width, rotation } = door;
  const cx = x + offsetX;
  const cz = z + offsetZ;
  const h = Math.min(2.1, ceilingHeight - 0.2);

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
      {/* Left post */}
      <mesh position={[0, h / 2, -width / 2 - 0.04]} castShadow>
        <boxGeometry args={[0.1, h, 0.1]} />
        <meshStandardMaterial color="#8b6f47" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Right post */}
      <mesh position={[0, h / 2, width / 2 + 0.04]} castShadow>
        <boxGeometry args={[0.1, h, 0.1]} />
        <meshStandardMaterial color="#8b6f47" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Top lintel */}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[0.12, 0.1, width + 0.08]} />
        <meshStandardMaterial color="#8b6f47" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Door panel (half open) */}
      <group position={[0, 0, -width / 2]}>
        <mesh position={[width / 2, h / 2 - 0.05, 0]} castShadow>
          <boxGeometry args={[width, h - 0.1, 0.04]} />
          <meshStandardMaterial color="#a98263" roughness={0.55} metalness={0.05} clippingPlanes={clippingPlanes} />
        </mesh>
        {/* Handle */}
        <mesh position={[width - 0.1, h / 2, 0.06]}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.3} clippingPlanes={clippingPlanes} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Window (frame + glass)                                              */
/* ------------------------------------------------------------------ */

interface WindowProps {
  win: WindowOpening;
  offsetX: number;
  offsetZ: number;
  clippingPlanes?: THREE.Plane[];
}

function WindowMesh({ win, offsetX, offsetZ, clippingPlanes = [] }: WindowProps) {
  const { x, z, width, sillHeight, height, rotation } = win;
  const cx = x + offsetX;
  const cz = z + offsetZ;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
      {/* Glass */}
      <mesh position={[0, sillHeight + height / 2, 0]}>
        <boxGeometry args={[0.05, height, width]} />
        <meshPhysicalMaterial
          color="#bfe3f2"
          transparent
          opacity={0.35}
          roughness={0.05}
          metalness={0.1}
          transmission={0.6}
          ior={1.45}
          clippingPlanes={clippingPlanes}
        />
      </mesh>
      {/* Frame: top */}
      <mesh position={[0, sillHeight + height + 0.03, 0]}>
        <boxGeometry args={[0.12, 0.06, width + 0.06]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Frame: bottom (sill) */}
      <mesh position={[0, sillHeight - 0.03, 0]}>
        <boxGeometry args={[0.16, 0.06, width + 0.08]} />
        <meshStandardMaterial color="#6b5a48" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Frame: sides */}
      <mesh position={[0, sillHeight + height / 2, -width / 2 - 0.03]}>
        <boxGeometry args={[0.1, height + 0.1, 0.06]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      <mesh position={[0, sillHeight + height / 2, width / 2 + 0.03]}>
        <boxGeometry args={[0.1, height + 0.1, 0.06]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Center mullion */}
      <mesh position={[0, sillHeight + height / 2, 0]}>
        <boxGeometry args={[0.06, height, 0.04]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Room floor patch + label                                            */
/* ------------------------------------------------------------------ */

function RoomFloor({ room, offsetX, offsetZ }: { room: Room; offsetX: number; offsetZ: number }) {
  // Approximate a square patch from area for visual floor tint
  const side = Math.sqrt(room.area) * 0.9;
  return (
    <group position={[room.cx + offsetX, 0.005, room.cz + offsetZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[side, side]} />
        <meshStandardMaterial color={room.color || '#e8e2d5'} roughness={0.95} />
      </mesh>
      <Html position={[0, 0.4, 0]} center distanceFactor={9} occlude={false}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-md bg-white/85 px-2.5 py-1 text-center shadow-md backdrop-blur-sm">
          <div className="text-[11px] font-semibold leading-tight text-stone-800">
            {room.name}
          </div>
          <div className="text-[9px] leading-tight text-stone-500">
            {room.area.toFixed(1)} m²
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

function Furniture({ item, offsetX, offsetZ, clippingPlanes = [] }: { item: FurnitureItem; offsetX: number; offsetZ: number; clippingPlanes?: THREE.Plane[] }) {
  const s = item.scale ?? 1;
  const px = item.x + offsetX;
  const pz = item.z + offsetZ;
  // Spread clippingPlanes into every material via a shared prop object.
  const mat = (color: string, opts: Record<string, unknown> = {}) => (
    <meshStandardMaterial color={color} roughness={0.9} clippingPlanes={clippingPlanes} {...opts} />
  );

  switch (item.type) {
    case 'sofa':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[2, 0.45, 0.85]} />
            {mat('#6b7a8f')}
          </mesh>
          <mesh position={[0, 0.5, -0.35]} castShadow>
            <boxGeometry args={[2, 0.5, 0.18]} />
            {mat('#5c6b80')}
          </mesh>
          <mesh position={[-0.55, 0.35, 0.1]} castShadow>
            <boxGeometry args={[0.4, 0.2, 0.6]} />
            {mat('#7a8aa0')}
          </mesh>
          <mesh position={[0.55, 0.35, 0.1]} castShadow>
            <boxGeometry args={[0.4, 0.2, 0.6]} />
            {mat('#7a8aa0')}
          </mesh>
        </group>
      );
    case 'table':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 0.06, 0.8]} />
            <meshStandardMaterial color="#9a7350" roughness={0.5} />
          </mesh>
          {[
            [-0.62, -0.32],
            [0.62, -0.32],
            [-0.62, 0.32],
            [0.62, 0.32],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.36, lz]} castShadow>
              <boxGeometry args={[0.08, 0.72, 0.08]} />
              <meshStandardMaterial color="#6b4f37" roughness={0.6} />
            </mesh>
          ))}
        </group>
      );
    case 'bed':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.4, 2]} />
            <meshStandardMaterial color="#c9b8a0" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.5, -0.65]} castShadow>
            <boxGeometry args={[1.4, 0.25, 0.5]} />
            <meshStandardMaterial color="#ffffff" roughness={1} />
          </mesh>
          <mesh position={[0, 0.5, -0.95]} castShadow>
            <boxGeometry args={[1.65, 0.55, 0.12]} />
            <meshStandardMaterial color="#7a5c3e" roughness={0.7} />
          </mesh>
        </group>
      );
    case 'chair':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.23, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.45, 0.05, 0.45]} />
            <meshStandardMaterial color="#8a6d4b" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.5, -0.2]} castShadow>
            <boxGeometry args={[0.45, 0.5, 0.05]} />
            <meshStandardMaterial color="#8a6d4b" roughness={0.7} />
          </mesh>
          {[
            [-0.18, -0.18],
            [0.18, -0.18],
            [-0.18, 0.18],
            [0.18, 0.18],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.11, lz]} castShadow>
              <boxGeometry args={[0.05, 0.23, 0.05]} />
              <meshStandardMaterial color="#6b4f37" roughness={0.7} />
            </mesh>
          ))}
        </group>
      );
    case 'counter':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.8, 0.9, 0.6]} />
            <meshStandardMaterial color="#d8d0c0" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.92, 0]} castShadow>
            <boxGeometry args={[1.9, 0.06, 0.7]} />
            <meshStandardMaterial color="#3a3a3a" roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      );
    case 'toilet':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.2, 0.1]} castShadow>
            <boxGeometry args={[0.4, 0.4, 0.55]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.45, -0.2]} castShadow>
            <boxGeometry args={[0.42, 0.5, 0.12]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.3} />
          </mesh>
        </group>
      );
    case 'sink':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.04, 0.45]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.5, 0.36, 0.35]} />
            <meshStandardMaterial color="#d0d0d0" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.5, -0.18]}>
            <cylinderGeometry args={[0.015, 0.015, 0.12, 8]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      );
    case 'fridge':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 1.8, 0.65]} />
            <meshStandardMaterial color="#e8e8ec" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0.34, 1.2, 0]}>
            <boxGeometry args={[0.04, 0.4, 0.1]} />
            <meshStandardMaterial color="#888" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      );
    case 'tree':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 1.2, 8]} />
            <meshStandardMaterial color="#6b4f2a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <sphereGeometry args={[0.6, 12, 12]} />
            <meshStandardMaterial color="#5a8a3a" roughness={0.9} />
          </mesh>
          <mesh position={[0.3, 1.9, 0.1]} castShadow>
            <sphereGeometry args={[0.35, 10, 10]} />
            <meshStandardMaterial color="#6ba044" roughness={0.9} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Building model                                                      */
/* ------------------------------------------------------------------ */

interface BuildingModelProps {
  data: FloorPlanData;
  showLabels?: boolean;
  showFurniture?: boolean;
  wallColor?: string;
  floorColor?: string;
  wireframe?: boolean;
  showCeiling?: boolean;
  layers?: LayerVisibility;
  clippingPlanes?: THREE.Plane[];
}

export function BuildingModel({
  data,
  showLabels = true,
  showFurniture = true,
  wallColor = '#f4efe6',
  floorColor = '#e0d8c8',
  wireframe = false,
  showCeiling = true,
  layers,
  clippingPlanes = [],
}: BuildingModelProps) {
  const { width, depth } = data.dimensions;
  const ceilingHeight = data.ceilingHeight ?? 2.7;
  const offsetX = -width / 2;
  const offsetZ = -depth / 2;

  // Default layers (everything visible) if not provided.
  const ly = layers ?? {
    walls: true,
    furniture: true,
    doors: true,
    windows: true,
    labels: true,
    ceiling: true,
    roof: true,
  };

  // Ground patch dimensions (a bit larger than the building)
  const groundW = width + 8;
  const groundD = depth + 8;

  const wallMeshes = useMemo(
    () => data.walls.map((w, i) => (
      <Wall
        key={`w-${i}`}
        wall={w}
        offsetX={offsetX}
        offsetZ={offsetZ}
        color={wallColor}
        wireframe={wireframe}
        clippingPlanes={clippingPlanes}
      />
    )),
    [data.walls, offsetX, offsetZ, wallColor, wireframe, clippingPlanes],
  );

  return (
    <group>
      {/* Exterior ground (lawn/terrace) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[groundW, groundD]} />
        <meshStandardMaterial color={wireframe ? '#2a2a2a' : '#bcd6a0'} roughness={1} />
      </mesh>

      {/* Building floor slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 0.3, depth + 0.3]} />
        <meshStandardMaterial color={floorColor} roughness={0.95} clippingPlanes={clippingPlanes} clipShadows />
      </mesh>

      {/* Room floor tints + labels */}
      {showLabels &&
        data.rooms.map((r, i) => (
          <RoomFloor key={`r-${i}`} room={r} offsetX={offsetX} offsetZ={offsetZ} />
        ))}

      {/* Walls */}
      {ly.walls && wallMeshes}

      {/* Doors */}
      {ly.doors &&
        data.doors.map((d, i) => (
          <Door
            key={`d-${i}`}
            door={d}
            offsetX={offsetX}
            offsetZ={offsetZ}
            ceilingHeight={ceilingHeight}
            clippingPlanes={clippingPlanes}
          />
        ))}

      {/* Windows */}
      {ly.windows &&
        data.windows.map((w, i) => (
          <WindowMesh
            key={`win-${i}`}
            win={w}
            offsetX={offsetX}
            offsetZ={offsetZ}
            clippingPlanes={clippingPlanes}
          />
        ))}

      {/* Furniture */}
      {showFurniture && ly.furniture &&
        data.furniture.map((f, i) => (
          <Furniture
            key={`f-${i}`}
            item={f}
            offsetX={offsetX}
            offsetZ={offsetZ}
            clippingPlanes={clippingPlanes}
          />
        ))}

      {/* Ceiling (translucent, only visible from above-ish via orbit) */}
      {showCeiling && !wireframe && (
        <mesh position={[0, ceilingHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color="#f8f5ee" roughness={1} transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export default BuildingModel;

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

/** Lighten (+) or darken (-) a hex color by a percentage. */
function shadeColor(hex: string, percent: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return hex;
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = percent / 100;
  r = Math.round(Math.min(255, Math.max(0, r + r * f)));
  g = Math.round(Math.min(255, Math.max(0, g + g * f)));
  b = Math.round(Math.min(255, Math.max(0, b + b * f)));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
