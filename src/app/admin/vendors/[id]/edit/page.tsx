import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { extractSocialHandle } from "@/lib/utils";
import { AdminVendorForm } from "@/components/admin/vendor-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [vendor, listingCommunityBadgeOptions] = await Promise.all([
    db.vendorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        listingCommunityBadges: { select: { id: true } },
      },
    }),
    getListingCommunityBadgeOptions(),
  ]);
  if (!vendor) notFound();

  const initialData = {
    id: vendor.id,
    businessName: vendor.businessName,
    slug: vendor.slug,
    description: vendor.description ?? "",
    imageUrl: vendor.imageUrl ?? "",
    imageFocalX: vendor.imageFocalX ?? 50,
    imageFocalY: vendor.imageFocalY ?? 50,
    heroImageUrl: vendor.heroImageUrl ?? "",
    heroImageFocalX: vendor.heroImageFocalX ?? 50,
    heroImageFocalY: vendor.heroImageFocalY ?? 50,
    primaryCategory: vendor.primaryCategory ?? "",
    serviceAreaLabel: vendor.serviceAreaLabel ?? "",
    websiteUrl: vendor.websiteUrl ?? "",
    facebookUrl: vendor.facebookUrl
      ? extractSocialHandle(vendor.facebookUrl, "facebook")
      : "",
    instagramUrl: vendor.instagramUrl
      ? extractSocialHandle(vendor.instagramUrl, "instagram")
      : "",
    contactEmail: vendor.contactEmail ?? "",
    contactPhone: vendor.contactPhone ?? "",
    galleryUrlsText: vendor.galleryUrls?.join("\n") ?? "",
    specialties: vendor.specialties ?? "",
    userId: vendor.userId ?? null,
    user: vendor.user
      ? { id: vendor.user.id, name: vendor.user.name, email: vendor.user.email }
      : null,
    contactVisible: vendor.contactVisible,
    socialLinksVisible: vendor.socialLinksVisible,
    verificationStatus: vendor.verificationStatus,
    listingCommunityBadgeIds: vendor.listingCommunityBadges.map(
      (badge) => badge.id
    ),
  };

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Edit Vendor"
        breadcrumbs={[
          { label: "Vendors", href: "/admin/vendors" },
          { label: "Edit" },
        ]}
      />
      <AdminVendorForm
        initialData={initialData}
        listingCommunityBadgeOptions={listingCommunityBadgeOptions}
      />
    </div>
  );
}
