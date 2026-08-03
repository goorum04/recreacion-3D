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

## Desplegar en Railway

El repo incluye `railway.json` (build con Nixpacks, autodetecta Bun a partir
de `bun.lock`). Pasos:

1. En [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → selecciona `goorum04/recreacion-3D` (rama `main`).
2. En **Variables** del servicio, añade:
   - `GEMINI_API_KEY` — tu clave gratuita de https://aistudio.google.com/apikey
   - `DATABASE_URL` — `file:/data/custom.db` (ver volumen abajo)
3. **Persistencia de la base de datos (importante)**: el filesystem de Railway
   es efímero entre despliegues. Para que el historial de proyectos
   sobreviva a un redeploy, añade un **Volume** al servicio montado en `/data`
   (Settings → Volumes → Add Volume, mount path `/data`) y usa esa ruta en
   `DATABASE_URL` como en el paso anterior.
4. Railway detecta el puerto automáticamente vía la variable `PORT` (el
   servidor standalone de Next.js ya la respeta).
5. El comando de arranque (`prisma db push --accept-data-loss && bun run
   start`) crea/actualiza el esquema SQLite en el volumen antes de levantar
   el servidor, así que no hace falta ejecutarlo a mano.

Sin el volumen, la app funciona igual pero cada redeploy borra los proyectos
guardados (se recrea la base de datos vacía).

## Desplegar en Render

El repo incluye `render.yaml` (Blueprint). En Render, el runtime es **Node**
(no Bun) para evitar complicaciones con imágenes Docker propias; el build
(`next build`) y el arranque (`server.js` standalone) funcionan igual con
Node.

1. En [render.com](https://render.com) → **New → Blueprint** → conecta
   `goorum04/recreacion-3D` (rama `main`). Render detecta `render.yaml`
   automáticamente.
2. Define la variable `GEMINI_API_KEY` (marcada `sync: false` en el
   blueprint, así que Render te la pedirá) con tu clave gratuita de
   https://aistudio.google.com/apikey.
3. **Persistencia de la base de datos**: el blueprint ya define un **Disk**
   de 1GB montado en `/var/data`, con `DATABASE_URL=file:/var/data/custom.db`
   apuntando ahí. Los Disks de Render requieren un plan de pago (`starter` en
   adelante); en el plan gratuito no hay disco persistente y los datos se
   pierden en cada redeploy/reinicio — en ese caso cambia `plan: starter` a
   `plan: free` en `render.yaml` y quita el bloque `disk` (o acepta que el
   historial de proyectos no persista).
4. El `startCommand` corre `prisma db push` antes de levantar el servidor,
   así que el esquema SQLite se crea/actualiza solo en el disco montado.

Si prefieres configurarlo a mano sin Blueprint: **Build Command**
`npm install && npm run build`, **Start Command** `npx prisma db push
--accept-data-loss && node .next/standalone/server.js`.

**Importante**: añade también la variable de entorno `HOSTNAME=0.0.0.0`. Sin
ella, el servidor standalone de Next.js hereda el `HOSTNAME` interno que
Render asigna al contenedor y escucha solo en esa interfaz, quedando
inalcanzable desde fuera (el servicio arranca y se ve "live" en los logs,
pero la URL pública responde 502).

## Estructura

- `src/app/api/analyze-plan` — análisis del plano con IA (VLM)
- `src/app/api/projects` — CRUD de proyectos guardados
- `src/components/archi3d` — modelo 3D, escena, medición, sección
- `src/components/archiview` — UI de subida, procesamiento, historial y visor
- `prisma/schema.prisma` — esquema de la base de datos

Ver `worklog.md` para el historial detallado de desarrollo.
