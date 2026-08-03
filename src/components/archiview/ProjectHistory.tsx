'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  History,
  Trash2,
  RefreshCw,
  Maximize2,
  DoorOpen,
  Layers,
  Calendar,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FloorPlanData } from '@/lib/floor-plan-types';

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  area: number;
  roomCount: number;
  buildingType: string | null;
  createdAt: string;
}

interface FullProject {
  id: string;
  name: string;
  description: string | null;
  image: string;
  analysis: FloorPlanData;
}

interface ProjectHistoryProps {
  onLoad: (project: FullProject) => void;
  refreshKey: number;
}

export function ProjectHistory({ onLoad, refreshKey }: ProjectHistoryProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const json = await res.json();
      if (json.success) setProjects(json.projects);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, refreshKey]);

  const handleLoad = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/projects/${id}`);
      const json = await res.json();
      if (json.success && json.project?.analysis) {
        onLoad({
          id: json.project.id,
          name: json.project.name,
          description: json.project.description,
          image: json.project.image,
          analysis: json.project.analysis,
        });
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      /* ignore */
    }
  };

  return (
    <section id="proyectos" className="mx-auto w-full max-w-6xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-800 text-white dark:bg-amber-500 dark:text-stone-900">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-800 dark:text-white">Tus proyectos</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Planos guardados y reconstruidos</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchProjects} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center dark:border-stone-700 dark:bg-stone-900">
          <FolderOpen className="h-10 w-10 text-stone-300 dark:text-stone-600" />
          <div>
            <p className="font-medium text-stone-600 dark:text-stone-300">Aún no hay proyectos guardados</p>
            <p className="text-sm text-stone-400 dark:text-stone-500">Sube un plano y guárdalo para verlo aquí.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => handleLoad(p.id)}
              disabled={loadingId === p.id}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-amber-500/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-stone-800 dark:text-white">{p.name}</h3>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">{p.description}</p>
                  )}
                </div>
                {p.buildingType && (
                  <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700 capitalize dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                    {p.buildingType}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-stone-50 py-2 dark:bg-stone-800">
                  <Maximize2 className="mx-auto mb-0.5 h-3.5 w-3.5 text-stone-400" />
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-200">{p.area.toFixed(0)} m²</p>
                </div>
                <div className="rounded-lg bg-stone-50 py-2 dark:bg-stone-800">
                  <Layers className="mx-auto mb-0.5 h-3.5 w-3.5 text-stone-400" />
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-200">{p.roomCount}</p>
                </div>
                <div className="rounded-lg bg-stone-50 py-2 dark:bg-stone-800">
                  <Calendar className="mx-auto mb-0.5 h-3.5 w-3.5 text-stone-400" />
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                    {new Date(p.createdAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-stone-100 pt-2 dark:border-stone-800">
                <span className="flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500">
                  <Calendar className="h-3 w-3" />
                  {new Date(p.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleDelete(p.id, e)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(p.id, e as any); }}
                  className="rounded p-1 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20"
                >
                  {loadingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default ProjectHistory;
