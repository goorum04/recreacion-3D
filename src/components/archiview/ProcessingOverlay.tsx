'use client';

import { Loader2, ScanLine, Boxes, Glasses } from 'lucide-react';

const STEPS = [
  { icon: ScanLine, label: 'Leyendo imagen', desc: 'Detectando muros y símbolos' },
  { icon: Boxes, label: 'Reconstruyendo geometría', desc: 'Generando paredes y espacios' },
  { icon: Glasses, label: 'Preparando VR', desc: 'Configurando inmersión' },
];

export function ProcessingOverlay({ fileName }: { fileName?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-8 py-12">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/30" />
        <span className="absolute inline-flex h-20 w-20 animate-pulse rounded-full bg-amber-500/20" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl shadow-amber-500/40">
          <Loader2 className="h-9 w-9 animate-spin" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-xl font-bold text-stone-800">Analizando tu plano…</h3>
        <p className="mt-1 text-sm text-stone-500">
          {fileName ? `Procesando ${fileName}` : 'La IA está interpretando la distribución'}
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <s.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-700">{s.label}</p>
              <p className="truncate text-xs text-stone-400">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProcessingOverlay;
