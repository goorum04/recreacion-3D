import { NextRequest, NextResponse } from 'next/server';
import type {
  FloorPlanData,
  WallSegment,
  Room,
  DoorOpening,
  WindowOpening,
  FurnitureItem,
  AnalyzePlanResponse,
} from '@/lib/floor-plan-types';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Prompt that instructs the VLM to analyze a floor plan image and return
 * a strict JSON structure describing the building.
 *
 * Coordinate system: NORMALIZED 0..100 along both axes of the image.
 * (0,0) = top-left of the image, (100,100) = bottom-right.
 * We later convert to meters using the detected/assumed real-world size.
 */
const ANALYSIS_PROMPT = `You are an expert architect analyzing a 2D floor plan image.
Analyze the floor plan carefully and extract its structural layout.

Return ONLY a single JSON object (no markdown, no code fences, no commentary) with this exact schema:

{
  "buildingType": "apartment" | "house" | "office" | "studio" | "loft" | "commercial",
  "summary": "one short sentence describing the dwelling",
  "estimatedWidthMeters": number,
  "estimatedDepthMeters": number,
  "ceilingHeightMeters": number,
  "rooms": [
    { "name": "room name", "cx": number, "cz": number, "area": number, "color": "#rrggbb" }
  ],
  "walls": [
    { "x1": number, "z1": number, "x2": number, "z2": number }
  ],
  "doors": [
    { "x": number, "z": number, "width": number, "rotation": number }
  ],
  "windows": [
    { "x": number, "z": number, "width": number, "sillHeight": number, "height": number, "rotation": number }
  ],
  "furniture": [
    { "type": "sofa"|"table"|"bed"|"chair"|"counter"|"toilet"|"sink"|"fridge"|"tree", "x": number, "z": number, "rotation": number }
  ]
}

COORDINATE SYSTEM (critical):
- Use a NORMALIZED grid from 0 to 100 on BOTH axes.
- (0,0) is the TOP-LEFT corner of the floor plan image.
- (100,100) is the BOTTOM-RIGHT corner.
- X increases to the right, Z increases downward (we will map Z to depth in 3D).
- All wall endpoints, room centers, doors, windows and furniture positions must use this 0..100 grid.

WALLS:
- Each wall is a straight line segment from (x1,z1) to (x2,z2).
- Trace the OUTER perimeter and INNER partition walls.
- Walls should connect end-to-end to form closed rooms where possible.
- Walls MUST be axis-aligned: every segment is either perfectly horizontal
  (z1 == z2) or perfectly vertical (x1 == x2). Do not output diagonal walls
  unless the plan clearly shows one.
- Wall endpoints that meet at a corner MUST use the exact same (x,z) pair
  in every wall that touches that corner, so corners close cleanly with no
  gaps or overlaps.

ROOMS:
- List every enclosed room with a descriptive name (e.g. "Living Room", "Kitchen", "Bedroom", "Bathroom", "Hallway", "Dining").
- cx,cz is the approximate center of the room on the 0..100 grid.
- area is in square meters (estimate using the real-world dimensions).
- color is a soft pastel floor color hint (#rrggbb).

DOORS:
- Place a door opening at the wall gap where a door appears.
- rotation is in DEGREES: 0 means the door spans along the X axis, 90 means along the Z axis. Use the wall orientation.
- width is the door width in meters (typical 0.8-0.9).

WINDOWS:
- Place windows on exterior walls where window symbols appear.
- sillHeight is the height of the window sill from the floor (typical 0.9).
- height is the window height (typical 1.2).
- rotation in degrees like doors.

FURNITURE:
- Detect furniture symbols (bed, sofa, table, chairs, toilet, sink, fridge, kitchen counter, plants) and place them.
- rotation in degrees.

REAL-WORLD SIZE:
- estimatedWidthMeters and estimatedDepthMeters: your best estimate of the real building footprint.
- ceilingHeightMeters: typical 2.5-3.0.

Output ONLY the JSON. Do not include any text before or after.`;

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Calls Google's Gemini API (free tier available at https://aistudio.google.com/apikey)
 * with the floor plan image and returns the raw text response.
 */
async function callGeminiVision(imageDataUrl: string, apiKey: string): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato de imagen no soportado (se requiere data:image/...;base64,...).');
  }
  const [, mimeType, base64Data] = match;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: ANALYSIS_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 500)}`);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini no devolvió contenido de texto.');
  }
  return text;
}

/** Strip markdown code fences and leading/trailing prose from a model response. */
function extractJson(raw: string): string {
  let text = raw.trim();
  // Remove ```json ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  // Find the first { and the last }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  return text.trim();
}

