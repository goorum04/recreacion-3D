'use client';

import { useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  ContactShadows,
  Sky,
  PerspectiveCamera,
  Grid,
  Html,
  Stars,
  Environment,
} from '@react-three/drei';
import { createXRStore, XR, XROrigin } from '@react-three/xr';
import * as THREE from 'three';
import { BuildingModel } from './BuildingModel';
import { MeasurementTool } from './MeasurementTool';
import { SectionPlaneVisual, makeClippingPlane } from './SectionPlane';
import { setCameraHandle } from '@/lib/camera-bridge';
import type { FloorPlanData, SceneSettings, MeasurePoint, MeasureSegment, LayerVisibility } from '@/lib/floor-plan-types';

/** Singleton XR store shared between the Canvas and the UI buttons. */
export const archiXRStore = createXRStore({
  controller: { rayPointer: { rayModel: { color: '#f59e0b' } } },
  emulate: false,
});

interface ArchiSceneProps {
  data: FloorPlanData;
  showLabels: boolean;
  showFurniture: boolean;
  view: 'perspective' | 'top';
  walkMode: boolean;
  settings: SceneSettings;
  measureActive?: boolean;
  measureSegments?: MeasureSegment[];
  measurePending?: MeasurePoint | null;
  onMeasurePoint?: (p: MeasurePoint) => void;
}

/* ------------------------------------------------------------------ */
/* Lighting presets                                                    */
/* ------------------------------------------------------------------ */

interface LightingPreset {
  ambient: number;
  hemi: number;
  hemiSky: string;
  hemiGround: string;
  dir: number;
  dirColor: string;
  dirPos: [number, number, number];
  skyTurbidity: number;
  skyRayleigh: number;
  bg: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sunPos: [number, number, number];
  showStars: boolean;
}

function getLighting(mode: SceneSettings['lighting'], maxDim: number, sunHour: number | null): LightingPreset {
  const M = maxDim;
  // Solar study override: if sunHour is set, compute a sun position around the
  // building based on the hour of day (0-23). 12 = noon (high sun), 6/18 = horizon.
  if (sunHour !== null) {
    const h = Math.max(0, Math.min(23, sunHour));
    // Sun angle: 0 at 6:00 (east horizon), pi at 18:00 (west horizon), pi/2 at noon.
    const t = (h - 6) / 12; // 0..1 from sunrise to sunset
    const isNight = h < 6 || h > 18;
    const elev = isNight ? 0.05 : Math.sin(t * Math.PI); // 0..1..0
    const azimuth = t * Math.PI; // 0..pi (east -> south -> west)
    const sunDist = M * 1.4;
    const sunX = Math.cos(azimuth) * sunDist * Math.cos(elev);
    const sunY = Math.max(0.5, Math.sin(elev) * M * 1.8);
    const sunZ = Math.sin(azimuth) * sunDist * Math.cos(elev);
    if (isNight) {
      return {
        ambient: 0.15,
        hemi: 0.2,
        hemiSky: '#2a3550',
        hemiGround: '#0e0e1a',
        dir: 0.3,
        dirColor: '#9fb8e0',
        dirPos: [sunX, sunY, sunZ],
        skyTurbidity: 0.2,
        skyRayleigh: 0.6,
        bg: '#0a0f1e',
        fog: '#0a0f1e',
        fogNear: M * 2,
        fogFar: M * 5,
        sunPos: [sunX, sunY, sunZ],
        showStars: true,
      };
    }
    // Warm at low elevation (morning/evening), white at noon.
    const warmth = 1 - elev; // 0 at noon, 1 at horizon
    const r = Math.round(255);
    const g = Math.round(255 - warmth * 90);
    const b = Math.round(255 - warmth * 150);
    const dirColor = `rgb(${r},${g},${b})`;
    const bgR = Math.round(219 - warmth * 60);
    const bgG = Math.round(234 - warmth * 90);
    const bgB = Math.round(254 - warmth * 110);
    return {
      ambient: 0.3 + elev * 0.3,
      hemi: 0.3 + elev * 0.3,
      hemiSky: `rgb(${bgR + 10},${bgG + 10},${bgB + 10})`,
      hemiGround: '#8b6a4a',
      dir: 0.6 + elev * 1.1,
      dirColor,
      dirPos: [sunX, sunY, sunZ],
      skyTurbidity: 4 + warmth * 5,
      skyRayleigh: 1 + warmth * 2,
      bg: `rgb(${bgR},${bgG},${bgB})`,
      fog: `rgb(${bgR},${bgG},${bgB})`,
      fogNear: M * 2.5,
      fogFar: M * 6,
      sunPos: [sunX, sunY, sunZ],
      showStars: false,
    };
  }
  if (mode === 'night') {
    return {
      ambient: 0.18,
      hemi: 0.25,
      hemiSky: '#3b4a6b',
      hemiGround: '#1a1a2e',
      dir: 0.35,
      dirColor: '#a6c0e8',
      dirPos: [M * 0.6, M * 1.8, M * 0.4],
      skyTurbidity: 0.1,
      skyRayleigh: 0.5,
      bg: '#0b1020',
      fog: '#0b1020',
      fogNear: M * 2,
      fogFar: M * 5,
      sunPos: [M * 0.6, M * 1.8, M * 0.4],
      showStars: true,
    };
  }
  if (mode === 'sunset') {
    return {
      ambient: 0.45,
      hemi: 0.5,
      hemiSky: '#ffd9a0',
      hemiGround: '#8b5a3c',
      dir: 1.6,
      dirColor: '#ffb070',
      dirPos: [M * 1.2, M * 0.7, M * 0.5],
      skyTurbidity: 8,
      skyRayleigh: 2.5,
      bg: '#f4c896',
      fog: '#f4c896',
      fogNear: M * 2.5,
      fogFar: M * 6,
      sunPos: [M * 1.2, M * 0.7, M * 0.5],
      showStars: false,
    };
  }
  // day
  return {
    ambient: 0.55,
    hemi: 0.5,
    hemiSky: '#ffffff',
    hemiGround: '#b0a890',
    dir: 1.5,
    dirColor: '#fff8f0',
    dirPos: [M, M * 1.5, M],
    skyTurbidity: 6,
    skyRayleigh: 1.2,
    bg: '#dbeafe',
    fog: '#dbeafe',
    fogNear: M * 2.5,
    fogFar: M * 6,
    sunPos: [M, M * 1.5, M],
    showStars: false,
  };
}

