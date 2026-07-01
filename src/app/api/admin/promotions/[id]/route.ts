import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiNotFound, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { promotionPatchSchema } from "@/lib/validations";
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
    const parsed = promotionPatchSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;

    const existing = await db.promotion.findUnique({
      where: { id },
      select: { eventId: true, vendorProfileId: true },
    });
    if (!existing) {
      return apiNotFound("Promotion");
    }

    // Resolve the promotion target from the patch plus existing state. A
    // promotion must point at exactly one event or vendor; setting a non-empty
    // target of one kind switches away from the other, so a PATCH that only
    // sets the new target can't leave both populated. (The schema already
    // rejects setting both at once.)
    const patchEventId =
      data.eventId !== undefined ? (data.eventId.trim() ? data.eventId : null) : undefined;
    const patchVendorId =
      data.vendorProfileId !== undefined
        ? data.vendorProfileId.trim()
          ? data.vendorProfileId
          : null
        : undefined;
    let nextEventId = patchEventId !== undefined ? patchEventId : existing.eventId;
    let nextVendorId =
      patchVendorId !== undefined ? patchVendorId : existing.vendorProfileId;
    if (patchEventId) nextVendorId = null;
    if (patchVendorId) nextEventId = null;
    if (!!nextEventId === !!nextVendorId) {
      return apiError("A promotion must target exactly one event or vendor.", 400);
    }

    const promotion = await db.promotion.update({
      where: { id },
      data: {
        eventId: nextEventId,
        vendorProfileId: nextVendorId,
        ...(data.type !== undefined && { type: data.type }),
        ...(data.sponsorName !== undefined && { sponsorName: data.sponsorName }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl || null }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      include: {
        event: {
          select: { id: true, title: true, slug: true, startDate: true },
        },
        vendorProfile: {
          select: { id: true, businessName: true, slug: true, imageUrl: true },
        },
      },
    });

    return NextResponse.json(promotion);
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
    await db.promotion.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