/** Convert a 0..100 normalized coordinate to meters. */
function toMeters(v: number, totalMeters: number): number {
  return (v / 100) * totalMeters;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * VLM-detected walls are rarely perfectly axis-aligned or perfectly closed
 * at corners, which makes the 3D model look skewed with gaps at joints.
 * This snaps every wall to horizontal/vertical, then clusters nearby
 * endpoints (within SNAP_TOL) so shared corners land on the exact same
 * point across every wall that touches them.
 */
const SNAP_TOL = 0.3; // meters

function orthogonalizeWalls(walls: WallSegment[]): WallSegment[] {
  // 1. Force each wall to be perfectly horizontal or vertical, keeping
  //    whichever axis has the larger extent.
  const ortho = walls.map((w) => {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    if (Math.abs(dx) >= Math.abs(dz)) {
      const z = (w.z1 + w.z2) / 2;
      return { ...w, z1: z, z2: z };
    }
    const x = (w.x1 + w.x2) / 2;
    return { ...w, x1: x, x2: x };
  });

  // 2. Cluster nearby endpoints so shared corners coincide exactly.
  const clusters: { x: number; z: number; n: number }[] = [];
  const snap = (x: number, z: number) => {
    for (const c of clusters) {
      if (Math.abs(c.x - x) < SNAP_TOL && Math.abs(c.z - z) < SNAP_TOL) {
        c.x = (c.x * c.n + x) / (c.n + 1);
        c.z = (c.z * c.n + z) / (c.n + 1);
        c.n += 1;
        return c;
      }
    }
    const created = { x, z, n: 1 };
    clusters.push(created);
    return created;
  };

  return ortho
    .map((w) => {
      const p1 = snap(w.x1, w.z1);
      const p2 = snap(w.x2, w.z2);
      return { ...w, x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z };
    })
    .filter((w) => Math.abs(w.x2 - w.x1) + Math.abs(w.z2 - w.z1) > 0.05);
}

/**
 * Projects a door/window position onto the nearest wall segment and
 * returns the point on that wall plus the wall's rotation, so openings
 * always sit flush in a wall instead of floating at an unrelated angle.
 */
function snapToNearestWall(
  walls: WallSegment[],
  x: number,
  z: number,
): { x: number; z: number; rotation: number } {
  let best: { x: number; z: number; rotation: number; dist: number } | null = null;
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) continue;
    let t = ((x - w.x1) * dx + (z - w.z1) * dz) / lenSq;
    t = clamp(t, 0.08, 0.92); // keep openings away from corners
    const px = w.x1 + t * dx;
    const pz = w.z1 + t * dz;
    const dist = Math.hypot(px - x, pz - z);
    if (!best || dist < best.dist) {
      best = { x: px, z: pz, rotation: Math.atan2(dx, dz), dist };
    }
  }
  return best ? { x: best.x, z: best.z, rotation: best.rotation } : { x, z, rotation: 0 };
}

