import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/** GET /api/projects/[id] — fetch one project (with image + analysis). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Proyecto no encontrado.' },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      project: {
        ...project,
        analysis: project.analysis ? JSON.parse(project.analysis) : null,
      },
    });
  } catch (err: any) {
    console.error('[project GET]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error obteniendo proyecto.' },
      { status: 500 },
    );
  }
}

/** DELETE /api/projects/[id] — soft delete (archive). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.project.update({
      where: { id },
      data: { archived: true },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[project DELETE]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error eliminando proyecto.' },
      { status: 500 },
    );
  }
}
