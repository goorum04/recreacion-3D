'use client';

import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useCursor, MeshReflectorMaterial } from '@react-three/drei';
import { buildWallSlabs, clamp, type WallSlab } from '@/lib/floor-plan-geometry';
import { useProceduralMaterial, floorKindFor, type TextureKind } from '@/lib/procedural-textures';
import type {
  FloorPlanData,
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
  slab: WallSlab;
  ceilingHeight: number;
  offsetX: number;
  offsetZ: number;
  color: string;
  wireframe?: boolean;
  clippingPlanes?: THREE.Plane[];
}

function Wall({ slab, ceilingHeight, offsetX, offsetZ, color, wireframe, clippingPlanes = [] }: WallProps) {
  const { x1, z1, x2, z2, thickness, yFrom, yTo } = slab;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (x1 + x2) / 2 + offsetX;
  const cz = (z1 + z2) / 2 + offsetZ;
  const h = yTo - yFrom;
  const midY = (yFrom + yTo) / 2;
  const atFloor = yFrom < 0.02;
  const atCeiling = yTo > ceilingHeight - 0.02;

  // Slightly darker shade for baseboard/trim derived from the wall color.
  // (must be called before any early return to respect the rules of hooks)
  const trimColor = useMemo(() => shadeColor(color, -18), [color]);
  const paint = useProceduralMaterial('paint', color, length, h, 1.4);

  if (length < 0.01 || h < 0.02) return null;

  return (
    <group position={[cx, 0, cz]} rotation={[0, angle, 0]}>
      {/* Wall body */}
      <mesh position={[0, midY, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, h, length]} />
        {wireframe ? (
          <meshStandardMaterial color={color} roughness={0.9} wireframe clippingPlanes={clippingPlanes} />
        ) : (
          <meshStandardMaterial
            color="#ffffff"
            map={paint.map}
            roughnessMap={paint.roughnessMap}
            roughness={1}
            clippingPlanes={clippingPlanes}
            clipShadows
          />
        )}
      </mesh>
      {!wireframe && atFloor && (
        <mesh position={[0, yFrom + 0.06, 0]}>
          <boxGeometry args={[thickness * 1.05, 0.12, length]} />
          <meshStandardMaterial color={trimColor} roughness={0.8} clippingPlanes={clippingPlanes} />
        </mesh>
      )}
      {!wireframe && atCeiling && (
        <mesh position={[0, yTo - 0.05, 0]}>
          <boxGeometry args={[thickness * 1.08, 0.08, length]} />
          <meshStandardMaterial color={trimColor} roughness={0.85} clippingPlanes={clippingPlanes} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Corner post (hides the seam where two rotated wall boxes meet)      */
/* ------------------------------------------------------------------ */

function CornerPost({
  x,
  z,
  height,
  thickness,
  offsetX,
  offsetZ,
  color,
  clippingPlanes = [],
}: {
  x: number;
  z: number;
  height: number;
  thickness: number;
  offsetX: number;
  offsetZ: number;
  color: string;
  clippingPlanes?: THREE.Plane[];
}) {
  return (
    <mesh position={[x + offsetX, height / 2, z + offsetZ]} castShadow receiveShadow>
      <boxGeometry args={[thickness * 1.15, height, thickness * 1.15]} />
      <meshStandardMaterial color={color} roughness={0.9} clippingPlanes={clippingPlanes} />
    </mesh>
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
  open: boolean;
  onToggle: () => void;
  clippingPlanes?: THREE.Plane[];
}

// Leaf rotation around its hinge (local Y). At CLOSED_ROT the leaf sweeps
// from the hinge to exactly span the frame gap (verified against the
// door group's actual world-space bounding box, not just by inspection —
// the opposite sign looks plausible from some camera angles but actually
// swings the leaf entirely outside the opening). Sweeping toward OPEN_ROT
// swings it into the room.
const DOOR_CLOSED_ROT = -Math.PI / 2;
const DOOR_SWING = (80 * Math.PI) / 180;
const DOOR_OPEN_ROT = DOOR_CLOSED_ROT + DOOR_SWING;

function Door({ door, offsetX, offsetZ, ceilingHeight, open, onToggle, clippingPlanes = [] }: DoorProps) {
  const { x, z, width, rotation } = door;
  const cx = x + offsetX;
  const cz = z + offsetZ;
  const h = Math.min(2.1, ceilingHeight - 0.2);
  const leafRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  useFrame((_, delta) => {
    const g = leafRef.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, open ? DOOR_OPEN_ROT : DOOR_CLOSED_ROT, 8, delta);
  });

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
      {/* Door leaf: hinged at the left post, click to open/close */}
      <group
        position={[0, 0, -width / 2]}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <group ref={leafRef} rotation={[0, DOOR_CLOSED_ROT, 0]}>
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
  open: boolean;
  onToggle: () => void;
  clippingPlanes?: THREE.Plane[];
}

// Same hinge convention as the door leaf, but casement windows swing less
// wide open.
const WINDOW_CLOSED_ROT = -Math.PI / 2;
const WINDOW_SWING = (65 * Math.PI) / 180;
const WINDOW_OPEN_ROT = WINDOW_CLOSED_ROT + WINDOW_SWING;

function WindowMesh({ win, offsetX, offsetZ, open, onToggle, clippingPlanes = [] }: WindowProps) {
  const { x, z, width, sillHeight, height, rotation } = win;
  const cx = x + offsetX;
  const cz = z + offsetZ;
  const midY = sillHeight + height / 2;
  const sashRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  useFrame((_, delta) => {
    const g = sashRef.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, open ? WINDOW_OPEN_ROT : WINDOW_CLOSED_ROT, 8, delta);
  });

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotation, 0]}>
      {/* Fixed outer frame, set into the wall opening */}
      <mesh position={[0, sillHeight + height + 0.03, 0]}>
        <boxGeometry args={[0.12, 0.06, width + 0.06]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      <mesh position={[0, sillHeight - 0.03, 0]}>
        <boxGeometry args={[0.16, 0.06, width + 0.08]} />
        <meshStandardMaterial color="#6b5a48" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      <mesh position={[0, midY, -width / 2 - 0.03]}>
        <boxGeometry args={[0.1, height + 0.1, 0.06]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>
      <mesh position={[0, midY, width / 2 + 0.03]}>
        <boxGeometry args={[0.1, height + 0.1, 0.06]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.6} clippingPlanes={clippingPlanes} />
      </mesh>

      {/* Moving sash (glass), hinged at the left jamb — click to open/close */}
      <group
        position={[0, 0, -width / 2]}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <group ref={sashRef} rotation={[0, WINDOW_CLOSED_ROT, 0]}>
          <mesh position={[width / 2, midY, 0]}>
            <boxGeometry args={[width, height, 0.05]} />
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
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Room floor patch + label                                            */
/* ------------------------------------------------------------------ */

function RoomFloor({
  room,
  offsetX,
  offsetZ,
  floorKind,
}: {
  room: Room;
  offsetX: number;
  offsetZ: number;
  floorKind: TextureKind;
}) {
  // Approximate a square patch from area for visual floor tint
  const side = Math.sqrt(room.area) * 0.9;
  const color = room.color || '#e8e2d5';
  const floor = useProceduralMaterial(floorKind, color, side, side, 0.7);
  return (
    <group position={[room.cx + offsetX, 0.005, room.cz + offsetZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[side, side]} />
        <meshStandardMaterial color="#ffffff" map={floor.map} roughnessMap={floor.roughnessMap} roughness={1} />
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
    case 'sofa': {
      const variant = item.variant ?? 'straight';
      if (variant === 'straight') {
        return (
          <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
            {/* Base/frame */}
            <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.96, 0.2, 0.82]} />
              {mat('#5c6b80')}
            </mesh>
            {/* Individual seat cushions (small gaps read as stitching seams) */}
            {[-0.63, 0, 0.63].map((lx, i) => (
              <mesh key={i} position={[lx, 0.32, 0.03]} castShadow receiveShadow>
                <boxGeometry args={[0.58, 0.2, 0.78]} />
                {mat('#6b7a8f')}
              </mesh>
            ))}
            {/* Backrest cushions */}
            {[-0.63, 0, 0.63].map((lx, i) => (
              <mesh key={i} position={[lx, 0.56, -0.35]} castShadow>
                <boxGeometry args={[0.58, 0.36, 0.16]} />
                {mat('#657386')}
              </mesh>
            ))}
            {/* Armrests */}
            <mesh position={[-0.55, 0.4, 0.1]} castShadow>
              <boxGeometry args={[0.4, 0.28, 0.66]} />
              {mat('#7a8aa0')}
            </mesh>
            <mesh position={[0.55, 0.4, 0.1]} castShadow>
              <boxGeometry args={[0.4, 0.28, 0.66]} />
              {mat('#7a8aa0')}
            </mesh>
            {/* Short wooden legs */}
            {[
              [-0.9, -0.32],
              [0.9, -0.32],
              [-0.9, 0.32],
              [0.9, 0.32],
            ].map(([lx, lz], i) => (
              <mesh key={i} position={[lx, 0.02, lz]} castShadow>
                <cylinderGeometry args={[0.025, 0.02, 0.08, 8]} />
                {mat('#4a3a28', { roughness: 0.6 })}
              </mesh>
            ))}
          </group>
        );
      }

      // L-shaped chaise longue / corner sectional. `dir` picks which end
      // (as seen sitting on the main run facing local +Z) the chaise foot
      // extends from: +1 for chaise-right, -1 for chaise-left.
      const dir = variant === 'chaise-right' ? 1 : -1;
      const armX = -dir * 0.95; // armrest at the end opposite the chaise
      const chaiseX = dir * 0.44; // chaise foot center X
      const chaiseZ = 0.24; // chaise foot extends further into the room than the main run
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          {/* Base: main seating run */}
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.7, 0.2, 0.82]} />
            {mat('#5c6b80')}
          </mesh>
          {/* Base: chaise foot, sharing the corner with the main run */}
          <mesh position={[chaiseX, 0.14, chaiseZ]} castShadow receiveShadow>
            <boxGeometry args={[0.82, 0.2, 1.3]} />
            {mat('#5c6b80')}
          </mesh>
          {/* Seat cushions on the main run */}
          {[-0.43, 0.43].map((lx, i) => (
            <mesh key={i} position={[lx, 0.32, 0.03]} castShadow receiveShadow>
              <boxGeometry args={[0.8, 0.2, 0.78]} />
              {mat('#6b7a8f')}
            </mesh>
          ))}
          {/* Chaise cushion */}
          <mesh position={[chaiseX, 0.32, chaiseZ]} castShadow receiveShadow>
            <boxGeometry args={[0.76, 0.2, 1.24]} />
            {mat('#6b7a8f')}
          </mesh>
          {/* Backrest along the main run's back edge only (the chaise foot is open) */}
          {[-0.43, 0.43].map((lx, i) => (
            <mesh key={i} position={[lx, 0.56, -0.35]} castShadow>
              <boxGeometry args={[0.8, 0.36, 0.16]} />
              {mat('#657386')}
            </mesh>
          ))}
          {/* Armrest at the end opposite the chaise */}
          <mesh position={[armX, 0.4, 0.1]} castShadow>
            <boxGeometry args={[0.4, 0.28, 0.66]} />
            {mat('#7a8aa0')}
          </mesh>
          {/* Short wooden legs */}
          {[
            [-dir * 0.78, -0.32],
            [-dir * 0.78, 0.32],
            [chaiseX - dir * 0.3, chaiseZ + 0.55],
            [chaiseX + dir * 0.3, chaiseZ + 0.55],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.02, lz]} castShadow>
              <cylinderGeometry args={[0.025, 0.02, 0.08, 8]} />
              {mat('#4a3a28', { roughness: 0.6 })}
            </mesh>
          ))}
        </group>
      );
    }
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
          {/* Legs */}
          {[
            [-0.72, -0.9],
            [0.72, -0.9],
            [-0.72, 0.9],
            [0.72, 0.9],
          ].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.08, lz]} castShadow>
              <boxGeometry args={[0.08, 0.16, 0.08]} />
              <meshStandardMaterial color="#5a4530" roughness={0.6} />
            </mesh>
          ))}
          {/* Base frame */}
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.62, 0.16, 2.02]} />
            <meshStandardMaterial color="#8a7256" roughness={0.7} />
          </mesh>
          {/* Mattress */}
          <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.55, 0.22, 1.95]} />
            <meshStandardMaterial color="#eee7da" roughness={0.85} />
          </mesh>
          {/* Duvet (covers the lower two-thirds) */}
          <mesh position={[0, 0.48, 0.35]} castShadow receiveShadow>
            <boxGeometry args={[1.58, 0.12, 1.2]} />
            <meshStandardMaterial color="#c9b8a0" roughness={0.9} />
          </mesh>
          {/* Two pillows */}
          {[-0.38, 0.38].map((lx, i) => (
            <mesh key={i} position={[lx, 0.5, -0.72]} castShadow>
              <boxGeometry args={[0.6, 0.16, 0.42]} />
              <meshStandardMaterial color="#ffffff" roughness={1} />
            </mesh>
          ))}
          {/* Headboard */}
          <mesh position={[0, 0.55, -0.98]} castShadow>
            <boxGeometry args={[1.68, 0.7, 0.1]} />
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
          {/* Toe-kick (recessed base, common on real cabinetry) */}
          <mesh position={[0, 0.05, 0.02]} castShadow>
            <boxGeometry args={[1.76, 0.1, 0.56]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.8} />
          </mesh>
          {/* Cabinet body */}
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.8, 0.8, 0.6]} />
            <meshStandardMaterial color="#d8d0c0" roughness={0.7} />
          </mesh>
          {/* Door seams (three cabinet fronts) */}
          {[-0.6, 0, 0.6].map((lx, i) => (
            <mesh key={i} position={[lx, 0.48, 0.301]} castShadow>
              <boxGeometry args={[0.56, 0.72, 0.01]} />
              <meshStandardMaterial color="#c9c0ae" roughness={0.6} />
            </mesh>
          ))}
          {/* Cabinet door handles */}
          {[-0.42, 0.18, 0.78].map((lx, i) => (
            <mesh key={i} position={[lx, 0.48, 0.32]} castShadow>
              <boxGeometry args={[0.02, 0.14, 0.02]} />
              <meshStandardMaterial color="#8a8a8a" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
          {/* Countertop */}
          <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.9, 0.06, 0.7]} />
            <meshStandardMaterial color="#3a3a3a" roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      );
    case 'toilet':
      return (
        <group position={[px, 0, pz]} rotation={[0, item.rotation, 0]} scale={s}>
          {/* Pedestal base */}
          <mesh position={[0, 0.1, 0.12]} castShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.2, 16]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.3} />
          </mesh>
          {/* Bowl (oval via non-uniform scale on a cylinder) */}
          <mesh position={[0, 0.32, 0.1]} scale={[1, 0.5, 1.35]} castShadow>
            <cylinderGeometry args={[0.22, 0.19, 0.22, 20]} />
            <meshStandardMaterial color="#fbfbfb" roughness={0.25} />
          </mesh>
          {/* Seat ring */}
          <mesh position={[0, 0.44, 0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.2, 0.03, 10, 24]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
          {/* Cistern/tank */}
          <mesh position={[0, 0.55, -0.2]} castShadow>
            <boxGeometry args={[0.42, 0.4, 0.14]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.76, -0.2]} castShadow>
            <boxGeometry args={[0.46, 0.04, 0.18]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} />
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
/* Roof (pitched gable, ridge along the building's longer axis)       */
/* ------------------------------------------------------------------ */

