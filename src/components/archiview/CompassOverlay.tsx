'use client';

import { useEffect, useState } from 'react';
import { Compass as CompassIcon } from 'lucide-react';
import { getCameraHandle } from '@/lib/camera-bridge';

/**
 * A 2D compass overlay that reflects the current camera azimuth.
 *
 * It polls the camera's rotation every ~120ms (cheap) via the module-level
 * camera bridge and rotates the compass dial accordingly.
 * North (+Z) points up by default.
 */
export function CompassOverlay({ className }: { className?: string }) {
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const dir = { x: 0, y: 0, z: -1 };
    const tick = (now: number) => {
      if (now - last > 120) {
        last = now;
        const handle = getCameraHandle();
        const cam = handle?.camera;
        if (cam && typeof cam.getWorldDirection === 'function') {
          cam.getWorldDirection(dir);
          // Azimuth: angle from +Z (north), clockwise.
          const az = Math.atan2(dir.x, dir.z);
          setAngle(az);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`pointer-events-none flex items-center gap-2 rounded-lg border border-stone-200/80 bg-white/90 px-2.5 py-1.5 shadow-md backdrop-blur dark:border-stone-700 dark:bg-stone-800/90 ${className || ''}`}
      title="Orientación de la cámara"
    >
      <div className="relative h-9 w-9">
        {/* Dial */}
        <div
          className="absolute inset-0 rounded-full border-2 border-stone-300 bg-stone-50 dark:border-stone-600 dark:bg-stone-900"
          style={{ transform: `rotate(${(-angle * 180) / Math.PI}deg)` }}
        >
          {/* North needle */}
          <div className="absolute left-1/2 top-0.5 h-4 w-0.5 -translate-x-1/2 rounded-full bg-red-500" />
          {/* South needle */}
          <div className="absolute bottom-0.5 left-1/2 h-4 w-0.5 -translate-x-1/2 rounded-full bg-stone-400" />
          {/* E/W markers */}
          <div className="absolute left-0.5 top-1/2 h-0.5 w-3 -translate-y-1/2 rounded-full bg-stone-300 dark:bg-stone-600" />
          <div className="absolute right-0.5 top-1/2 h-0.5 w-3 -translate-y-1/2 rounded-full bg-stone-300 dark:bg-stone-600" />
        </div>
        {/* Center hub */}
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-700 dark:bg-stone-300" />
        {/* N label (fixed, always at top) */}
        <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-red-500">N</span>
      </div>
      <div className="flex flex-col leading-none">
        <CompassIcon className="h-3 w-3 text-stone-400" />
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-stone-400">
          {bearingLabel(angle)}
        </span>
      </div>
    </div>
  );
}

function bearingLabel(rad: number): string {
  // Convert azimuth (0 = north, +pi/2 = east) to a compass label.
  let deg = (rad * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return `${dirs[idx]} ${Math.round(deg)}°`;
}

export default CompassOverlay;
