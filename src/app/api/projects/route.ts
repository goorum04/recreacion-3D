import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { FloorPlanData } from '@/lib/floor-plan-types';

export const runtime = 'nodejs';

/** GET /api/projects — list all non-archived projects, newest first. */
export async function GET() {
  try {
    const projects = await db.project.findMany({
      where: { archived: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        area: true,
        roomCount: true,
        buildingType: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ success: true, projects });
  } catch (err: any) {
    console.error('[projects GET]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error listando proyectos.' },
      { status: 500 },
    );
  }
}

/** POST /api/projects — create a new saved project. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, image, analysis } = body as {
      name?: string;
      description?: string;
      image?: string;
      analysis?: FloorPlanData;
    };

    if (!analysis) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos (analysis).' },
        { status: 400 },
      );
    }

    // Allow saving demo projects (no uploaded image) with a tiny placeholder.
    const finalImage =
      image && image.startsWith('data:image/')
        ? image
        : 'data:image/svg+xml;base64,' +
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#e8e2d5"/><text x="60" y="50" font-family="sans-serif" font-size="10" fill="#8b7d6b" text-anchor="middle">Plano demo</text></svg>`,
          ).toString('base64');

    const area = analysis.dimensions
      ? Number((analysis.dimensions.width * analysis.dimensions.depth).toFixed(2))
      : 0;
    const roomCount = analysis.rooms?.length ?? 0;
    const buildingType = analysis.buildingType ?? null;

    const project = await db.project.create({
      data: {
        name: name || `Proyecto ${new Date().toLocaleDateString('es')}`,
        description: description || analysis.summary || '',
        image: finalImage,
        analysis: JSON.stringify(analysis),
        area,
        roomCount,
        buildingType,
      },
    });

    return NextResponse.json({ success: true, project });
  } catch (err: any) {
    console.error('[projects POST]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error guardando proyecto.' },
      { status: 500 },
    );
  }
}
