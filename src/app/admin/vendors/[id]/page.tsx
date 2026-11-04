import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { getHistory } from "@/lib/admin/history";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { extractSocialHandle } from "@/lib/utils";
import type { VendorEditorInput } from "@/lib/vendors/admin-input";
import { safeVendorListBack } from "@/lib/vendors/admin-list";
import { vendorCategories } from "@/lib/vendors/categories";
import { vendorEventsAt } from "@/lib/vendors/events-at";
import { toVendorHistory } from "@/lib/vendors/history";
import { AdminVendorForm } from "@/components/admin/vendor-form";

const EVENT_SELECT = { id: true, title: true, slug: true, status: true, startDate: true, endDate: true, deletedAt: true } as const;

const getVendor = cache(async (id: string) =>
  db.vendorProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, emailVerified: true } },
      listingCommunityBadges: { select: { id: true } },
      vendorEvents: { select: { event: { select: EVENT_SELECT } } },
      vendorIntents: { select: { status: true, event: { select: EVENT_SELECT } } },
      vendorRoster: { select: { status: true, event: { select: EVENT_SELECT } } },
    },
  })
);

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendor(id);
  return { title: vendor?.businessName ?? "Vendor not found" };
}

export default async function AdminVendorPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const session = await requireAdmin();
  const { id } = await params;
  const backHref = safeVendorListBack((await searchParams).back);
  const [vendor, badgeOptions, categories, history] = await Promise.all([
    getVendor(id),
    getListingCommunityBadgeOptions(),
    vendorCategories(),
    getHistory({ targetType: "VENDOR_PROFILE", targetId: id, limit: 20, viewerId: session.user.id }),
  ]);
  if (!vendor) notFound();

  const initial: VendorEditorInput = {
    businessName: vendor.businessName,
    slug: vendor.slug,
    description: vendor.description ?? "",
    specialties: vendor.specialties ?? "",
    primaryCategory: vendor.primaryCategory ?? "",
    serviceAreaLabel: vendor.serviceAreaLabel ?? "",
    contactEmail: vendor.contactEmail ?? "",
    contactPhone: vendor.contactPhone ?? "",
    contactVisible: vendor.contactVisible,
    socialLinksVisible: vendor.socialLinksVisible,
    imageUrl: vendor.imageUrl ?? "",
    imageFocalX: vendor.imageFocalX,
    imageFocalY: vendor.imageFocalY,
    heroImageUrl: vendor.heroImageUrl ?? "",
    heroImageFocalX: vendor.heroImageFocalX,
    heroImageFocalY: vendor.heroImageFocalY,
    galleryUrls: vendor.galleryUrls,
    websiteUrl: vendor.websiteUrl ?? "",
    facebookUrl: vendor.facebookUrl ? extractSocialHandle(vendor.facebookUrl, "facebook") : "",
    instagramUrl: vendor.instagramUrl ? extractSocialHandle(vendor.instagramUrl, "instagram") : "",
    verificationStatus: vendor.verificationStatus,
    userId: vendor.userId,
    listingCommunityBadgeIds: vendor.listingCommunityBadges.map((b) => b.id),
  };

  const eventsAt = vendorEventsAt({
    listed: vendor.vendorEvents,
    intents: vendor.vendorIntents,
    roster: vendor.vendorRoster,
  });

  return (
    <AdminVendorForm
      key={vendor.id}
      vendor={{ id: vendor.id, slug: vendor.slug, archived: vendor.deletedAt !== null, updatedAt: vendor.updatedAt.toISOString() }}
      initial={initial}
      initialOwner={vendor.user ? { id: vendor.user.id, name: vendor.user.name, email: vendor.user.email } : null}
      ownerEmailVerified={Boolean(vendor.user?.emailVerified)}
      badgeOptions={badgeOptions.map((b) => ({ id: b.id, name: b.name, description: b.description }))}
      categories={categories}
      eventsAt={eventsAt}
      history={toVendorHistory(history)}
      backHref={backHref}
    />
  );
}
