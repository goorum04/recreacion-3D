'use client';

import { useCallback, useState } from 'react';
import {
  Boxes,
  Glasses,
  ScanLine,
  UploadCloud,
  Brain,
  Cuboid,
  ArrowRight,
  Compass,
  Ruler,
  Layers3,
  Sparkles,
  Github,
  Building2,
  Footprints,
  Sun,
  Palette,
  Download,
} from 'lucide-react';
import { UploadZone } from '@/components/archiview/UploadZone';
import { ProcessingOverlay } from '@/components/archiview/ProcessingOverlay';
import { ViewerExperience } from '@/components/archiview/ViewerExperience';
import { ProjectHistory } from '@/components/archiview/ProjectHistory';
import { ThemeToggle } from '@/components/theme-toggle';
import { DEMO_PLAN } from '@/lib/demo-plan';
import type { FloorPlanData, AnalyzePlanResponse } from '@/lib/floor-plan-types';
import { useToast } from '@/hooks/use-toast';

type View = 'landing' | 'processing' | 'viewer';

interface LoadedProject {
  id?: string;
  name: string;
  image: string;
  data: FloorPlanData;
}

export default function Home() {
  const [view, setView] = useState<View>('landing');
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const [historyKey, setHistoryKey] = useState(0);
  const { toast } = useToast();

  const analyze = useCallback(
    async (image: string, name: string) => {
      setView('processing');
      setFileName(name);
      try {
        const res = await fetch('/api/analyze-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        });
        const json: AnalyzePlanResponse = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || 'No se pudo analizar el plano.');
        }
        setProject({ name, image, data: json.data });
        setView('viewer');
      } catch (err: any) {
        toast({
          title: 'Error al analizar',
          description: err?.message || 'Algo salió mal.',
          variant: 'destructive',
        });
        setView('landing');
      }
    },
    [toast],
  );

  const handleDemo = useCallback(() => {
    setProject({
      name: 'Apartamento demo',
      image: '',
      data: DEMO_PLAN,
    });
    setView('viewer');
  }, []);

  const handleLoadProject = useCallback((p: { id: string; name: string; image: string; analysis: FloorPlanData }) => {
    setProject({ id: p.id, name: p.name, image: p.image, data: p.analysis });
    setView('viewer');
    // scroll to top so the viewer is visible
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSave = useCallback(
    async (name: string): Promise<boolean> => {
      if (!project) return false;
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            image: project.image,
            analysis: project.data,
            description: project.data.summary,
          }),
        });
        const json = await res.json();
        if (json.success) {
          setHistoryKey((k) => k + 1);
          toast({ title: 'Proyecto guardado', description: name });
          return true;
        }
        throw new Error(json.error || 'Error guardando');
      } catch (err: any) {
        toast({
          title: 'No se pudo guardar',
          description: err?.message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [project, toast],
  );

  const handleBack = useCallback(() => {
    setView('landing');
    setProject(null);
    setFileName(undefined);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-stone-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/85 shadow-sm backdrop-blur-md dark:border-stone-800/70 dark:bg-stone-950/85">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <button onClick={handleBack} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm shadow-amber-500/30">
              <Cuboid className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <span className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">ArchiVR</span>
              <span className="ml-1.5 hidden text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500 sm:inline">
                Planos → 3D → VR
              </span>
            </div>
          </button>

          <nav className="flex items-center gap-1.5 text-sm">
            {view === 'landing' && (
              <>
                <a href="#como-funciona" className="hidden rounded-md px-3 py-1.5 font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white sm:inline-block">
                  Cómo funciona
                </a>
                <a href="#proyectos" className="hidden rounded-md px-3 py-1.5 font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white sm:inline-block">
                  Proyectos
                </a>
                <a
                  href="#subir"
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-stone-700 hover:shadow-md dark:bg-amber-500 dark:text-stone-900 dark:hover:bg-amber-400"
                >
                  <UploadCloud className="h-3.5 w-3.5" /> Subir plano
                </a>
                <ThemeToggle className="ml-0.5" />
              </>
            )}
            {view === 'viewer' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 dark:text-stone-500">Modo visor</span>
                <ThemeToggle />
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {view === 'landing' && (
          <Landing onAnalyze={analyze} onDemo={handleDemo} onLoadProject={handleLoadProject} historyKey={historyKey} />
        )}
        {view === 'processing' && <ProcessingOverlay fileName={fileName} />}
        {view === 'viewer' && project && (
          <ViewerExperience
            data={project.data}
            originalImage={project.image || null}
            onBack={handleBack}
            onSave={handleSave}
          />
        )}
      </main>

      {view !== 'viewer' && (
        <footer className="mt-auto border-t border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-stone-500 dark:text-stone-400 sm:flex-row">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-500" />
              <span>ArchiVR · Convierte planos en espacios inmersivos</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-xs">
                <Brain className="h-3.5 w-3.5" /> IA visual
              </span>
              <span className="flex items-center gap-1 text-xs">
                <Glasses className="h-3.5 w-3.5" /> WebXR
              </span>
              <span className="flex items-center gap-1 text-xs">
                <Github className="h-3.5 w-3.5" /> {new Date().getFullYear()}
              </span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing sections                                                    */
/* ------------------------------------------------------------------ */

function Landing({
  onAnalyze,
  onDemo,
  onLoadProject,
  historyKey,
}: {
  onAnalyze: (image: string, name: string) => void;
  onDemo: () => void;
  onLoadProject: (p: any) => void;
  historyKey: number;
}) {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden dark:bg-stone-950">
        {/* decorative background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10" />
          <div className="absolute -right-24 top-32 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-500/10" />
          <div
            className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
              <Sparkles className="h-3.5 w-3.5" />
              IA visual para arquitectos
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-stone-900 dark:text-white sm:text-5xl lg:text-6xl">
              Convierte tus <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">planos 2D</span> en espacios 3D inmersivos
            </h1>
            <p className="max-w-xl text-lg text-stone-600 dark:text-stone-300">
              Sube un plano de planta y nuestra IA lo reconstruye automáticamente como un modelo 3D
              recorrible. Explóralo, modifícalo y entra en <strong className="text-stone-800 dark:text-white">realidad virtual</strong> en segundos.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#subir"
                className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-stone-700 hover:shadow-xl hover:shadow-stone-900/20 dark:bg-amber-500 dark:text-stone-900 dark:hover:bg-amber-400"
              >
                <UploadCloud className="h-4 w-4" /> Subir mi plano
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <button
                onClick={onDemo}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition-all hover:border-amber-400 hover:bg-amber-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-amber-500 dark:hover:bg-amber-500/10"
              >
                <Boxes className="h-4 w-4 text-amber-500" /> Ver demo en 3D
              </button>
            </div>

            <div className="flex items-center gap-6 pt-2 text-sm text-stone-500 dark:text-stone-400">
              <div className="flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-amber-500" /> Análisis con VLM
              </div>
              <div className="flex items-center gap-1.5">
                <Glasses className="h-4 w-4 text-amber-500" /> Compatible WebXR
              </div>
            </div>
          </div>

          {/* Real render from the 3D viewer — not a mockup */}
          <div className="relative">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-stone-300/50 dark:border-stone-700 dark:bg-stone-900 dark:shadow-black/50">
              <img
                src="/hero-render.jpg"
                alt="Modelo 3D reconstruido a partir de un plano de planta, mostrado en el visor de ArchiVR"
                className="absolute inset-0 h-full w-full object-cover"
                width={1000}
                height={750}
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
              {/* VR badge */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold text-white dark:bg-amber-500 dark:text-stone-900">
                <Glasses className="h-3 w-3" /> VR Ready
              </div>
              {/* floating chips */}
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 shadow-md backdrop-blur dark:border-stone-700 dark:bg-stone-800/95 dark:text-stone-200">
                <Ruler className="h-3.5 w-3.5 text-amber-500" /> 99 m²
              </div>
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 shadow-md backdrop-blur dark:border-stone-700 dark:bg-stone-800/95 dark:text-stone-200">
                <Layers3 className="h-3.5 w-3.5 text-emerald-500" /> 6 hab.
              </div>
              {/* scan line */}
              <div className="absolute inset-x-0 top-0 h-0.5 animate-[scan_3s_ease-in-out_infinite] bg-amber-400 shadow-[0_0_12px_2px_rgba(245,158,11,0.6)]" />
            </div>
            <style>{`@keyframes scan { 0%,100%{transform:translateY(0)} 50%{transform:translateY(280px)} }`}</style>
          </div>
        </div>
      </section>

      {/* Upload section */}
      <section id="subir" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-10">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-stone-800 dark:text-white">Sube tu plano de planta</h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            La IA detectará muros, habitaciones, puertas, ventanas y mobiliario.
          </p>
        </div>
        <UploadZone onImage={onAnalyze} onDemo={onDemo} />
      </section>

      {/* How it works */}
      <section id="como-funciona" className="scroll-mt-20 bg-stone-50 py-16 dark:bg-stone-900/50">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-stone-800 dark:text-white">Tres pasos, del papel al inmersivo</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Sin modelado manual. Sin software complejo.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <StepCard
              n={1}
              icon={ScanLine}
              title="Sube el plano"
              desc="Arrastra una imagen (PNG/JPG) del plano de planta. Líneas claras sobre fondo blanco funcionan mejor."
            />
            <StepCard
              n={2}
              icon={Brain}
              title="La IA lo analiza"
              desc="Un modelo de visión identifica la estructura: muros, habitaciones, puertas, ventanas y mobiliario, con sus medidas reales."
            />
            <StepCard
              n={3}
              icon={Glasses}
              title="Explora en 3D y VR"
              desc="Orbita el modelo, recorrelo en primera persona o entra en realidad virtual con cualquier visor WebXR."
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-stone-800 dark:text-white">Todo lo que un arquitecto necesita</h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">De un dibujo 2D a una maqueta digital recorrible.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={Cuboid}
            title="Reconstrucción automática"
            desc="Muros, puertas y ventanas se generan en 3D con alturas y grosores realistas a partir de la imagen."
          />
          <FeatureCard
            icon={Layers3}
            title="Habitaciones con áreas"
            desc="Cada estancia se etiqueta con su nombre y superficie estimada, con colores de suelo diferenciados."
          />
          <FeatureCard
            icon={Compass}
            title="Mobiliario detectado"
            desc="Sofás, camas, mesas, electrodomésticos y sanitarios se colocan donde el plano los indica."
          />
          <FeatureCard
            icon={Glasses}
            title="Modo realidad virtual"
            desc="Pulsa VR para entrar con gafas WebXR y pasear por el interior como si estuvieras allí."
          />
          <FeatureCard
            icon={Footprints}
            title="Recorrido en 1ª persona"
            desc="Cambia a modo paseo para moverte por dentro del modelo en tu navegador, sin gafas."
          />
          <FeatureCard
            icon={Sun}
            title="Iluminación día · tarde · noche"
            desc="Cambia la hora del día con un clic para presentar tu proyecto en distintas atmósferas."
          />
          <FeatureCard
            icon={Palette}
            title="Materiales personalizables"
            desc="Elige color de paredes y suelo entre paletas de madera, mármol, cemento y más, en tiempo real."
          />
          <FeatureCard
            icon={Download}
            title="Exportar a GLB"
            desc="Descarga el modelo 3D reconstruido como archivo .glb para abrirlo en Blender, Unity o Unreal."
          />
          <FeatureCard
            icon={Ruler}
            title="Proyectos guardados"
            desc="Guarda tus planos reconstruidos y vuelve a ellos cuando quieras para seguir trabajando."
          />
        </div>
      </section>

      {/* Project history */}
      <ProjectHistory onLoad={onLoadProject} refreshKey={historyKey} />

      {/* CTA */}
      <section className="mx-auto w-full max-w-4xl px-4 py-16">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 p-8 text-center text-white shadow-xl dark:from-stone-800 dark:to-stone-950 dark:ring-1 dark:ring-amber-500/20 sm:p-12">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, #f59e0b 0, transparent 50%), radial-gradient(circle at 80% 80%, #10b981 0, transparent 50%)' }} />
          <div className="relative">
            <Glasses className="mx-auto mb-3 h-10 w-10 text-amber-400" />
            <h2 className="text-2xl font-bold sm:text-3xl">¿Listo para caminar dentro de tu plano?</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-stone-300">
              Sube una imagen de tu plano de planta y obtén un modelo 3D inmersivo en menos de un minuto.
            </p>
            <a
              href="#subir"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-amber-400 hover:shadow-amber-500/30"
            >
              <UploadCloud className="h-4 w-4" /> Empezar ahora
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function StepCard({ n, icon: Icon, title, desc }: { n: number; icon: any; title: string; desc: string }) {
  return (
    <div className="relative rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-stone-700 dark:bg-stone-900">
      <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-xs font-bold text-white shadow-md shadow-amber-500/30">
        {n}
      </span>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-stone-800 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{desc}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-amber-500/50">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-700 transition-colors group-hover:bg-amber-100 group-hover:text-amber-600 dark:bg-stone-800 dark:text-stone-300 dark:group-hover:bg-amber-500/10 dark:group-hover:text-amber-400">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-semibold text-stone-800 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{desc}</p>
    </div>
  );
}


