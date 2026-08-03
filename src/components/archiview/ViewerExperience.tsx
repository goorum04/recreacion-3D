'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Glasses,
  Square,
  Box,
  Tags,
  Sofa,
  Eye,
  Save,
  Check,
  Ruler,
  DoorOpen,
  AppWindow,
  Layers,
  Maximize2,
  Footprints,
  Home,
  Sun,
  Moon,
  Sunset,
  Grid3x3,
  Download,
  RotateCw,
  Palette,
  PaintBucket,
  PanelTop,
  X,
  ChevronRight,
  Camera,
  Info,
  Ruler as RulerIcon,
  Trash2,
  Keyboard,
  Clock,
  Scissors,
  Bookmark,
  Plus,
  EyeOff,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { archiXRStore } from '@/components/archi3d/ArchiScene';
import { CompassOverlay } from '@/components/archiview/CompassOverlay';
import type { FloorPlanData, SceneSettings, MeasurePoint, MeasureSegment, CameraBookmark, LayerVisibility } from '@/lib/floor-plan-types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useGlbExport } from '@/hooks/use-glb-export';
import { useScreenshot } from '@/hooks/use-screenshot';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useCameraBookmarks } from '@/hooks/use-camera-bookmarks';
import { useToast } from '@/hooks/use-toast';

// Three.js / R3F must be loaded only on the client.
const ArchiScene = dynamic(
  () => import('@/components/archi3d/ArchiScene').then((m) => m.ArchiScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-stone-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    ),
  },
);

interface ViewerExperienceProps {
  data: FloorPlanData;
  originalImage: string | null;
  onBack: () => void;
  onSave: (name: string) => Promise<boolean>;
}

const DEFAULT_SETTINGS: SceneSettings = {
  lighting: 'day',
  wireframe: false,
  wallColor: '#f4efe6',
  floorColor: '#e0d8c8',
  showCeiling: true,
  autoRotate: false,
  focusRoomId: null,
  sunHour: null,
  section: { enabled: false, axis: 'y', value: 1.5 },
  layers: {
    walls: true,
    furniture: true,
    doors: true,
    windows: true,
    labels: true,
    ceiling: true,
    roof: true,
  },
};

const WALL_PRESETS = [
  { name: 'Crema', color: '#f4efe6' },
  { name: 'Blanco', color: '#fafafa' },
  { name: 'Gris', color: '#d4d4d4' },
  { name: 'Terracota', color: '#d4a373' },
  { name: 'Salvia', color: '#cdd6c0' },
  { name: 'Antracita', color: '#4a4a4a' },
];

const FLOOR_PRESETS = [
  { name: 'Madera', color: '#c9a27a' },
  { name: 'Haya', color: '#e0d0b0' },
  { name: 'Mármol', color: '#ececec' },
  { name: 'Cemento', color: '#b8b0a4' },
  { name: 'Pino', color: '#d8b888' },
  { name: 'Pizarra', color: '#3a3a3a' },
];

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 transition-colors hover:border-amber-300">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-stone-400">{label}</p>
        <p className="truncate text-xs font-bold text-stone-700">{value}</p>
      </div>
    </div>
  );
}