/** Validate & sanitize the raw parsed object into a proper FloorPlanData. */
function normalizePlan(raw: any): FloorPlanData {
  const planWidth = clamp(Number(raw?.estimatedWidthMeters) || 12, 4, 60);
  const planDepth = clamp(Number(raw?.estimatedDepthMeters) || 10, 4, 60);
  const ceilingHeight = clamp(Number(raw?.ceilingHeightMeters) || 2.7, 2.2, 4);

  const rawWalls: WallSegment[] = Array.isArray(raw?.walls)
    ? raw.walls
        .map((w: any) => ({
          x1: toMeters(clamp(Number(w?.x1) || 0, 0, 100), planWidth),
          z1: toMeters(clamp(Number(w?.z1) || 0, 0, 100), planDepth),
          x2: toMeters(clamp(Number(w?.x2) || 0, 0, 100), planWidth),
          z2: toMeters(clamp(Number(w?.z2) || 0, 0, 100), planDepth),
          height: ceilingHeight,
          thickness: 0.15,
        }))
        .filter((w: WallSegment) => !(w.x1 === w.x2 && w.z1 === w.z2))
    : [];

  // Snap to axis-aligned walls with coincident corners — the raw VLM output
  // is rarely perfectly orthogonal/closed, which is what made the 3D model
  // look skewed with gaps between walls.
  const walls: WallSegment[] = orthogonalizeWalls(rawWalls);

  const rooms: Room[] = Array.isArray(raw?.rooms)
    ? raw.rooms.map((r: any, i: number) => ({
        id: `room-${i}`,
        name: String(r?.name || `Room ${i + 1}`),
        cx: toMeters(clamp(Number(r?.cx) || 50, 0, 100), planWidth),
        cz: toMeters(clamp(Number(r?.cz) || 50, 0, 100), planDepth),
        area: clamp(Number(r?.area) || 10, 0.5, 500),
        color: typeof r?.color === 'string' ? r.color : '#e8e2d5',
      }))
    : [];

  const doors: DoorOpening[] = Array.isArray(raw?.doors)
    ? raw.doors.map((d: any) => ({
        x: toMeters(clamp(Number(d?.x) || 50, 0, 100), planWidth),
        z: toMeters(clamp(Number(d?.z) || 50, 0, 100), planDepth),
        width: clamp(Number(d?.width) || 0.9, 0.6, 2),
        rotation: toRad(Number(d?.rotation) || 0),
      }))
    : [];

  const windows: WindowOpening[] = Array.isArray(raw?.windows)
    ? raw.windows.map((w: any) => ({
        x: toMeters(clamp(Number(w?.x) || 50, 0, 100), planWidth),
        z: toMeters(clamp(Number(w?.z) || 50, 0, 100), planDepth),
        width: clamp(Number(w?.width) || 1.2, 0.4, 3),
        sillHeight: clamp(Number(w?.sillHeight) || 0.9, 0.3, 1.5),
        height: clamp(Number(w?.height) || 1.2, 0.4, 2.5),
        rotation: toRad(Number(w?.rotation) || 0),
      }))
    : [];

  const validFurnitureTypes = [
    'sofa', 'table', 'bed', 'chair', 'counter', 'toilet', 'sink', 'fridge', 'tree',
  ];
  const furniture: FurnitureItem[] = Array.isArray(raw?.furniture)
    ? raw.furniture.map((f: any) => ({
        type: (validFurnitureTypes.includes(f?.type) ? f.type : 'chair') as FurnitureItem['type'],
        x: toMeters(clamp(Number(f?.x) || 50, 0, 100), planWidth),
        z: toMeters(clamp(Number(f?.z) || 50, 0, 100), planDepth),
        rotation: toRad(Number(f?.rotation) || 0),
        scale: clamp(Number(f?.scale) || 1, 0.3, 3),
      }))
    : [];

  // Fallback: if VLM returned no walls, build a simple rectangular shell
  if (walls.length === 0) {
    walls.push(
      { x1: 0, z1: 0, x2: planWidth, z2: 0, height: ceilingHeight, thickness: 0.15 },
      { x1: planWidth, z1: 0, x2: planWidth, z2: planDepth, height: ceilingHeight, thickness: 0.15 },
      { x1: planWidth, z1: planDepth, x2: 0, z2: planDepth, height: ceilingHeight, thickness: 0.15 },
      { x1: 0, z1: planDepth, x2: 0, z2: 0, height: ceilingHeight, thickness: 0.15 },
    );
    if (rooms.length === 0) {
      rooms.push({
        id: 'room-0',
        name: 'Open Space',
        cx: planWidth / 2,
        cz: planDepth / 2,
        area: planWidth * planDepth,
        color: '#e8e2d5',
      });
    }
  }

  // Snap doors/windows onto the nearest wall so they always sit flush in
  // the wall instead of floating at whatever raw position/angle the VLM
  // guessed.
  const snappedDoors = doors.map((d) => {
    const snap = snapToNearestWall(walls, d.x, d.z);
    return { ...d, x: snap.x, z: snap.z, rotation: snap.rotation };
  });
  const snappedWindows = windows.map((w) => {
    const snap = snapToNearestWall(walls, w.x, w.z);
    return { ...w, x: snap.x, z: snap.z, rotation: snap.rotation };
  });

  return {
    version: 1,
    scale: 1,
    dimensions: { width: planWidth, depth: planDepth, floors: 1 },
    walls,
    rooms,
    doors: snappedDoors,
    windows: snappedWindows,
    furniture,
    buildingType: String(raw?.buildingType || 'house'),
    summary: String(raw?.summary || 'Analyzed floor plan'),
    ceilingHeight,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const imageDataUrl: string | undefined = body?.image;

    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
      return NextResponse.json<AnalyzePlanResponse>(
        { success: false, error: 'Se requiere una imagen (data:image/...).' },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json<AnalyzePlanResponse>(
        {
          success: false,
          error:
            'Falta GEMINI_API_KEY. Consigue una clave gratuita en https://aistudio.google.com/apikey y añádela a tu archivo .env.',
        },
        { status: 500 },
      );
    }

    const rawContent = await callGeminiVision(imageDataUrl, apiKey);

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(rawContent));
    } catch (e) {
      return NextResponse.json<AnalyzePlanResponse>(
        {
          success: false,
          error: 'No se pudo interpretar el análisis del plano como JSON.',
          raw: rawContent,
        },
        { status: 502 },
      );
    }

    const data = normalizePlan(parsed);

    return NextResponse.json<AnalyzePlanResponse>({ success: true, data });
  } catch (err: any) {
    console.error('[analyze-plan] error', err);
    return NextResponse.json<AnalyzePlanResponse>(
      { success: false, error: err?.message || 'Error interno analizando el plano.' },
      { status: 500 },
    );
  }
}
