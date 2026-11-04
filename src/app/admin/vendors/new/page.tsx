import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { EMPTY_VENDOR } from "@/lib/vendors/admin-input";
import { vendorCategories } from "@/lib/vendors/categories";
import { AdminVendorForm } from "@/components/admin/vendor-form";

export const metadata: Metadata = { title: "New vendor" };

export default async function NewVendorPage() {
  await requireAdmin();
  const [badgeOptions, categories] = await Promise.all([getListingCommunityBadgeOptions(), vendorCategories()]);
  return (
    <AdminVendorForm
      vendor={null}
      initial={EMPTY_VENDOR}
      initialOwner={null}
      badgeOptions={badgeOptions.map((b) => ({ id: b.id, name: b.name, description: b.description }))}
      categories={categories}
      eventsAt={null}
    />
  );
}
