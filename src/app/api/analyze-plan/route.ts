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
import {
  clamp,
  orthogonalizeWalls,
  snapToNearestWall,
  resolveFurnitureOverlaps,
  snapChairsToTables,
} from '@/lib/floor-plan-geometry';

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
Analyze the floor plan carefully and extract its structural layout, room by
room, wall by wall. Take your time to trace every wall segment precisely —
accuracy matters more than speed.

Respond in the language the room labels are written in on the plan itself
(translate generic room names to that language if the plan uses icons/symbols
instead of text). If the plan has no legible language cues, respond in
Spanish, since this app is used by Spanish-speaking architects.

COORDINATE SYSTEM (critical):
- Use a NORMALIZED grid from 0 to 100 on BOTH axes.
- (0,0) is the TOP-LEFT corner of the floor plan image.
- (100,100) is the BOTTOM-RIGHT corner.
- X increases to the right, Z increases downward (we will map Z to depth in 3D).
- All wall endpoints, room centers, doors, windows and furniture positions must use this 0..100 grid.

WALLS — this is the most important part, be meticulous:
- Each wall is a straight line segment from (x1,z1) to (x2,z2).
- Trace the OUTER perimeter first as one continuous closed loop, then every
  INNER partition wall that separates two rooms or a room from a hallway.
- Walls MUST be axis-aligned: every segment is either perfectly horizontal
  (z1 == z2) or perfectly vertical (x1 == x2). If the plan shows a wall at a
  different angle, approximate it with the nearest horizontal/vertical
  segment rather than a diagonal.
- Wall endpoints that meet at a corner or a T-junction MUST use the exact
  same (x,z) pair in every wall that touches that point — walls must form a
  fully CLOSED, watertight loop with zero gaps between corners. Before
  finishing, mentally trace the perimeter loop and every room boundary to
  confirm there are no gaps.
- Set "exterior": true for perimeter/outer walls (thicker, load-bearing) and
  "exterior": false for interior partition walls (thinner).
- Do not invent walls that aren't in the image, and do not skip a visible
  wall just because it's a short segment (e.g. a closet nook).

ROOMS:
- List every enclosed room with a descriptive name translated/kept in the
  plan's own language (e.g. "Living Room", "Kitchen", "Bedroom", "Bathroom",
  "Hallway", "Dining", "Closet").
