import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatDay, pacificDate } from "@/lib/admin/format";
import { PageHeader } from "@/components/admin/kit/page-header";
import { MarketingRenderEditor } from "@/components/admin/marketing/marketing-render-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New graphic" };

export default async function MarketingAssetStudioNewPage({ searchParams }: { searchParams: Promise<{ eventId?: string | string[] }> }) {
  await requireAdmin();
  const { eventId } = await searchParams;
  const id = Array.isArray(eventId) ? eventId[0] : eventId;
  const event = id ? await db.event.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true, startDate: true } }) : null;
  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        className="max-w-[984px]"
        back={{ href: "/admin/marketing/asset-studio", label: "Back to Graphics" }}
        title="New graphic"
        description="Choose a template and fill it in. The graphic is made in the background and lands in Past graphics."
      />
      <MarketingRenderEditor
        initialEvent={event ? { id: event.id, label: event.title, subtitle: formatDay(pacificDate(event.startDate)) } : undefined}
      />
    </div>
  );
}
