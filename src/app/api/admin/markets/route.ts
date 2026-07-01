import { db } from "@/lib/db";
import { assertListingCommunityBadgeIds } from "@/lib/listing-community-badges";
import { assertNeighborhoodSlug } from "@/lib/neighborhoods";
import { marketSchema } from "@/lib/validations";
import {
  pickOnboardingFields,
  toMarketOnboardingPrismaData,
} from "@/lib/validations/organizer-onboarding";
import { NextResponse } from "next/server";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  const { error } = await requireApiAdminPermission("admin.listings.manage");
  if (error) return error;

  const body = await request.json();
  const parsed = marketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Validation failed", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const data = parsed.data;
  let listingCommunityBadgeIds: string[] = [];
  try {
    listingCommunityBadgeIds = await assertListingCommunityBadgeIds(
      data.listingCommunityBadgeIds
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message:
            err instanceof Error ? err.message : "Invalid community badges",
        },
      },
      { status: 400 }
    );
  }
  const onboarding = toMarketOnboardingPrismaData(
    pickOnboardingFields(data as unknown as Record<string, unknown>)
  );
  const venueExists = await db.venue.findFirst({
    where: { id: data.venueId, deletedAt: null },
    select: { id: true },
  });
  if (!venueExists) {
    return NextResponse.json(
      { error: { message: "Selected venue is archived or missing" } },
      { status: 400 }
    );
  }
  let baseArea: string | null;
  try {
    baseArea = await assertNeighborhoodSlug(data.baseArea, "baseArea");
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Invalid baseArea value",
        },
      },
      { status: 400 }
    );
  }
  let market;
  try {
    market = await db.market.create({
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
      ...(listingCommunityBadgeIds.length > 0 && {
        listingCommunityBadges: {
          connect: listingCommunityBadgeIds.map((id) => ({ id })),
        },
      }),
    },
    });
  } catch (e) {
    return handleApiError(e);
  }

  return NextResponse.json(market, { status: 201 });
}