- cx,cz is the approximate CENTER of that room's floor area on the 0..100 grid — it must land inside the room's own walls, not on a wall or in a neighboring room.
- area is in square meters (estimate using the real-world dimensions you infer).
- color is a soft pastel floor color hint (#rrggbb) that fits the room's use (e.g. cooler tones for bathrooms, warm neutrals for living areas).

DOORS:
- Place a door opening exactly where a door swing arc or door gap appears in
  a wall — every door MUST sit ON a wall segment's line, not floating in the
  middle of a room.
- rotation is in DEGREES: 0 means the door spans along the X axis, 90 means
  along the Z axis — always match the orientation of the wall it's cut into.
- width is the door width in meters (typical 0.7-0.9 for interior doors, 0.9-1.0 for a main entrance).
- Include every door you can see, including closet and bathroom doors.
- ONLY report a door where you can actually see a swing arc, leaf symbol,
  or clear gap cut into a wall line. NEVER add a door just because you
  expect one should logically exist somewhere — a false door is just as
  wrong as a missing one. If a room has no visible opening in the image,
  leave it without a door rather than guessing one in.
- Look carefully at the WHOLE outer perimeter once for an exterior door
  (the dwelling's entrance from outside, often near the living/dining room
  or a small entry hall, sometimes labeled "Entrada"). But this image may
  show only part of a building or an upper floor with no ground-level
  entrance of its own (e.g. accessed only via an internal staircase/landing
  — look for "Escalera"/"Distribuidor" labels as a hint) — in that case it
  is completely normal and correct to report zero exterior doors. Do not
  invent one to satisfy this instruction.
- Never report two different doors for the same real opening. If you are
  about to list a second door within roughly 1 meter of one you already
  listed on the same wall, it is the same physical door — keep only one.

WINDOWS:
- Place windows ON exterior walls only, exactly where window symbols
  (parallel lines / double lines on the outer wall) appear.
- sillHeight is the height of the window sill from the floor (typical 0.9, lower for a large picture window).
- height is the window height (typical 1.2-1.4).
- rotation in degrees, same convention as doors — must match the exterior wall it's set into.

FURNITURE:
- Detect furniture symbols (bed, sofa, table, chairs, toilet, sink, fridge, kitchen counter, plants) and place them roughly where drawn, inside the correct room.
- Furniture pieces must NOT overlap each other — leave realistic clearance
  (at least 0.4m) between separate items, the way an actual room is
  furnished. A chair belongs immediately next to its table, oriented to
  face it, not floating elsewhere in the room.
- For a "sofa": look at its actual outline in the plan. If it is a plain
  rectangle, set variant to "straight". If it is L-shaped (a chaise longue
  / corner sectional, common in living rooms), set variant to
  "chaise-left" or "chaise-right" depending on which side the extra chaise
  section sticks out on, as seen sitting on the main seat run facing
  forward (the direction "rotation" points it). Get this right — a
  straight sofa rendered for an L-shaped one (or vice versa) is a visible
  mismatch with the real plan.
- rotation in degrees.

REAL-WORLD SIZE:
- estimatedWidthMeters and estimatedDepthMeters: your best estimate of the real building footprint, using any dimension annotations/scale bar on the plan if present, otherwise typical room sizes as a reference (a bedroom is usually 10-16 m², a bathroom 3-6 m²).
- ceilingHeightMeters: typical 2.5-3.0 for residential, up to 3.5 for commercial/loft spaces.

Double-check before responding: every door and window must lie exactly on a wall you listed, and every wall corner must be shared exactly by the walls that meet there.`;

/**
 * A second pass that reviews the first pass's own doors/windows list
 * against the image and returns a corrected, complete replacement —
 * rather than guessing independently. An earlier version had this pass
 * re-detect doors/windows blind (no visibility into pass 1's answer): two
 * independent guesses at the same physical door rarely land on the exact
 * same pixel coordinates, so proximity-based dedup let genuine duplicates
 * through (reported by a user: doors appearing twice, extra doors "to the
 * street"). Showing this pass what was already found lets the model
 * explicitly dedupe/correct instead of the two passes just disagreeing.
 */
function buildDoorWindowRecheckPrompt(doors: any[], windows: any[]): string {
  const fmt = (items: any[], extra: (i: any) => string) =>
    items.length
      ? items.map((it, i) => `  ${i + 1}. x=${it?.x}, z=${it?.z}, width=${it?.width}${extra(it)}`).join('\n')
      : '  (none found)';

  return `You are an expert architect reviewing a previous doors/windows analysis of this 2D floor plan image.

Grid convention: NORMALIZED 0-100 on both axes, (0,0) = top-left corner of
the image, (100,100) = bottom-right. X increases right, Z increases down.

A first pass already found these doors:
${fmt(doors, () => '')}

And these windows:
${fmt(windows, (w) => `, sillHeight=${w?.sillHeight}, height=${w?.height}`)}

Carefully re-examine the image against this list and produce a corrected,
COMPLETE replacement:
1. DEDUPLICATE FIRST: if two or more entries above are within roughly 1
   meter of each other (about 8-10 grid units at typical room scale), they
   are almost certainly the SAME physical door/window detected twice with
   slightly different coordinates — keep only ONE entry for it. This
   applies to every door including a possible entrance: two "entrance"
   candidates near each other are one door, not two. A real dwelling
   normally has exactly one main entrance, never two.
2. Add a door/window only if you can actually SEE it in the image (a swing
   arc, leaf symbol, or clear gap in a wall) — never add one just because
   you think one should logically exist. This image may show only part of
   a building or a floor with no ground-level entrance of its own (look for
   "Escalera"/"Distribuidor" labels as a hint it's an upper floor reached
   by an internal staircase) — reporting zero exterior doors is completely
   normal and correct in that case. A missing door is a smaller mistake
   than an invented one.
3. Fix any entry whose position is clearly on the wrong wall or whose
   width is implausible.

Return the corrected doors and windows arrays. This is a REPLACEMENT for
the list above, not an addition to it — include every opening that should
exist in the final model, deduplicated, and nothing invented.`;
}

/**
 * Gemini structured-output schema (OpenAPI subset). Forcing the response
 * to conform to this shape — rather than just asking nicely in the prompt
 * and hoping for well-formed JSON — cuts down on malformed/missing fields
 * that used to require guesswork in normalizePlan()'s fallbacks.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    buildingType: {
      type: 'STRING',
      enum: ['apartment', 'house', 'office', 'studio', 'loft', 'commercial'],
    },
    summary: { type: 'STRING' },
    estimatedWidthMeters: { type: 'NUMBER' },
    estimatedDepthMeters: { type: 'NUMBER' },
    ceilingHeightMeters: { type: 'NUMBER' },
    rooms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          cx: { type: 'NUMBER' },
          cz: { type: 'NUMBER' },
          area: { type: 'NUMBER' },
          color: { type: 'STRING' },
        },
        required: ['name', 'cx', 'cz', 'area'],
      },
    },
    walls: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          x1: { type: 'NUMBER' },
          z1: { type: 'NUMBER' },
          x2: { type: 'NUMBER' },
          z2: { type: 'NUMBER' },
          exterior: { type: 'BOOLEAN' },
        },
        required: ['x1', 'z1', 'x2', 'z2'],
      },
    },
    doors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          x: { type: 'NUMBER' },
          z: { type: 'NUMBER' },
          width: { type: 'NUMBER' },
          rotation: { type: 'NUMBER' },
        },
        required: ['x', 'z', 'width'],
      },
    },
    windows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          x: { type: 'NUMBER' },
          z: { type: 'NUMBER' },
          width: { type: 'NUMBER' },
          sillHeight: { type: 'NUMBER' },
          height: { type: 'NUMBER' },
          rotation: { type: 'NUMBER' },
        },
        required: ['x', 'z', 'width'],
      },
    },
    furniture: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: {
            type: 'STRING',
            enum: ['sofa', 'table', 'bed', 'chair', 'counter', 'toilet', 'sink', 'fridge', 'tree'],
          },
          x: { type: 'NUMBER' },
          z: { type: 'NUMBER' },
          rotation: { type: 'NUMBER' },
          variant: {
            type: 'STRING',
            enum: ['straight', 'chaise-left', 'chaise-right'],
          },
        },
        required: ['type', 'x', 'z'],
      },
    },
  },
  required: [
    'buildingType', 'summary', 'estimatedWidthMeters', 'estimatedDepthMeters',
    'ceilingHeightMeters', 'rooms', 'walls', 'doors', 'windows', 'furniture',
  ],
};

/** Schema for the focused doors/windows recheck pass — see DOOR_WINDOW_RECHECK_PROMPT. */
const DOOR_WINDOW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    doors: RESPONSE_SCHEMA.properties.doors,
    windows: RESPONSE_SCHEMA.properties.windows,
  },
  required: ['doors', 'windows'],
};

// 'gemini-flash-latest' is a Google-maintained alias that gets hot-swapped
// to the newest stable Flash model on every release, instead of pinning to
// a specific dated version that Google eventually deprecates/blocks for
// new API keys (e.g. gemini-2.5-flash started 404ing with "no longer
// available to new users" well before its official Oct 2026 shutdown).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls Google's Gemini API (free tier available at https://aistudio.google.com/apikey)
 * with the floor plan image and returns the raw text response.
 *
 * The free tier frequently returns 503 "high demand"/429 "rate limited" for
 * a few seconds at a time — Google's own error message calls these "usually
 * temporary", so retry a few times with backoff before giving up.
 */
async function callGeminiVision(
  imageDataUrl: string,
  apiKey: string,
  prompt: string,
  schema: object,
): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato de imagen no soportado (se requiere data:image/...;base64,...).');
  }
  const [, mimeType, base64Data] = match;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.15,
    },
  });

  const RETRY_DELAYS_MS = [2000, 5000, 10000];
  let lastError: Error = new Error('Gemini API: fallo desconocido.');

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const json = await res.json();
      const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini no devolvió contenido de texto.');
      }
      return text;
    }

    const errText = await res.text().catch(() => '');
    lastError = new Error(`Gemini API error (${res.status}): ${errText.slice(0, 500)}`);

    const retryable = res.status === 503 || res.status === 429;
    if (!retryable || attempt === RETRY_DELAYS_MS.length) {
      throw lastError;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError;
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
          // Exterior/load-bearing walls read thicker than interior partitions.
          thickness: w?.exterior === false ? 0.1 : 0.22,
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
  const validSofaVariants = ['straight', 'chaise-left', 'chaise-right'];
  const rawFurniture: FurnitureItem[] = Array.isArray(raw?.furniture)
    ? raw.furniture.map((f: any) => ({
        type: (validFurnitureTypes.includes(f?.type) ? f.type : 'chair') as FurnitureItem['type'],
        x: toMeters(clamp(Number(f?.x) || 50, 0, 100), planWidth),
        z: toMeters(clamp(Number(f?.z) || 50, 0, 100), planDepth),
        rotation: toRad(Number(f?.rotation) || 0),
        scale: clamp(Number(f?.scale) || 1, 0.3, 3),
        variant: (validSofaVariants.includes(f?.variant) ? f.variant : 'straight') as FurnitureItem['variant'],
      }))
    : [];

  // The VLM places each furniture item independently, which regularly
  // produces overlapping pieces (a chair on top of its table, a table
  // clipping into a sofa) and chairs left floating with an arbitrary
  // rotation instead of facing their table. Fix both up in a light
  // physical pass rather than trusting the raw per-item guesses.
  const furniture: FurnitureItem[] = snapChairsToTables(resolveFurnitureOverlaps(rawFurniture));

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

    const rawContent = await callGeminiVision(imageDataUrl, apiKey, ANALYSIS_PROMPT, RESPONSE_SCHEMA);

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

    // Second pass: shown the first pass's own doors/windows list (not a
    // blind independent guess — see buildDoorWindowRecheckPrompt for why),
    // asked to return a corrected, deduplicated replacement. A reliability
    // bonus, not a requirement — any failure here just keeps pass 1's list.
    try {
      const origDoors = Array.isArray(parsed.doors) ? parsed.doors : [];
      const origWindows = Array.isArray(parsed.windows) ? parsed.windows : [];
      const recheckPrompt = buildDoorWindowRecheckPrompt(origDoors, origWindows);
      const recheckContent = await callGeminiVision(imageDataUrl, apiKey, recheckPrompt, DOOR_WINDOW_SCHEMA);
      const recheck = JSON.parse(extractJson(recheckContent));
      const newDoors = Array.isArray(recheck.doors) ? recheck.doors : [];
      const newWindows = Array.isArray(recheck.windows) ? recheck.windows : [];
      // Guard against a broken recheck (e.g. a hallucinated empty response)
      // silently wiping out a valid pass-1 result.
      const plausible = newDoors.length > 0 || newWindows.length > 0 || (origDoors.length === 0 && origWindows.length === 0);
      if (plausible) {
        parsed.doors = newDoors;
        parsed.windows = newWindows;
      } else {
        console.error('[analyze-plan] door/window recheck returned nothing plausible, keeping pass 1');
      }
    } catch (e) {
      console.error('[analyze-plan] door/window recheck pass failed', e);
    }

    const data = normalizePlan(parsed);

    return NextResponse.json<AnalyzePlanResponse>({ success: true, data });
  } catch (err: any) {
    console.error('[analyze-plan] error', err);
    const message: string = err?.message || 'Error interno analizando el plano.';
    const friendly = /Gemini API error \((503|429)\)/.test(message)
      ? 'El servicio de IA está saturado en este momento (demanda alta en el nivel gratuito de Gemini). Ya se reintentó varias veces automáticamente; espera unos segundos y vuelve a intentarlo.'
      : message;
    return NextResponse.json<AnalyzePlanResponse>(
      { success: false, error: friendly },
      { status: 500 },
    );
  }
}
