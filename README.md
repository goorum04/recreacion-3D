# ArchiVR

Software para arquitectos: sube un plano 2D, una IA (VLM) lo analiza y lo reconstruye como un modelo 3D interactivo, navegable en modo escritorio o en VR (WebXR).

## Funcionalidades

- **Subida de plano** (drag & drop) y análisis automático con IA para extraer muros, habitaciones, puertas, ventanas y mobiliario.
- **Visor 3D** (React Three Fiber) con vista perspectiva, planta y recorrido en primera persona.
- **Modo VR** (WebXR) para recorridos inmersivos.
- **Iluminación día / atardecer / noche** y estudio solar (posición del sol por hora).
- **Materiales personalizables**: colores de muros y suelos, modo wireframe.
- **Herramienta de medición** interactiva (clic en dos puntos → distancia en metros).
- **Plano de sección/corte** para ver alturas interiores.
- **Marcadores de cámara**, captura de pantalla (PNG) y exportación del modelo a GLB.
- **Brújula de orientación** y atajos de teclado.
- **Historial de proyectos** (guardar/cargar) persistido en base de datos.

## Stack

- Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui
- three.js + @react-three/fiber + @react-three/drei + @react-three/xr
- Prisma + SQLite

## Puesta en marcha

```bash
bun install        # o: npm install
cp .env.example .env
# añade tu GEMINI_API_KEY en .env (gratis en https://aistudio.google.com/apikey)
bun run db:push    # crea la base de datos SQLite
bun run dev
```

Abre http://localhost:3000

## Análisis de planos con IA (Gemini)

El endpoint `src/app/api/analyze-plan/route.ts` usa la API de **Google Gemini**
(modelo `gemini-2.5-flash` por defecto, configurable con `GEMINI_MODEL`) para
analizar la imagen del plano por visión. Gemini tiene un nivel gratuito con
límite de peticiones, suficiente para probar y usar la app a pequeña escala:

1. Crea una clave gratuita en https://aistudio.google.com/apikey
2. Añádela como `GEMINI_API_KEY` en tu `.env`

Si la clave no está configurada, el endpoint devuelve un error explicando cómo
obtenerla; el resto de la aplicación (visor 3D, VR, mediciones, materiales,
exportación GLB, historial de proyectos) funciona de forma independiente.

## Estructura

- `src/app/api/analyze-plan` — análisis del plano con IA (VLM)
- `src/app/api/projects` — CRUD de proyectos guardados
- `src/components/archi3d` — modelo 3D, escena, medición, sección
- `src/components/archiview` — UI de subida, procesamiento, historial y visor
- `prisma/schema.prisma` — esquema de la base de datos

Ver `worklog.md` para el historial detallado de desarrollo.
