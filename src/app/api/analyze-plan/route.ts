import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
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

/** Validate & sanitize the raw parsed object into a proper FloorPlanData. */
function normalizePlan(raw: any): FloorPlanData {
  const planWidth = clamp(Number(raw?.estimatedWidthMeters) || 12, 4, 60);
  const planDepth = clamp(Number(raw?.estimatedDepthMeters) || 10, 4, 60);
  const ceilingHeight = clamp(Number(raw?.ceilingHeightMeters) || 2.7, 2.2, 4);

  const walls: WallSegment[] = Array.isArray(raw?.walls)
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

  return {
    version: 1,
    scale: 1,
    dimensions: { width: planWidth, depth: planDepth, floors: 1 },
    walls,
    rooms,
    doors,
    windows,
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

    const zai = await ZAI.create();

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const rawContent: string = response.choices?.[0]?.message?.content ?? '';

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