export function ViewerExperience({ data, originalImage, onBack, onSave }: ViewerExperienceProps) {
  const [showLabels, setShowLabels] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [view, setView] = useState<'perspective' | 'top'>('perspective');
  const [walkMode, setWalkMode] = useState(false);
  const [vrSupported, setVrSupported] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<SceneSettings>(DEFAULT_SETTINGS);
  const [activePanel, setActivePanel] = useState<'info' | 'materials' | 'lighting' | 'capas'>('info');
  const [exporting, setExporting] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { bookmarks, addBookmark, removeBookmark, restoreBookmark: restoreBm } = useCameraBookmarks();
  // Measurement state
  const [measureActive, setMeasureActive] = useState(false);
  const [measureSegments, setMeasureSegments] = useState<MeasureSegment[]>([]);
  const [measurePending, setMeasurePending] = useState<MeasurePoint | null>(null);
  const { toast } = useToast();
  const exportGlb = useGlbExport();
  const screenshot = useScreenshot();

  useEffect(() => {
    // Check WebXR support
    const nav = navigator as any;
    if (nav.xr?.isSessionSupported) {
      nav.xr
        .isSessionSupported('immersive-vr')
        .then((ok: boolean) => setVrSupported(ok))
        .catch(() => setVrSupported(false));
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const ok = await onSave(`Proyecto ${new Date().toLocaleDateString('es')}`);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }, [onSave]);

  const handleExportGlb = useCallback(async () => {
    setExporting(true);
    try {
      await exportGlb(`archivr-${data.buildingType || 'plano'}.glb`);
      toast({ title: 'Modelo exportado', description: 'Se descargó el archivo .glb' });
    } catch (err: any) {
      toast({
        title: 'No se pudo exportar',
        description: err?.message || 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [exportGlb, data.buildingType, toast]);

  const handleScreenshot = useCallback(async () => {
    try {
      await screenshot(`archivr-${data.buildingType || 'plano'}.png`);
      toast({ title: 'Captura guardada', description: 'Se descargó la imagen PNG' });
    } catch (err: any) {
      toast({
        title: 'No se pudo capturar',
        description: err?.message || 'Error desconocido',
        variant: 'destructive',
      });
    }
  }, [screenshot, data.buildingType, toast]);

  const focusRoom = useCallback((roomId: string) => {
    setSettings((s) => ({ ...s, focusRoomId: roomId }));
    // Clear the focus trigger after the animation completes so it can be re-triggered.
    setTimeout(() => setSettings((s) => ({ ...s, focusRoomId: null })), 800);
  }, []);

  const updateSettings = useCallback((patch: Partial<SceneSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // --- Measurement handlers ---
  const handleMeasurePoint = useCallback(
    (p: MeasurePoint) => {
      setMeasurePending((prev) => {
        if (!prev) {
          // First point: store it, wait for the second click.
          return p;
        }
        // Second point: create a segment.
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const seg: MeasureSegment = {
          id: `m-${Date.now()}`,
          a: prev,
          b: p,
          distance,
        };
        setMeasureSegments((list) => [...list, seg]);
        return null;
      });
    },
    [],
  );

  const clearMeasurements = useCallback(() => {
    setMeasureSegments([]);
    setMeasurePending(null);
  }, []);

  const toggleMeasure = useCallback(() => {
    setMeasureActive((v) => {
      if (v) setMeasurePending(null); // clear pending when turning off
      return !v;
    });
  }, []);

  const resetView = useCallback(() => {
    setView('perspective');
    setWalkMode(false);
    setSettings((s) => ({ ...s, focusRoomId: '__reset__', autoRotate: false }));
    setTimeout(() => setSettings((s) => ({ ...s, focusRoomId: null })), 100);
  }, []);

  // --- Section plane handlers ---
  const toggleSection = useCallback(() => {
    setSettings((s) => ({ ...s, section: { ...s.section, enabled: !s.section.enabled } }));
  }, []);

  const setSectionAxis = useCallback((axis: 'x' | 'y' | 'z') => {
    setSettings((s) => ({ ...s, section: { ...s.section, axis } }));
  }, []);

  const setSectionValue = useCallback((value: number) => {
    setSettings((s) => ({ ...s, section: { ...s.section, value } }));
  }, []);

  // --- Layer visibility handlers ---
  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setSettings((s) => ({ ...s, layers: { ...s.layers, [key]: !s.layers[key] } }));
  }, []);

  // --- Camera bookmarks ---
  const handleAddBookmark = useCallback(() => {
    const ok = addBookmark();
    if (ok) {
      toast({ title: 'Vista guardada', description: 'Marcador de cámara añadido' });
    } else {
      toast({ title: 'No se pudo guardar', description: 'No se encontró la cámara', variant: 'destructive' });
    }
  }, [addBookmark, toast]);

  const restoreBookmark = useCallback(
    (bm: CameraBookmark) => {
      const ok = restoreBm(bm);
      if (ok) {
        toast({ title: 'Vista restaurada', description: bm.label });
      } else {
        toast({ title: 'No se pudo restaurar', description: 'Cámara no disponible', variant: 'destructive' });
      }
    },
    [restoreBm, toast],
  );

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(
    () => ({
      onToggleTop: () => setView((v) => (v === 'top' ? 'perspective' : 'top')),
      onToggleWireframe: () => setSettings((s) => ({ ...s, wireframe: !s.wireframe })),
      onToggleAutoRotate: () => setSettings((s) => ({ ...s, autoRotate: !s.autoRotate })),
      onToggleLabels: () => setShowLabels((v) => !v),
      onToggleFurniture: () => setShowFurniture((v) => !v),
      onToggleWalk: () => setWalkMode((v) => !v),
      onToggleMeasure: toggleMeasure,
      onScreenshot: handleScreenshot,
      onResetView: resetView,
      onBack,
    }),
    [toggleMeasure, handleScreenshot, resetView, onBack],
  );
  useKeyboardShortcuts(shortcutHandlers, true);

  const area = (data.dimensions.width * data.dimensions.depth).toFixed(1);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-0 lg:flex-row">
      {/* 3D viewport */}
      <div className="relative flex-1 bg-stone-100">
        <ArchiScene
          data={data}
          showLabels={showLabels}
          showFurniture={showFurniture}
          view={view}
          walkMode={walkMode}
          settings={settings}
          measureActive={measureActive}
          measureSegments={measureSegments}
          measurePending={measurePending}
          onMeasurePoint={handleMeasurePoint}
        />

        {/* Top toolbar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onBack} className="shadow-md">
              <ArrowLeft className="mr-1 h-4 w-4" /> Volver
            </Button>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-xl border border-stone-200/80 bg-white/90 p-1 shadow-md backdrop-blur-md">
            <ToggleBtn active={view === 'perspective'} onClick={() => setView('perspective')} title="Vista perspectiva" label="3D">
              <Box className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={view === 'top'} onClick={() => setView('top')} title="Vista de planta" label="Planta">
              <Square className="h-4 w-4" />
            </ToggleBtn>
            <Sep />
            <ToggleBtn active={showLabels} onClick={() => setShowLabels((v) => !v)} title="Etiquetas de habitaciones">
              <Tags className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={showFurniture} onClick={() => setShowFurniture((v) => !v)} title="Mobiliario">
              <Sofa className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={walkMode} onClick={() => setWalkMode((v) => !v)} title="Modo recorrido (1ª persona)">
              <Footprints className="h-4 w-4" />
            </ToggleBtn>
            <Sep />
            <ToggleBtn active={settings.wireframe} onClick={() => updateSettings({ wireframe: !settings.wireframe })} title="Vista wireframe (W)">
              <Grid3x3 className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={settings.autoRotate} onClick={() => updateSettings({ autoRotate: !settings.autoRotate })} title="Auto-rotación (R)">
              <RotateCw className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={settings.section.enabled} onClick={toggleSection} title="Plano de sección (corte)">
              <Scissors className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={false} onClick={handleAddBookmark} title="Guardar vista actual (marcador)">
              <Bookmark className="h-4 w-4" />
            </ToggleBtn>
            <ToggleBtn active={measureActive} onClick={toggleMeasure} title="Herramienta de medición (M)">
              <RulerIcon className="h-4 w-4" />
            </ToggleBtn>
            <Sep />
            <button
              onClick={() => updateSettings({ lighting: settings.lighting === 'day' ? 'sunset' : settings.lighting === 'sunset' ? 'night' : 'day' })}
              title={`Iluminación: ${settings.lighting === 'day' ? 'Día' : settings.lighting === 'sunset' ? 'Atardecer' : 'Noche'}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-stone-100 px-2.5 text-xs font-semibold text-stone-700 transition-all hover:bg-stone-200"
            >
              {settings.lighting === 'day' ? <Sun className="h-4 w-4 text-amber-500" /> : settings.lighting === 'sunset' ? <Sunset className="h-4 w-4 text-orange-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              <span className="hidden sm:inline">{settings.lighting === 'day' ? 'Día' : settings.lighting === 'sunset' ? 'Tarde' : 'Noche'}</span>
            </button>
            <Sep />
            <button
              onClick={handleScreenshot}
              title="Capturar vista como PNG (S)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-600 transition-all hover:bg-stone-100"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowShortcuts((v) => !v)}
              title="Atajos de teclado"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-600 transition-all hover:bg-stone-100"
            >
              <Keyboard className="h-4 w-4" />
            </button>
            <button
              onClick={handleExportGlb}
              disabled={exporting}
              title="Exportar modelo 3D (GLB)"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-stone-800 px-2.5 text-xs font-semibold text-white transition-all hover:bg-stone-700 disabled:opacity-50"
            >
              {exporting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">GLB</span>
            </button>
            <button
              onClick={() => archiXRStore.enterVR()}
              disabled={!vrSupported}
              title={vrSupported ? 'Entrar en realidad virtual' : 'VR no disponible en este dispositivo/navegador'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-all',
                vrSupported
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow hover:shadow-md'
                  : 'cursor-not-allowed bg-stone-100 text-stone-400',
              )}
            >
              <Glasses className="h-4 w-4" /> <span className="hidden sm:inline">VR</span>
            </button>
          </div>
        </div>

        {/* Bottom-left: original plan thumbnail */}
        {originalImage && (
          <div className="absolute bottom-3 left-3 z-10 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:w-52">
            <p className="mb-1 flex items-center gap-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              <Camera className="h-3 w-3" /> Plano original
            </p>
            <img src={originalImage} alt="Plano original" className="h-24 w-full rounded-lg object-contain sm:h-28" />
          </div>
        )}

        {/* Bottom-right: lighting quick-switch + compass */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
          <CompassOverlay />
          <div className="flex items-center gap-1 rounded-lg border border-stone-200/80 bg-white/90 p-1 shadow-md backdrop-blur">
            <LightBtn active={settings.lighting === 'day' && settings.sunHour === null} onClick={() => updateSettings({ lighting: 'day', sunHour: null })} title="Día">
              <Sun className="h-4 w-4" />
            </LightBtn>
            <LightBtn active={settings.lighting === 'sunset' && settings.sunHour === null} onClick={() => updateSettings({ lighting: 'sunset', sunHour: null })} title="Atardecer">
              <Sunset className="h-4 w-4" />
            </LightBtn>
            <LightBtn active={settings.lighting === 'night' && settings.sunHour === null} onClick={() => updateSettings({ lighting: 'night', sunHour: null })} title="Noche">
              <Moon className="h-4 w-4" />
            </LightBtn>
          </div>
        </div>

        {/* Measurement status bar (shown when measuring) */}
        {measureActive && (
          <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-300 bg-amber-50/95 px-4 py-2 text-xs font-medium text-amber-800 shadow-lg backdrop-blur">
            <RulerIcon className="h-4 w-4" />
            <span>
              {measurePending
                ? 'Haz clic para el segundo punto…'
                : 'Haz clic en dos puntos del suelo para medir'}
            </span>
            {measureSegments.length > 0 && (
              <button
                onClick={clearMeasurements}
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-300"
              >
                <Trash2 className="h-3 w-3" /> Borrar ({measureSegments.length})
              </button>
            )}
            <button
              onClick={toggleMeasure}
              className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-700 transition-colors hover:bg-stone-300"
            >
              Salir
            </button>
          </div>
        )}

        {/* Keyboard shortcuts help dialog */}
        {showShortcuts && (
          <div className="absolute bottom-16 right-3 z-20 w-64 rounded-xl border border-stone-200 bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                <Keyboard className="h-4 w-4 text-amber-500" /> Atajos
              </p>
              <button onClick={() => setShowShortcuts(false)} className="text-stone-400 hover:text-stone-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              {[
                ['V', 'Vista planta / 3D'],
                ['W', 'Wireframe'],
                ['R', 'Auto-rotación'],
                ['L', 'Etiquetas'],
                ['F', 'Mobiliario'],
                ['P', 'Recorrido 1ª persona'],
                ['M', 'Medición'],
                ['S', 'Captura PNG'],
                ['0', 'Restablecer vista'],
                ['Esc', 'Volver'],
              ].map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <kbd className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-700">{k}</kbd>
                  <span className="text-stone-600">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute right-3 top-20 z-10 rounded-lg border border-stone-200 bg-white p-2 shadow-md lg:hidden"
          aria-label="Mostrar/ocultar panel"
        >
          <Layers className="h-4 w-4 text-stone-600" />
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'flex w-full flex-col border-l border-stone-200 bg-white transition-all lg:w-80',
          sidebarOpen ? 'max-h-[55vh] overflow-y-auto lg:max-h-none' : 'max-h-0 overflow-hidden lg:max-h-none lg:w-0 lg:border-l-0',
        )}
      >
        {/* Panel tabs */}
        <div className="sticky top-0 z-10 grid grid-cols-4 gap-1 border-b border-stone-200 bg-white/95 p-1.5 backdrop-blur">
          <PanelTab active={activePanel === 'info'} onClick={() => setActivePanel('info')} icon={Info} label="Info" />
          <PanelTab active={activePanel === 'materials'} onClick={() => setActivePanel('materials')} icon={Palette} label="Mat." />
          <PanelTab active={activePanel === 'lighting'} onClick={() => setActivePanel('lighting')} icon={Sun} label="Luz" />
          <PanelTab active={activePanel === 'capas'} onClick={() => setActivePanel('capas')} icon={Layers} label="Capas" />
        </div>

        <div className="flex-1 space-y-4 p-4">
          {/* Summary (always visible) */}
          <div>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 capitalize">
                <Home className="mr-1 h-3 w-3" /> {data.buildingType || 'plan'}
              </Badge>
              <span className="text-xs text-stone-400">{data.rooms.length} habitaciones</span>
            </div>
            <h2 className="mt-2 text-base font-bold leading-tight text-stone-800">
              {data.summary || 'Plano reconstruido en 3D'}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {data.dimensions.width.toFixed(1)} × {data.dimensions.depth.toFixed(1)} m · Altura {(data.ceilingHeight ?? 2.7).toFixed(1)} m
            </p>
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving}
            variant={saved ? 'secondary' : 'default'}
            className={cn('w-full transition-all', saved ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-stone-800 hover:bg-stone-700')}
          >
            {saved ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Guardado
              </>
            ) : saving ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Guardando…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Guardar proyecto
              </>
            )}
          </Button>

          {/* INFO PANEL */}
          {activePanel === 'info' && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <Stat icon={Maximize2} label="Superficie" value={`${area} m²`} />
                <Stat icon={Layers} label="Muros" value={data.walls.length} />
                <Stat icon={DoorOpen} label="Puertas" value={data.doors.length} />
                <Stat icon={AppWindow} label="Ventanas" value={data.windows.length} />
                <Stat icon={Sofa} label="Mobiliario" value={data.furniture.length} />
                <Stat icon={Ruler} label="Altura" value={`${(data.ceilingHeight ?? 2.7).toFixed(1)} m`} />
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <Eye className="h-3.5 w-3.5" /> Habitaciones
                  </div>
                  <span className="text-[10px] text-stone-400">Clic para enfocar</span>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {data.rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => focusRoom(r.id)}
                      className="group flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2 text-left transition-all hover:border-amber-300 hover:bg-amber-50/60"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-stone-300"
                          style={{ backgroundColor: r.color || '#e8e2d5' }}
                        />
                        <span className="truncate text-sm font-medium text-stone-700">{r.name}</span>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-1.5">
                        <span className="text-xs font-semibold text-stone-500">{r.area.toFixed(1)} m²</span>
                        <ChevronRight className="h-3.5 w-3.5 text-stone-300 transition-colors group-hover:text-amber-500" />
                      </div>
                    </button>
                  ))}
                  {data.rooms.length === 0 && (
                    <p className="text-xs text-stone-400">No se detectaron habitaciones.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* MATERIALS PANEL */}
          {activePanel === 'materials' && (
            <>
              <Separator />
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <PaintBucket className="h-3.5 w-3.5" /> Color de paredes
                </div>
                <div className="mb-2 grid grid-cols-6 gap-1.5">
                  {WALL_PRESETS.map((p) => (
                    <button
                      key={p.color}
                      onClick={() => updateSettings({ wallColor: p.color })}
                      title={p.name}
                      className={cn(
                        'aspect-square rounded-lg border-2 transition-all hover:scale-110',
                        settings.wallColor.toLowerCase() === p.color.toLowerCase()
                          ? 'border-amber-500 ring-2 ring-amber-200'
                          : 'border-stone-200',
                      )}
                      style={{ backgroundColor: p.color }}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-500">
                  <span>Personalizado:</span>
                  <input
                    type="color"
                    value={settings.wallColor}
                    onChange={(e) => updateSettings({ wallColor: e.target.value })}
                    className="h-7 w-12 cursor-pointer rounded border border-stone-200 bg-white p-0.5"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Layers className="h-3.5 w-3.5" /> Color de suelo
                </div>
                <div className="mb-2 grid grid-cols-6 gap-1.5">
                  {FLOOR_PRESETS.map((p) => (
                    <button
                      key={p.color}
                      onClick={() => updateSettings({ floorColor: p.color })}
                      title={p.name}
                      className={cn(
                        'aspect-square rounded-lg border-2 transition-all hover:scale-110',
                        settings.floorColor.toLowerCase() === p.color.toLowerCase()
                          ? 'border-amber-500 ring-2 ring-amber-200'
                          : 'border-stone-200',
                      )}
                      style={{ backgroundColor: p.color }}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-500">
                  <span>Personalizado:</span>
                  <input
                    type="color"
                    value={settings.floorColor}
                    onChange={(e) => updateSettings({ floorColor: e.target.value })}
                    className="h-7 w-12 cursor-pointer rounded border border-stone-200 bg-white p-0.5"
                  />
                </label>
              </div>

              <Separator />
              <ToggleRow
                icon={PanelTop}
                label="Techo"
                desc="Muestra el techo translúcido"
                active={settings.showCeiling}
                onClick={() => updateSettings({ showCeiling: !settings.showCeiling })}
              />
              <ToggleRow
                icon={Grid3x3}
                label="Wireframe"
                desc='Vista estructural de alambres'
                active={settings.wireframe}
                onClick={() => updateSettings({ wireframe: !settings.wireframe })}
              />

              <div className="rounded-lg bg-stone-100 p-3 text-xs text-stone-500">
                <button
                  onClick={() => updateSettings({ wallColor: '#f4efe6', floorColor: '#e0d8c8', showCeiling: true, wireframe: false })}
                  className="font-medium text-amber-600 hover:underline"
                >
                  Restablecer materiales
                </button>
              </div>
            </>
          )}

          {/* LIGHTING PANEL */}
          {activePanel === 'lighting' && (
            <>
              <Separator />
              <div className="grid grid-cols-3 gap-2">
                <LightCard active={settings.lighting === 'day' && settings.sunHour === null} onClick={() => updateSettings({ lighting: 'day', sunHour: null })} icon={Sun} label="Día" color="from-sky-400 to-amber-200" />
                <LightCard active={settings.lighting === 'sunset' && settings.sunHour === null} onClick={() => updateSettings({ lighting: 'sunset', sunHour: null })} icon={Sunset} label="Atardecer" color="from-orange-400 to-rose-300" />
                <LightCard active={settings.lighting === 'night' && settings.sunHour === null} onClick={() => updateSettings({ lighting: 'night', sunHour: null })} icon={Moon} label="Noche" color="from-indigo-800 to-slate-700" />
              </div>

              {/* Solar study: sun-hour slider */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300">
                    <Clock className="h-3.5 w-3.5 text-amber-500" /> Estudio solar
                  </p>
                  {settings.sunHour !== null && (
                    <button
                      onClick={() => updateSettings({ sunHour: null })}
                      className="text-[10px] font-semibold text-amber-600 hover:underline"
                    >
                      Desactivar
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={23}
                    step={1}
                    value={settings.sunHour ?? 12}
                    onChange={(e) => updateSettings({ sunHour: Number(e.target.value) })}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-indigo-900 via-amber-300 to-indigo-900 accent-amber-500"
                  />
                  <span className="w-12 rounded-md bg-white px-1.5 py-0.5 text-center text-xs font-bold text-stone-700 dark:bg-stone-900 dark:text-stone-200">
                    {String(settings.sunHour ?? 12).padStart(2, '0')}:00
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] text-stone-500 dark:text-stone-400">
                  Mueve el sol por las horas del día para estudiar asoleamiento y sombras.
                </p>
              </div>

              <ToggleRow
                icon={RotateCw}
                label="Auto-rotación"
                desc="Gira la cámara automáticamente"
                active={settings.autoRotate}
                onClick={() => updateSettings({ autoRotate: !settings.autoRotate })}
              />

              <div className="rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 p-3 text-xs text-amber-800">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Sun className="h-3.5 w-3.5" /> Consejos de iluminación
                </p>
                <ul className="mt-1.5 space-y-1 text-amber-700">
                  <li>· Modo <strong>Día</strong>: ideal para revisar la distribución.</li>
                  <li>· <strong>Atardecer</strong>: resalta materiales y ambientes cálidos.</li>
                  <li>· <strong>Noche</strong>: perfecta para presentaciones inmersivas.</li>
                  <li>· <strong>Estudio solar</strong>: analiza la entrada de luz por horas.</li>
                </ul>
              </div>
            </>
          )}

          {/* CAPAS (LAYERS) PANEL */}
          {activePanel === 'capas' && (
            <>
              <Separator />
              {/* Section plane */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300">
                    <Scissors className="h-3.5 w-3.5 text-red-500" /> Plano de sección
                  </p>
                  <button
                    onClick={toggleSection}
                    className={cn(
                      'relative h-5 w-9 rounded-full transition-colors',
                      settings.section.enabled ? 'bg-red-500' : 'bg-stone-300',
                    )}
                    aria-label="Activar sección"
                  >
                    <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', settings.section.enabled ? 'left-4' : 'left-0.5')} />
                  </button>
                </div>
                {settings.section.enabled && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['x', 'y', 'z'] as const).map((ax) => (
                        <button
                          key={ax}
                          onClick={() => setSectionAxis(ax)}
                          className={cn(
                            'rounded-lg border-2 py-1.5 text-xs font-bold uppercase transition-all',
                            settings.section.axis === ax
                              ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10'
                              : 'border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700',
                          )}
                        >
                          Eje {ax}
                        </button>
                      ))}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[10px] text-stone-500">
                        <span>Posición del corte</span>
                        <span className="font-bold text-stone-700 dark:text-stone-200">{settings.section.value.toFixed(1)} m</span>
                      </div>
                      <input
                        type="range"
                        min={-Math.max(data.dimensions.width, data.dimensions.depth) / 2}
                        max={Math.max(data.dimensions.width, data.dimensions.depth) / 2}
                        step={0.1}
                        value={settings.section.value}
                        onChange={(e) => setSectionValue(Number(e.target.value))}
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-stone-200 accent-red-500 dark:bg-stone-700"
                      />
                      <p className="mt-1 text-[10px] text-stone-500 dark:text-stone-400">
                        {settings.section.axis === 'y'
                          ? 'Corte horizontal: recorta todo lo que está por encima de la altura.'
                          : `Corte vertical en el eje ${settings.section.axis}: recorta todo lo que está por delante.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Layer visibility */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300">
                  <Layers className="h-3.5 w-3.5 text-amber-500" /> Visibilidad de capas
                </p>
                <div className="space-y-1.5">
                  {[
                    { key: 'walls' as const, icon: Box, label: 'Muros' },
                    { key: 'doors' as const, icon: DoorOpen, label: 'Puertas' },
                    { key: 'windows' as const, icon: AppWindow, label: 'Ventanas' },
                    { key: 'furniture' as const, icon: Sofa, label: 'Mobiliario' },
                    { key: 'labels' as const, icon: Tags, label: 'Etiquetas' },
                    { key: 'ceiling' as const, icon: PanelTop, label: 'Techo' },
                  ].map((layer) => (
                    <button
                      key={layer.key}
                      onClick={() => toggleLayer(layer.key)}
                      className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-300 dark:border-stone-700 dark:bg-stone-900"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', settings.layers[layer.key] ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-stone-100 text-stone-400 dark:bg-stone-800')}>
                          <layer.icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium text-stone-700 dark:text-stone-200">{layer.label}</span>
                      </div>
                      <span className={cn('relative h-5 w-9 rounded-full transition-colors', settings.layers[layer.key] ? 'bg-amber-500' : 'bg-stone-300')}>
                        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', settings.layers[layer.key] ? 'left-4' : 'left-0.5')} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera bookmarks */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-300">
                    <Bookmark className="h-3.5 w-3.5 text-amber-500" /> Vistas guardadas
                  </p>
                  <button
                    onClick={handleAddBookmark}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-400"
                  >
                    <Plus className="h-3 w-3" /> Guardar
                  </button>
                </div>
                {bookmarks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-center text-xs text-stone-400 dark:border-stone-700 dark:bg-stone-900">
                    Aún no hay vistas guardadas. Ajusta la cámara y pulsa "Guardar".
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="group flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 transition-colors hover:border-amber-300 dark:border-stone-700 dark:bg-stone-900"
                      >
                        <button
                          onClick={() => restoreBookmark(bm)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <Bookmark className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-stone-700 dark:text-stone-200">{bm.label}</p>
                            <p className="truncate text-[10px] text-stone-400">
                              pos: ({bm.position[0].toFixed(1)}, {bm.position[1].toFixed(1)}, {bm.position[2].toFixed(1)})
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => removeBookmark(bm.id)}
                          className="ml-2 rounded p-1 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />
          {/* Tips */}
          <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
            <p className="font-semibold">Consejos</p>
            <ul className="mt-1 space-y-1 text-stone-500">
              <li>· Arrastra para orbitar, scroll para acercar.</li>
              <li>· Clic en una habitación para volar hasta ella.</li>
              <li>· Activa <Footprints className="inline h-3 w-3" /> recorrido para pasear dentro.</li>
              <li>· Exporta a <strong>GLB</strong> para usar en Blender o Unity.</li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  title,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2 transition-all',
        active ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100',
      )}
    >
      {children}
      {label && <span className="text-xs font-semibold">{label}</span>}
    </button>
  );
}

function LightBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md transition-all',
        active ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100',
      )}
    >
      {children}
    </button>
  );
}

function PanelTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all',
        active ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function ToggleRow({ icon: Icon, label, desc, active, onClick }: { icon: any; label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-300"
    >
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', active ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-500')}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-stone-700">{label}</p>
          <p className="text-[10px] text-stone-400">{desc}</p>
        </div>
      </div>
      <span className={cn('relative h-5 w-9 rounded-full transition-colors', active ? 'bg-amber-500' : 'bg-stone-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', active ? 'left-4' : 'left-0.5')} />
      </span>
    </button>
  );
}

function LightCard({ active, onClick, icon: Icon, label, color }: { active: boolean; onClick: () => void; icon: any; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all',
        active ? 'border-amber-500 ring-2 ring-amber-200' : 'border-stone-200 hover:border-stone-300',
      )}
    >
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-semibold text-stone-700">{label}</span>
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-stone-200" />;
}

export default ViewerExperience;
