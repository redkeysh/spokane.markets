import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MarketForm } from "@/components/admin/market-form";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { notFound } from "next/navigation";
import { prismaListingToOnboardingFormDefaults } from "@/lib/validations/organizer-onboarding";
import type { MarketInput } from "@/lib/validations";

export const dynamic = "force-dynamic";

export default async function EditMarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [market, venues, neighborhoods, listingCommunityBadgeOptions] =
    await Promise.all([
    db.market.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, email: true } },
        listingCommunityBadges: { select: { id: true } },
      },
    }),
    db.venue.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getNeighborhoodOptions(),
    getListingCommunityBadgeOptions(),
  ]);
  if (!market) notFound();

  const ownerDisplay = market.owner
    ? (market.owner.name || market.owner.email)
    : undefined;

  const initialData = {
    id: market.id,
    name: market.name,
    slug: market.slug,
    venueId: market.venueId,
    description: market.description ?? "",
    imageUrl: market.imageUrl ?? "",
    imageFocalX: market.imageFocalX ?? 50,
    imageFocalY: market.imageFocalY ?? 50,
    websiteUrl: market.websiteUrl ?? "",
    facebookUrl: market.facebookUrl ?? "",
    instagramUrl: market.instagramUrl ?? "",
    baseArea: market.baseArea ?? "",
    typicalSchedule: market.typicalSchedule ?? "",
    contactEmail: market.contactEmail ?? "",
    contactPhone: market.contactPhone ?? "",
    verificationStatus: market.verificationStatus,
    ownerId: market.ownerId ?? "",
    participationMode: market.participationMode ?? "OPEN",
    vendorCapacity: market.vendorCapacity,
    publicIntentListEnabled: market.publicIntentListEnabled ?? true,
    publicIntentNamesEnabled: market.publicIntentNamesEnabled ?? true,
    publicRosterEnabled: market.publicRosterEnabled ?? true,
    complianceFlagged: market.complianceFlagged ?? false,
    complianceNotes: market.complianceNotes ?? "",
    listingCommunityBadgeIds: market.listingCommunityBadges.map(
      (badge) => badge.id
    ),
    ...prismaListingToOnboardingFormDefaults(market as unknown as Record<string, unknown>),
  };

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Edit Market"
        breadcrumbs={[
          { label: "Markets", href: "/admin/markets" },
          { label: "Edit" },
        ]}
      />
      <MarketForm
        initialData={initialData as MarketInput & { id: string }}
        venues={venues}
        neighborhoods={neighborhoods}
        ownerDisplay={ownerDisplay}
        listingCommunityBadgeOptions={listingCommunityBadgeOptions}
      />
    </div>
  );
}
