'use client';

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onImage: (dataUrl: string, fileName: string) => void;
  onDemo: () => void;
  busy?: boolean;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

export function UploadZone({ onImage, onDemo, busy }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!ACCEPTED.includes(file.type)) {
        setError('Formato no soportado. Usa PNG, JPG, WebP, GIF o BMP.');
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError('La imagen es demasiado grande (máx 8 MB).');
        return;
      }
      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') onImage(result, file.name);
      };
      reader.readAsDataURL(file);
    },
    [onImage],
  );

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-white p-8 text-center transition-all sm:p-12 dark:bg-stone-900',
          dragging
            ? 'border-amber-500 bg-amber-50/60 scale-[1.01] dark:bg-amber-500/10'
            : 'border-stone-300 hover:border-amber-400 hover:bg-amber-50/30 dark:border-stone-700 dark:hover:border-amber-500 dark:hover:bg-amber-500/5',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30 transition-transform group-hover:scale-110">
          {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
        </div>
        <div>
          <p className="text-lg font-semibold text-stone-800 dark:text-white">
            {busy ? 'Analizando plano…' : 'Arrastra tu plano aquí'}
          </p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            o <span className="font-medium text-amber-600 underline-offset-2 group-hover:underline dark:text-amber-400">haz clic para seleccionar</span> · PNG, JPG, WebP · máx 8 MB
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? undefined)}
        />
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          onClick={onDemo}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition-all hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-amber-500 dark:hover:bg-amber-500/10"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          Probar con plano de ejemplo
        </button>
        <div className="flex items-center gap-1.5 text-xs text-stone-400 dark:text-stone-500">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>Sugerencia: un plano con líneas claras funciona mejor</span>
        </div>
      </div>
    </div>
  );
}

export default UploadZone;
