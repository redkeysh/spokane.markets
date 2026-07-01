import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { assertListingCommunityBadgeIds } from "@/lib/listing-community-badges";
import { assertNeighborhoodSlug } from "@/lib/neighborhoods";
import { marketSchema } from "@/lib/validations";
import {
  pickOnboardingFields,
  toMarketOnboardingPrismaData,
} from "@/lib/validations/organizer-onboarding";
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
    const parsed = marketSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;
    let listingCommunityBadgeIds: string[] | undefined;
    if (data.listingCommunityBadgeIds !== undefined) {
      try {
        listingCommunityBadgeIds = await assertListingCommunityBadgeIds(
          data.listingCommunityBadgeIds
        );
      } catch (err) {
        return apiError(
          err instanceof Error ? err.message : "Invalid community badges",
          400
        );
      }
    }
    const onboarding = toMarketOnboardingPrismaData(
      pickOnboardingFields(data as unknown as Record<string, unknown>)
    );
    let baseArea: string | null;
    try {
      baseArea = await assertNeighborhoodSlug(data.baseArea, "baseArea");
    } catch (err) {
      return apiError(
        err instanceof Error ? err.message : "Invalid baseArea value",
        400
      );
    }
    const existing = await db.market.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return apiError("Market not found or archived", 404);
    }
    const activeVenue = await db.venue.findFirst({
      where: { id: data.venueId, deletedAt: null },
      select: { id: true },
    });
    if (!activeVenue) {
      return apiError("Selected venue is archived or missing", 400);
    }

    const market = await db.market.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        venueId: data.venueId,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        ...(data.imageFocalX != null && { imageFocalX: data.imageFocalX }),
        ...(data.imageFocalY != null && { imageFocalY: data.imageFocalY }),
        websiteUrl: data.websiteUrl || null,
        facebookUrl: data.facebookUrl || null,
        instagramUrl: data.instagramUrl || null,
        baseArea,
        typicalSchedule: data.typicalSchedule || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        ...(data.verificationStatus && {
          verificationStatus: data.verificationStatus,
        }),
        ...(data.ownerId !== undefined && {
          ownerId: data.ownerId || null,
        }),
        ...(data.participationMode && { participationMode: data.participationMode }),
        ...(data.vendorCapacity != null && { vendorCapacity: data.vendorCapacity }),
        ...(data.publicIntentListEnabled !== undefined && {
          publicIntentListEnabled: data.publicIntentListEnabled,
        }),
        ...(data.publicIntentNamesEnabled !== undefined && {
          publicIntentNamesEnabled: data.publicIntentNamesEnabled,
        }),
        ...(data.publicRosterEnabled !== undefined && {
          publicRosterEnabled: data.publicRosterEnabled,
        }),
        ...onboarding,
        ...(data.complianceFlagged !== undefined && { complianceFlagged: data.complianceFlagged }),
        ...(data.complianceNotes !== undefined && {
          complianceNotes: data.complianceNotes === "" ? null : data.complianceNotes,
        }),
        ...(listingCommunityBadgeIds !== undefined && {
          listingCommunityBadges: {
            set: listingCommunityBadgeIds.map((badgeId) => ({ id: badgeId })),
          },
        }),
      },
    });

    return NextResponse.json(market);
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
    await db.market.update({ where: { id }, data: { deletedAt: new Date() } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