interface RoofProps {
  width: number;
  depth: number;
  ceilingHeight: number;
  color: string;
  wireframe?: boolean;
  clippingPlanes?: THREE.Plane[];
}

function Roof({ width, depth, ceilingHeight, color, wireframe, clippingPlanes = [] }: RoofProps) {
  const ridgeAlongX = width >= depth;
  const long = ridgeAlongX ? width : depth;
  const short = ridgeAlongX ? depth : width;

  const overhang = 0.5;
  const rise = clamp(short * 0.22, 0.9, 2.4);
  const halfLong = long / 2 + overhang;
  const halfShort = short / 2 + overhang;
  const slopeLength = Math.sqrt(halfShort * halfShort + rise * rise);
  const slopeAngle = Math.atan2(rise, halfShort);
  const baseY = ceilingHeight + 0.05;
  const roofColor = useMemo(() => shadeColor(color, -32), [color]);
  const gableColor = useMemo(() => shadeColor(color, -12), [color]);

  const gableShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfShort, 0);
    shape.lineTo(halfShort, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    return shape;
  }, [halfShort, rise]);

  return (
    <group position={[0, baseY, 0]} rotation={[0, ridgeAlongX ? 0 : Math.PI / 2, 0]}>
      {/* Two roof slopes meeting at a ridge over the building's center line */}
      <mesh position={[0, rise / 2, halfShort / 2]} rotation={[slopeAngle, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[halfLong * 2, 0.08, slopeLength]} />
        <meshStandardMaterial color={roofColor} roughness={0.7} wireframe={wireframe} clippingPlanes={clippingPlanes} />
      </mesh>
      <mesh position={[0, rise / 2, -halfShort / 2]} rotation={[-slopeAngle, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[halfLong * 2, 0.08, slopeLength]} />
        <meshStandardMaterial color={roofColor} roughness={0.7} wireframe={wireframe} clippingPlanes={clippingPlanes} />
      </mesh>
      {/* Triangular gable end walls closing the two ends */}
      {!wireframe && (
        <>
          <mesh position={[-halfLong, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <shapeGeometry args={[gableShape]} />
            <meshStandardMaterial color={gableColor} roughness={0.9} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
          </mesh>
          <mesh position={[halfLong, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <shapeGeometry args={[gableShape]} />
            <meshStandardMaterial color={gableColor} roughness={0.9} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
          </mesh>
        </>
      )}
    </group>
  );
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
    roof: false,
  };

  // Ground patch dimensions (a bit larger than the building)
  const groundW = width + 8;
  const groundD = depth + 8;

  const floorKind = floorKindFor(floorColor);
  const groundMaterial = useProceduralMaterial('grass', '#bcd6a0', groundW, groundD, 1.6);
  const slabMaterial = useProceduralMaterial(floorKind, floorColor, width + 0.3, depth + 0.3, 0.7);

  // Doors/windows need a real gap cut into the wall they sit on — otherwise
  // they just float decoratively in front of a solid, closed wall. Doors
  // remove the wall entirely at their span; windows only remove the band
  // between sill and header.
  const doorSpans = useMemo(
    () => data.doors.map((d) => ({ x: d.x, z: d.z, width: d.width })),
    [data.doors],
  );
  const windowSpans = useMemo(
    () => data.windows.map((w) => ({ x: w.x, z: w.z, width: w.width, sillHeight: w.sillHeight, height: w.height })),
    [data.windows],
  );

  const wallMeshes = useMemo(
    () =>
      data.walls.flatMap((w, i) =>
        buildWallSlabs(w, doorSpans, windowSpans).map((slab, j) => (
          <Wall
            key={`w-${i}-${j}`}
            slab={slab}
            ceilingHeight={ceilingHeight}
            offsetX={offsetX}
            offsetZ={offsetZ}
            color={wallColor}
            wireframe={wireframe}
            clippingPlanes={clippingPlanes}
          />
        )),
      ),
    [data.walls, doorSpans, windowSpans, ceilingHeight, offsetX, offsetZ, wallColor, wireframe, clippingPlanes],
  );

  // Open/closed state per door/window, keyed by index; resets to "all
  // closed" only when the plan's opening count actually changes (a new
  // plan/project loaded), adjusted during render per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // rather than in an effect, so it doesn't cause an extra render pass.
  const [doorOpen, setDoorOpen] = useState<boolean[]>(() => data.doors.map(() => false));
  const [prevDoorCount, setPrevDoorCount] = useState(data.doors.length);
  if (data.doors.length !== prevDoorCount) {
    setPrevDoorCount(data.doors.length);
    setDoorOpen(data.doors.map(() => false));
  }
  const [windowOpen, setWindowOpen] = useState<boolean[]>(() => data.windows.map(() => false));
  const [prevWindowCount, setPrevWindowCount] = useState(data.windows.length);
  if (data.windows.length !== prevWindowCount) {
    setPrevWindowCount(data.windows.length);
    setWindowOpen(data.windows.map(() => false));
  }

  // A small square post at every wall corner hides the diagonal seam where
  // two rotated wall boxes meet (or end).
  const cornerPosts = useMemo(() => {
    const corners = new Map<string, { x: number; z: number; thickness: number }>();
    for (const w of data.walls) {
      for (const [x, z] of [[w.x1, w.z1], [w.x2, w.z2]] as const) {
        const key = `${x.toFixed(2)},${z.toFixed(2)}`;
        const existing = corners.get(key);
        const thickness = w.thickness ?? 0.15;
        if (!existing || thickness > existing.thickness) {
          corners.set(key, { x, z, thickness });
        }
      }
    }
    return Array.from(corners.values()).map((c, i) => (
      <CornerPost
        key={`corner-${i}`}
        x={c.x}
        z={c.z}
        height={ceilingHeight}
        thickness={c.thickness}
        offsetX={offsetX}
        offsetZ={offsetZ}
        color={wallColor}
        clippingPlanes={clippingPlanes}
      />
    ));
  }, [data.walls, ceilingHeight, offsetX, offsetZ, wallColor, clippingPlanes]);

  return (
    <group>
      {/* Exterior ground (lawn/terrace) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[groundW, groundD]} />
        {wireframe ? (
          <meshStandardMaterial color="#2a2a2a" roughness={1} />
        ) : (
          <meshStandardMaterial
            color="#ffffff"
            map={groundMaterial.map}
            roughnessMap={groundMaterial.roughnessMap}
            roughness={1}
          />
        )}
      </mesh>

      {/* Building floor slab — polished materials (marble) get a soft blurred reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 0.3, depth + 0.3]} />
        {wireframe ? (
          <meshStandardMaterial color={floorColor} roughness={0.95} clippingPlanes={clippingPlanes} clipShadows />
        ) : floorKind === 'marble' ? (
          <MeshReflectorMaterial
            color="#ffffff"
            map={slabMaterial.map}
            roughnessMap={slabMaterial.roughnessMap}
            roughness={1}
            resolution={512}
            mixBlur={3}
            mixStrength={0.7}
            blur={[280, 90]}
            minDepthThreshold={0.85}
            maxDepthThreshold={1}
            depthScale={0}
            mirror={0}
            clippingPlanes={clippingPlanes}
          />
        ) : (
          <meshStandardMaterial
            color="#ffffff"
            map={slabMaterial.map}
            roughnessMap={slabMaterial.roughnessMap}
            roughness={1}
            clippingPlanes={clippingPlanes}
            clipShadows
          />
        )}
      </mesh>

      {/* Room floor tints + labels */}
      {showLabels &&
        data.rooms.map((r, i) => (
          <RoomFloor key={`r-${i}`} room={r} offsetX={offsetX} offsetZ={offsetZ} floorKind={floorKind} />
        ))}

      {/* Walls */}
      {ly.walls && wallMeshes}
      {ly.walls && !wireframe && cornerPosts}

      {/* Doors — click a door to open/close it */}
      {ly.doors &&
        data.doors.map((d, i) => (
          <Door
            key={`d-${i}`}
            door={d}
            offsetX={offsetX}
            offsetZ={offsetZ}
            ceilingHeight={ceilingHeight}
            open={doorOpen[i] ?? false}
            onToggle={() => setDoorOpen((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            clippingPlanes={clippingPlanes}
          />
        ))}

      {/* Windows — click a window to open/close it */}
      {ly.windows &&
        data.windows.map((w, i) => (
          <WindowMesh
            key={`win-${i}`}
            win={w}
            offsetX={offsetX}
            offsetZ={offsetZ}
            open={windowOpen[i] ?? false}
            onToggle={() => setWindowOpen((prev) => prev.map((v, j) => (j === i ? !v : v)))}
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

      {/* Pitched roof over the building envelope */}
      {ly.roof && (
        <Roof
          width={width}
          depth={depth}
          ceilingHeight={ceilingHeight}
          color={wallColor}
          wireframe={wireframe}
          clippingPlanes={clippingPlanes}
        />
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