/* ------------------------------------------------------------------ */
/* Camera rig with focus animation                                     */
/* ------------------------------------------------------------------ */

function CameraRig({
  view,
  walkMode,
  data,
  focusRoomId,
}: {
  view: 'perspective' | 'top';
  walkMode: boolean;
  data: FloorPlanData;
  focusRoomId?: string | null;
}) {
  const { width, depth } = data.dimensions;
  const maxDim = Math.max(width, depth);
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  const controls = useThree((s) => s.controls) as any;

  // When focusRoomId changes, smoothly move camera + target to that room.
  useEffect(() => {
    if (!focusRoomId || !camRef.current || !controls) return;
    const room = data.rooms.find((r) => r.id === focusRoomId);
    if (!room) return;
    const offsetX = -width / 2;
    const offsetZ = -depth / 2;
    const tx = room.cx + offsetX;
    const tz = room.cz + offsetZ;
    // Position camera offset from the room center, looking down slightly.
    const camTarget: THREE.Vector3 = new THREE.Vector3(tx + 4, 3.5, tz + 4);
    const ctrlTarget: THREE.Vector3 = new THREE.Vector3(tx, 0.8, tz);
    // Animate via simple lerp over ~0.6s
    const startPos = camRef.current.position.clone();
    const startTarget = controls.target.clone();
    const duration = 600;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      camRef.current!.position.lerpVectors(startPos, camTarget, ease);
      controls.target.lerpVectors(startTarget, ctrlTarget, ease);
      controls.update();
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focusRoomId, data.rooms, data.dimensions, width, depth, controls]);

  if (view === 'top') {
    return (
      <PerspectiveCamera ref={camRef} makeDefault position={[0, maxDim * 1.4, 0.01]} fov={45} near={0.1} far={200} />
    );
  }
  if (walkMode) {
    return (
      <PerspectiveCamera ref={camRef} makeDefault position={[0, 1.6, 0]} fov={70} near={0.05} far={200} />
    );
  }
  return (
    <PerspectiveCamera
      ref={camRef}
      makeDefault
      position={[maxDim * 0.9, maxDim * 0.7, maxDim * 0.9]}
      fov={45}
      near={0.1}
      far={200}
    />
  );
}

function Loader() {
  return (
    <Html center>
      <div className="flex items-center gap-2 rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-stone-700 shadow-lg">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        Construyendo modelo 3D…
      </div>
    </Html>
  );
}

/** Configures the WebGL renderer when the Canvas is created (clipping planes). */
function onCanvasCreated({ gl }: { gl: THREE.WebGLRenderer }) {
  // Enable per-material clipping planes (used by the section tool).
  gl.localClippingEnabled = true;
}

/**
 * Registers the active camera + controls + scene + renderer into the
 * module-level camera bridge so the viewer UI (outside the Canvas) can
 * read/animate them and export the scene.
 */
function CameraBridge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as any;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    setCameraHandle({ camera, controls: controls ?? null, scene, gl });
    return () => setCameraHandle(null);
  }, [camera, controls, scene, gl]);
  return null;
}

