import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { PageHeader } from "@/components/admin/kit/page-header";
import { PromotionForm } from "@/components/admin/promotion-form";
import { upcomingEventOptions, vendorOptions } from "../promotion-options";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Feature on the homepage" };

export default async function NewPromotionPage({ searchParams }: { searchParams: Promise<{ eventId?: string | string[] }> }) {
  await requireAdmin();

  const [events, vendors, params] = await Promise.all([upcomingEventOptions(), vendorOptions(), searchParams]);
  const wanted = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const eventId = events.some((e) => e.id === wanted) ? wanted : undefined;

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        className="max-w-[656px]"
        back={{ href: "/admin/promotions", label: "Back to Featured on the homepage" }}
        title="Feature on the homepage"
        description="It shows in the homepage carousel between the two dates."
      />
      <PromotionForm events={events} vendors={vendors} eventId={eventId} />
    </div>
  );
}
