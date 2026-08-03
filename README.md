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
bun run db:push    # crea la base de datos SQLite
bun run dev
```

Abre http://localhost:3000

## Aviso importante: análisis de planos con IA

El endpoint `src/app/api/analyze-plan/route.ts` usa actualmente el paquete
`z-ai-web-dev-sdk`, que solo funciona dentro del entorno sandbox de z.ai en el
que se construyó este proyecto originalmente. **Fuera de ese entorno (por
ejemplo al desplegar en Vercel u otro hosting), la llamada al VLM fallará**
porque ese SDK no tiene una API pública ni acepta una clave propia.

Para que la función de "analizar plano con IA" funcione en tu propio
despliegue, hay que sustituir esa llamada por un proveedor de visión real
(por ejemplo la API de Claude/Anthropic, OpenAI, o Google Gemini), usando tu
propia API key. El resto de la aplicación (visor 3D, VR, mediciones,
materiales, exportación GLB, historial de proyectos) no depende de ese SDK y
funciona de forma independiente.

## Estructura

- `src/app/api/analyze-plan` — análisis del plano con IA (VLM)
- `src/app/api/projects` — CRUD de proyectos guardados
- `src/components/archi3d` — modelo 3D, escena, medición, sección
- `src/components/archiview` — UI de subida, procesamiento, historial y visor
- `prisma/schema.prisma` — esquema de la base de datos

Ver `worklog.md` para el historial detallado de desarrollo.
