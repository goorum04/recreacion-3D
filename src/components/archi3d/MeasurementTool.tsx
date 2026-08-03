'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { MeasurePoint, MeasureSegment } from '@/lib/floor-plan-types';

interface MeasurementToolProps {
  /** When true, clicks on the ground plane create/extend measurements. */
  active: boolean;
  /** Completed measurements to render. */
  segments: MeasureSegment[];
  /** The pending first point of the next segment (or null). */
  pending: MeasurePoint | null;
  /** Called when the user clicks the ground plane while active. */
  onPoint: (p: MeasurePoint) => void;
}

/**
 * A clickable invisible ground plane that captures measurement clicks,
 * plus the visual rendering of all measurement segments + the pending marker.
 *
 * Clicks are raycast against a large invisible plane at y=0 so the user
 * can click anywhere on the floor to drop a measurement point.
 */
export function MeasurementTool({ active, segments, pending, onPoint }: MeasurementToolProps) {
  const { camera, raycaster, pointer } = useThree();
  const planeRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState<MeasurePoint | null>(null);

  // Reusable plane for raycasting (XZ at y=0)
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!active) return;
      // Raycast from pointer against the ground plane
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        setHover({ x: hit.x, y: 0, z: hit.z });
      }
    },
    [active, camera, raycaster, pointer, groundPlane],
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!active) return;
      e.stopPropagation();
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        onPoint({ x: hit.x, y: 0, z: hit.z });
      }
    },
    [active, camera, raycaster, pointer, groundPlane, onPoint],
  );

  return (
    <group>
      {/* Invisible large clickable plane at floor level */}
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onPointerOut={() => setHover(null)}
        visible={false}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Hover cursor (only while active and pointer over ground) */}
      {active && hover && (
        <group position={[hover.x, 0, hover.z]}>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.08, 0.12, 24]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          {/* Vertical pin */}
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1, 8]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        </group>
      )}

      {/* Pending first-point marker */}
      {pending && (
        <group position={[pending.x, 0, pending.z]}>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.1, 24]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1.2, 8]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
          <mesh position={[0, 1.25, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
        </group>
      )}

      {/* Completed segments */}
      {segments.map((seg) => {
        const mid: MeasurePoint = {
          x: (seg.a.x + seg.b.x) / 2,
          y: 1.5,
          z: (seg.a.z + seg.b.z) / 2,
        };
        return (
          <group key={seg.id}>
            {/* Line between a and b (lifted so it's visible above floor) */}
            <MeasurementLine a={seg.a} b={seg.b} />
            {/* Endpoint markers */}
            <EndMarker point={seg.a} />
            <EndMarker point={seg.b} />
            {/* Distance label — lifted well above the line */}
            <Html position={[mid.x, mid.y, mid.z]} center distanceFactor={10} occlude={false}>
              <div className="pointer-events-none select-none whitespace-nowrap rounded-md border border-amber-400 bg-stone-900 px-2.5 py-1 text-sm font-bold text-amber-400 shadow-xl">
                {seg.distance.toFixed(2)} m
              </div>
            </Html>
          </group>
        );
      })}

      {/* Live preview line from pending to hover */}
      {active && pending && hover && (
        <MeasurementLine a={pending} b={hover} dashed preview />
      )}
    </group>
  );
}

function EndMarker({ point }: { point: MeasurePoint }) {
  return (
    <group position={[point.x, 0, point.z]}>
      {/* Floor disc */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 24]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* White ring around disc for contrast */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.16, 24]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      {/* Vertical pin */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 1.2, 8]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* Top sphere */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}

function MeasurementLine({
  a,
  b,
  dashed = false,
  preview = false,
}: {
  a: MeasurePoint;
  b: MeasurePoint;
  dashed?: boolean;
  preview?: boolean;
}) {
  // Build a visible cylinder between a and b, lifted above the floor to avoid z-fighting.
  const yLift = 0.12;
  const start = new THREE.Vector3(a.x, yLift, a.z);
  const end = new THREE.Vector3(b.x, yLift, b.z);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );

  return (
    <group position={mid} quaternion={quat}>
      {/* Main line — thick enough to be clearly visible */}
      <mesh>
        <cylinderGeometry args={[0.03, 0.03, len, 12]} />
        <meshBasicMaterial
          color={preview ? '#fbbf24' : '#f59e0b'}
          transparent={preview}
          opacity={preview ? 0.6 : 1}
        />
      </mesh>
    </group>
  );
}

export default MeasurementTool;
