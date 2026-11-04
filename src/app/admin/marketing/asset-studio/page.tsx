import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/kit/page-header";
import { AdminLinkButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { List, ListRow } from "@/components/admin/kit/list";
import { ListSection } from "@/components/admin/rare/list-section";
import { countWord } from "@/components/admin/rare/words";
import { RenderRows } from "@/components/admin/marketing/render-rows";
import { PROFILE_WORDS } from "@/components/admin/marketing/words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Graphics" };

const LINK = "inline-flex min-h-6 items-center rounded-sm font-text text-sm text-lilac underline-offset-4 hover:underline";

export default async function MarketingAssetStudioPage() {
  await requireAdmin();
  const [templates, recentRenders] = await Promise.all([
    db.marketingTemplate.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { _count: { select: { renders: true } } },
    }),
    db.marketingRender.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        template: { select: { name: true } },
        user: { select: { name: true, email: true } },
        vendor: { select: { businessName: true } },
        event: { select: { title: true } },
        market: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        back={{ href: "/admin/site", label: "Back to Site" }}
        title="Graphics"
        description="Pictures for social media, made from a template and filled in from a vendor, event or market."
        actions={
          <>
            <AdminLinkButton href="/admin/marketing/asset-studio/history" variant="outline">
              Past graphics
            </AdminLinkButton>
            <AdminLinkButton href="/admin/marketing/asset-studio/templates" variant="outline">
              Templates
            </AdminLinkButton>
            <AdminLinkButton href="/admin/marketing/asset-studio/new" variant="ink">
              New graphic
            </AdminLinkButton>
          </>
        }
      />

      <ListSection id="templates" title="Start from a template">
        {templates.length === 0 ? (
          <Empty
            className="py-2"
            action={
              <Link href="/admin/marketing/asset-studio/templates" className={LINK}>
                Add a template
              </Link>
            }
          >
            There are no templates yet.
          </Empty>
        ) : (
          <List label="Templates">
            {templates.map((template) => (
              <ListRow
                key={template.id}
                rowKey={template.id}
                href={`/admin/marketing/asset-studio/new?templateId=${template.id}`}
                title={
                  <>
                    <span className="sr-only">Make a graphic from </span>
                    {template.name}
                  </>
                }
                meta={
                  <span className="tabular-nums">
                    {[
                      template.category,
                      PROFILE_WORDS[template.profile],
                      `${template.defaultScale}x detail`,
                      template._count.renders > 0 ? `used ${countWord(template._count.renders, "time", "times")}` : "not used yet",
                    ].join(", ")}
                  </span>
                }
                status={
                  <span aria-hidden="true" className="font-text text-sm font-medium text-lilac">
                    Use
                  </span>
                }
              />
            ))}
          </List>
        )}
      </ListSection>

      <ListSection
        id="recent"
        title="Made lately"
        action={
          recentRenders.length > 0 ? (
            <Link href="/admin/marketing/asset-studio/history" className={LINK}>
              All past graphics
            </Link>
          ) : undefined
        }
      >
        {recentRenders.length === 0 ? (
          <Empty className="py-2">No graphics made yet.</Empty>
        ) : (
          <RenderRows renders={recentRenders} label="Made lately" />
        )}
      </ListSection>
    </div>
  );
}
