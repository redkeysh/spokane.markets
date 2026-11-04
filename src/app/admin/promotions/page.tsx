import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/kit/page-header";
import { AdminLinkButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { ListSection } from "@/components/admin/rare/list-section";
import { PromotionRows } from "@/components/admin/promotion-rows";
import { groupPromotions } from "@/components/admin/promotion-words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Featured on the homepage" };

async function loadPromotions() {
  return db.promotion.findMany({
    include: {
      event: { select: { id: true, title: true, slug: true, startDate: true } },
      vendorProfile: { select: { id: true, businessName: true, slug: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
  });
}

export default async function AdminPromotionsPage() {
  await requireAdmin();

  const now = new Date();
  const groups = groupPromotions(await loadPromotions(), now);
  const nothing = groups.now.length + groups.upcoming.length + groups.ended.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        back={{ href: "/admin/site", label: "Back to Site" }}
        title="Featured on the homepage"
        description="Events and vendors in the homepage carousel, each between the dates you set."
        actions={
          <AdminLinkButton href="/admin/promotions/new" variant="ink">
            Feature an event
          </AdminLinkButton>
        }
      />

      {nothing ? (
        <Empty detail="Feature an event to show it in the homepage carousel.">Nothing is featured yet.</Empty>
      ) : (
        <>
          <ListSection id="showing" title="Showing now">
            {groups.now.length > 0 ? (
              <PromotionRows promotions={groups.now} phase="now" now={now} />
            ) : (
              <Empty className="py-2">Nothing is on the homepage carousel right now.</Empty>
            )}
          </ListSection>
          {groups.upcoming.length > 0 && (
            <ListSection id="coming-up" title="Coming up">
              <PromotionRows promotions={groups.upcoming} phase="upcoming" now={now} />
            </ListSection>
          )}
          {groups.ended.length > 0 && (
            <details className="group">
              <summary className="inline-flex min-h-6 cursor-pointer items-center gap-2 rounded-sm font-text text-[15px]/[20px] font-semibold text-basalt">
                Ended
                <span className="font-text text-xs font-medium text-ash tabular-nums">{groups.ended.length}</span>
              </summary>
              <div className="mt-3">
                <PromotionRows promotions={groups.ended} phase="ended" now={now} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
