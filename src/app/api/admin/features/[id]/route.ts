import { requireApiAdmin } from "@/lib/api-auth";
import { apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { featureSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = featureSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const feature = await db.feature.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        icon: parsed.data.icon || null,
      },
    });
    return NextResponse.json(feature);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const { id } = await params;
    await db.feature.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
