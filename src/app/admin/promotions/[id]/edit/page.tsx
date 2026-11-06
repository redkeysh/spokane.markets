import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatDay, pacificDate } from "@/lib/admin/format";
import { adminRecordTitle } from "@/lib/admin/record-title";
import { PageHeader } from "@/components/admin/kit/page-header";
import { PromotionForm } from "@/components/admin/promotion-form";
import { upcomingEventOptions, vendorOptions } from "../../promotion-options";

export const dynamic = "force-dynamic";

async function loadPromotion(id: string) {
  return db.promotion.findUnique({
    where: { id },
    include: {
      event: { select: { id: true, title: true, startDate: true } },
      vendorProfile: { select: { id: true, businessName: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return adminRecordTitle("Featured on the homepage", async () => {
    const promotion = await loadPromotion(id);
    const name = promotion?.event?.title ?? promotion?.vendorProfile?.businessName;
    return name ? `Featured: ${name}` : null;
  });
}

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const now = new Date();
  const [promotion, upcomingEvents, allVendors] = await Promise.all([
    loadPromotion(id),
    upcomingEventOptions(now),
    vendorOptions(),
  ]);

  if (!promotion) {
    notFound();
  }

  const current = promotion.event;
  const events =
    current && !upcomingEvents.some((e) => e.id === current.id)
      ? [{ id: current.id, title: current.title, when: formatDay(pacificDate(current.startDate), now) }, ...upcomingEvents]
      : upcomingEvents;
  const vendors =
    promotion.vendorProfile && !allVendors.some((v) => v.id === promotion.vendorProfile!.id)
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

  const name = promotion.event?.title ?? promotion.vendorProfile?.businessName ?? "Featured entry";

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        className="max-w-[656px]"
        back={{ href: "/admin/promotions", label: "Back to Featured on the homepage" }}
        title={name}
      />
      <PromotionForm events={events} vendors={vendors} initialData={initialData} />
    </div>
  );
}