export function ArchiScene({
  data,
  showLabels,
  showFurniture,
  view,
  walkMode,
  settings,
  measureActive = false,
  measureSegments = [],
  measurePending = null,
  onMeasurePoint,
}: ArchiSceneProps) {
  const controlsRef = useRef<any>(null);
  const { width, depth } = data.dimensions;
  const maxDim = Math.max(width, depth);
  const lit = useMemo(
    () => getLighting(settings.lighting, maxDim, settings.sunHour),
    [settings.lighting, maxDim, settings.sunHour],
  );

  // Reset controls target when switching modes
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, walkMode ? 1.2 : 0.5, 0);
      controlsRef.current.update();
    }
  }, [walkMode, view]);

  // Sync autoRotate on the OrbitControls
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = settings.autoRotate;
      controlsRef.current.autoRotateSpeed = 1.2;
    }
  }, [settings.autoRotate]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: settings.lighting === 'night' ? 1.3 : 1,
        preserveDrawingBuffer: true,
      }}
      onCreated={onCanvasCreated}
    >
      <color attach="background" args={[lit.bg]} />
      <fog attach="fog" args={[lit.fog, lit.fogNear, lit.fogFar]} />

      <Suspense fallback={<Loader />}>
        <XR store={archiXRStore}>
          <CameraBridge />
          <CameraRig view={view} walkMode={walkMode} data={data} focusRoomId={settings.focusRoomId} />

          <XROrigin position={[0, 0, 0]} />

          {/* Lighting */}
          <ambientLight intensity={lit.ambient} />
          <hemisphereLight args={[lit.hemiSky, lit.hemiGround, lit.hemi]} />
          <directionalLight
            position={lit.dirPos}
            intensity={lit.dir}
            color={lit.dirColor}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-maxDim}
            shadow-camera-right={maxDim}
            shadow-camera-top={maxDim}
            shadow-camera-bottom={-maxDim}
            shadow-camera-near={0.1}
            shadow-camera-far={maxDim * 5}
            shadow-bias={-0.0005}
          />

          {/* Sky / stars */}
          {lit.showStars ? (
            <Stars radius={maxDim * 4} depth={50} count={2500} factor={4} saturation={0} fade speed={1} />
          ) : (
            <Sky
              sunPosition={lit.sunPos}
              turbidity={lit.skyTurbidity}
              rayleigh={lit.skyRayleigh}
              mieCoefficient={0.005}
              mieDirectionalG={0.8}
            />
          )}

          <BuildingModel
            data={data}
            showLabels={showLabels && settings.layers.labels}
            showFurniture={showFurniture && settings.layers.furniture}
            wallColor={settings.wallColor}
            floorColor={settings.floorColor}
            wireframe={settings.wireframe}
            showCeiling={settings.showCeiling && settings.layers.ceiling}
            layers={settings.layers}
            clippingPlanes={settings.section.enabled ? [makeClippingPlane(settings.section)] : []}
          />

          {/* Section plane visual (translucent red quad showing the cut) */}
          {settings.section.enabled && <SectionPlaneVisual config={settings.section} data={data} />}

          {/* Measurement tool (clickable ground + segment rendering) */}
          <MeasurementTool
            active={measureActive}
            segments={measureSegments}
            pending={measurePending}
            onPoint={onMeasurePoint || (() => {})}
          />

          {/* Contact shadow for grounding */}
          <ContactShadows
            position={[0, 0.003, 0]}
            opacity={settings.lighting === 'night' ? 0.6 : 0.4}
            scale={maxDim * 2.5}
            blur={2.4}
            far={maxDim}
            color={settings.lighting === 'night' ? '#000814' : '#1a1a1a'}
          />

          {/* Subtle grid */}
          <Grid
            position={[0, -0.025, 0]}
            args={[maxDim * 3, maxDim * 3]}
            cellSize={1}
            cellThickness={0.6}
            cellColor={settings.lighting === 'night' ? '#2a3358' : '#9ca3af'}
            sectionSize={5}
            sectionThickness={1.1}
            sectionColor={settings.lighting === 'night' ? '#3d4870' : '#6b7280'}
            fadeDistance={maxDim * 3}
            fadeStrength={1}
            infiniteGrid
          />

          {!walkMode && (
            <OrbitControls
              ref={controlsRef}
              enablePan
              panSpeed={0.6}
              minDistance={1.5}
              maxDistance={maxDim * 3}
              maxPolarAngle={Math.PI / 2 - 0.02}
              target={[0, 0.5, 0]}
              makeDefault
              autoRotate={settings.autoRotate}
              autoRotateSpeed={1.2}
            />
          )}
          {walkMode && (
            <OrbitControls
              ref={controlsRef}
              enablePan={false}
              enableZoom
              minDistance={0.2}
              maxDistance={3}
              maxPolarAngle={Math.PI / 2 - 0.02}
              minPolarAngle={0.2}
              target={[0, 1.2, 0]}
              makeDefault
            />
          )}
        </XR>
      </Suspense>
    </Canvas>
  );
}

export default ArchiScene;
