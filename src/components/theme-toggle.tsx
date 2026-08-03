'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves to 'light' or 'dark' on the client; on the server it is undefined,
  // but since the toggle is interactive only, we render a stable placeholder icon
  // until the client hydrates, avoiding mismatches.
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      suppressHydrationWarning
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition-all hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export default ThemeToggle;
