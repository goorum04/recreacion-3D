'use client';

import { useEffect } from 'react';

export interface ShortcutHandlers {
  onToggleTop: () => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
  onToggleLabels: () => void;
  onToggleFurniture: () => void;
  onToggleWalk: () => void;
  onToggleMeasure: () => void;
  onScreenshot: () => void;
  onResetView: () => void;
  onBack: () => void;
}

/**
 * Binds professional keyboard shortcuts while the viewer is mounted.
 * Shortcuts are ignored when the user is typing in an input/textarea/select
 * or using a modifier (so browser shortcuts like Ctrl+T still work).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'v':
          e.preventDefault();
          handlers.onToggleTop();
          break;
        case 'w':
          e.preventDefault();
          handlers.onToggleWireframe();
          break;
        case 'r':
          e.preventDefault();
          handlers.onToggleAutoRotate();
          break;
        case 'l':
          e.preventDefault();
          handlers.onToggleLabels();
          break;
        case 'f':
          e.preventDefault();
          handlers.onToggleFurniture();
          break;
        case 'p':
          e.preventDefault();
          handlers.onToggleWalk();
          break;
        case 'm':
          e.preventDefault();
          handlers.onToggleMeasure();
          break;
        case 's':
          e.preventDefault();
          handlers.onScreenshot();
          break;
        case '0':
          e.preventDefault();
          handlers.onResetView();
          break;
        case 'escape':
          handlers.onBack();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, enabled]);
}

export default useKeyboardShortcuts;
