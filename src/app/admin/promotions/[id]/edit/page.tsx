import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { PromotionForm } from "@/components/admin/promotion-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;

  const [promotion, publishedEvents, allVendors] = await Promise.all([
    db.promotion.findUnique({
      where: { id },
      include: {
        event: { select: { id: true, title: true, slug: true, startDate: true } },
        vendorProfile: { select: { id: true, businessName: true, slug: true } },
      },
    }),
    db.event.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, title: true, slug: true, startDate: true },
      orderBy: { startDate: "asc" },
    }),
    db.vendorProfile.findMany({
      select: { id: true, businessName: true, slug: true },
      orderBy: { businessName: "asc" },
    }),
  ]);

  if (!promotion) {
    notFound();
  }

  const events =
    promotion.event && !publishedEvents.some((e) => e.id === promotion.event!.id)
      ? [promotion.event, ...publishedEvents]
      : publishedEvents;
  const vendors =
    promotion.vendorProfile &&
    !allVendors.some((v) => v.id === promotion.vendorProfile!.id)
      ? [promotion.vendorProfile, ...allVendors]
      : allVendors;

  const initialData = {
    id: promotion.id,
    eventId: promotion.eventId ?? "",
    vendorProfileId: promotion.vendorProfileId ?? "",
    type: promotion.type,
    sponsorName: promotion.sponsorName,
    imageUrl: promotion.imageUrl ?? undefined,
    linkUrl: promotion.linkUrl ?? undefined,
    startDate: promotion.startDate.toISOString().slice(0, 10),
    endDate: promotion.endDate.toISOString().slice(0, 10),
    sortOrder: promotion.sortOrder,
  };

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Edit Promotion"
        breadcrumbs={[
          { label: "Promotions", href: "/admin/promotions" },
          { label: "Edit" },
        ]}
      />
      <PromotionForm events={events} vendors={vendors} initialData={initialData} />
    </div>
  );
}
