'use client';

import { useCallback, useState } from 'react';
import type { CameraBookmark } from '@/lib/floor-plan-types';
import { readCamera, animateCameraTo } from '@/lib/camera-bridge';

const STORAGE_KEY = 'archivr-bookmarks';

/**
 * Manages camera bookmarks persisted to localStorage.
 * Each bookmark captures the camera position + OrbitControls target.
 *
 * The actual camera read happens via the module-level camera bridge
 * (populated by <CameraBridge/> inside the Canvas).
 */
export function useCameraBookmarks() {
  // Lazy initializer reads from localStorage on the client (avoids setState-in-effect).
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const persist = useCallback((list: CameraBookmark[]) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const addBookmark = useCallback(
    (label?: string) => {
      const cam = readCamera();
      if (!cam) return false;
      const bm: CameraBookmark = {
        id: `bm-${Date.now()}`,
        label: label || `Vista ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`,
        position: cam.position,
        target: cam.target,
        createdAt: Date.now(),
      };
      setBookmarks((prev) => {
        const next = [...prev, bm];
        persist(next);
        return next;
      });
      return true;
    },
    [persist],
  );

  const removeBookmark = useCallback(
    (id: string) => {
      setBookmarks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** Animates the camera to the bookmarked position/target. */
  const restoreBookmark = useCallback((bm: CameraBookmark): boolean => {
    return animateCameraTo(bm.position, bm.target);
  }, []);

  /** Returns the bookmark with the given id, or null. */
  const getBookmark = useCallback(
    (id: string): CameraBookmark | null => bookmarks.find((b) => b.id === id) ?? null,
    [bookmarks],
  );

  return { bookmarks, addBookmark, removeBookmark, restoreBookmark, getBookmark };
}

export default useCameraBookmarks;
