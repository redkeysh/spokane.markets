import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { emptyMarketDetails, marketSlugFrom } from "@/lib/markets/details";
import { loadPlaceOptions } from "@/lib/markets/queries";
import { NewMarket } from "@/components/admin/markets/new-market";

export const metadata: Metadata = { title: "New market" };

export const dynamic = "force-dynamic";

type PrefillKey = "name" | "venueId" | "typicalSchedule" | "description" | "websiteUrl" | "contactEmail" | "contactPhone" | "ownerId";

type Prefill = Partial<Record<PrefillKey, string | string[]>>;

/** The first value of a query parameter that may repeat, trimmed and cut to `max`. */
function text(value: string | string[] | undefined, max = 500): string {
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim().slice(0, max);
}

/**
 * A new market. Any of name, venueId, typicalSchedule, description, websiteUrl, contactEmail,
 * contactPhone and ownerId in the query prefill the form (an approved market application links here).
 */
export default async function NewMarketPage({ searchParams }: { searchParams: Promise<Prefill> }) {
  await requireAdmin();
  const prefill = await searchParams;
  const ownerId = text(prefill.ownerId, 100);
  const placeId = text(prefill.venueId, 100);
  const [places, neighborhoods, badges, owner] = await Promise.all([
    loadPlaceOptions(),
    getNeighborhoodOptions(),
    getListingCommunityBadgeOptions(),
    ownerId ? db.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true, email: true } }) : null,
  ]);
  const name = text(prefill.name, 200);
  const venueId = places.some((p) => p.id === placeId) ? placeId : "";
  const initial = emptyMarketDetails({
    name,
    slug: name ? marketSlugFrom(name) : "",
    venueId,
    typicalSchedule: text(prefill.typicalSchedule, 200),
    description: text(prefill.description, 5000),
    websiteUrl: text(prefill.websiteUrl),
    contactEmail: text(prefill.contactEmail, 200),
    contactPhone: text(prefill.contactPhone, 50),
    ownerId: owner?.id ?? "",
  });

  return (
    <NewMarket
      initial={initial}
      ownerDisplay={owner ? owner.name || owner.email : undefined}
      options={{
        places: places.map((p) => ({ id: p.id, name: p.name, city: p.city })),
        neighborhoods,
        badges: badges.map((b) => ({ id: b.id, name: b.name, description: b.description })),
      }}
    />
  );
}
