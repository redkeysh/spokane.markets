import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { assertNeighborhoodSlug } from "@/lib/neighborhoods";
import { venueSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = venueSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    let neighborhood: string | null;
    try {
      neighborhood = await assertNeighborhoodSlug(
        parsed.data.neighborhood,
        "neighborhood"
      );
    } catch (err) {
      return apiError(
        err instanceof Error ? err.message : "Invalid neighborhood value",
        400
      );
    }

    const existing = await db.venue.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return apiError("Venue not found or archived", 404);
    }

    const venue = await db.venue.update({
      where: { id },
      data: {
        ...parsed.data,
        neighborhood,
        parkingNotes: parsed.data.parkingNotes || null,
      },
    });

    return NextResponse.json(venue);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    await db.venue.update({ where: { id }, data: { deletedAt: new Date() } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
