import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-utils";
import { BANNER_KEYS } from "@/lib/banner-config";
import { getBannerImages } from "@/lib/banner-images";
import { COMMUNITY_IMAGES } from "@/lib/community-images";
import { db } from "@/lib/db";
import { getMaintenanceState } from "@/lib/maintenance";
import { getSiteAnnouncement } from "@/lib/site-announcement";
import { getSiteTheme } from "@/lib/site-theme";
import { BANNER_PLACES } from "@/lib/site/settings-input";
import { BannerEditor } from "@/components/admin/banner-editor";
import { MaintenanceForm } from "@/components/admin/maintenance-form";
import { SiteAnnouncementForm } from "@/components/admin/site-announcement-form";
import { SiteThemeSelector } from "@/components/admin/site-theme-selector";
import { adminButtonClass } from "@/components/admin/kit/button";
import { List, ListRow } from "@/components/admin/kit/list";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { FeaturedList } from "@/components/admin/site/featured-list";
import { SectionLinks, SiteSection } from "@/components/admin/site/site-section";
import { SiteUnsaved } from "@/components/admin/site/unsaved";

export const metadata: Metadata = { title: "Site" };

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "announcement", label: "Announcement bar" },
  { id: "featured", label: "Featured on the homepage" },
  { id: "banners", label: "Banners" },
  { id: "graphics", label: "Graphics" },
  { id: "palette", label: "Color palette" },
  { id: "maintenance", label: "Maintenance" },
] as const;

const GRAPHICS = [
  { href: "/admin/marketing/asset-studio", label: "Graphics studio", sentence: "Make a picture for social posts from an event or market." },
  { href: "/admin/marketing/asset-studio/history", label: "Past graphics", sentence: "Every graphic made so far, ready to download again." },
  { href: "/admin/marketing/asset-studio/templates", label: "Templates", sentence: "The layouts the graphics studio starts from." },
];

export default async function AdminSitePage() {
  await requireAdmin();
  const now = new Date();
  const [announcement, images, theme, maintenance, featured] = await Promise.all([
    getSiteAnnouncement(),
    getBannerImages(),
    getSiteTheme(),
    getMaintenanceState(),
    db.promotion.findMany({
      where: { eventId: { not: null } },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        event: { select: { id: true, title: true, status: true, deletedAt: true, startDate: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      take: 200,
    }),
  ]);
  const featuredEntries = featured.flatMap((p) => (p.event ? [{ ...p, event: p.event }] : []));

  return (
    <Screen className="grid grid-rows-[minmax(0,1fr)_auto]">
      <SiteUnsaved>
        <Pane label="Site" className="h-full">
          <div className="mx-auto max-w-[1184px] space-y-8 pb-12">
            <div className="space-y-3">
              <PageHeader title="Site" description="What the public site shows, in the order you are likely to change it." />
              <SectionLinks label="Sections" links={SECTIONS} />
            </div>

            <SiteSection
              id="announcement"
              title="Announcement bar"
              description="One line under the header of every public page, for news that matters this week."
            >
              <div className="max-w-[656px]">
                <SiteAnnouncementForm initialAnnouncement={announcement} palette={theme} />
              </div>
            </SiteSection>

            <SiteSection
              id="featured"
              title="Featured on the homepage"
              description="Upcoming published events shown in their own row on the homepage."
              actions={
                <>
                  <Link href="/admin/promotions" className={adminButtonClass({ variant: "quiet", size: "sm" })}>
                    See all featured
                  </Link>
                  <Link href="/admin/promotions/new" className={adminButtonClass({ variant: "outline", size: "sm" })}>
                    Feature an event
                  </Link>
                </>
              }
            >
              <div className="max-w-[880px]">
                <FeaturedList entries={featuredEntries} now={now} />
              </div>
            </SiteSection>

            <SiteSection
              id="banners"
              title="Banners"
              description="The large pictures at the top of public pages, named by the page they show on. Click a picture to choose the spot that stays in view when it is cropped."
            >
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {BANNER_KEYS.map((key) => {
                  const banner = images[key];
                  return (
                    <BannerEditor
                      key={key}
                      bannerKey={key}
                      label={BANNER_PLACES[key].label}
                      detail={BANNER_PLACES[key].detail}
                      currentUrl={banner.url}
                      currentFocalX={banner.focalX}
                      currentFocalY={banner.focalY}
                      isCustom={banner.url !== COMMUNITY_IMAGES[key]}
                    />
                  );
                })}
              </div>
            </SiteSection>

            <SiteSection id="graphics" title="Graphics" description="Pictures for social posts and print, made from your listings.">
              <div className="max-w-[656px]">
                <List label="Graphics">
                  {GRAPHICS.map((g) => (
                    <ListRow key={g.href} rowKey={g.href} href={g.href} title={g.label} meta={g.sentence} className="min-h-14" />
                  ))}
                </List>
              </div>
            </SiteSection>

            <SiteSection id="palette" title="Color palette" description="The colors of the public site. The admin keeps its own look.">
              <div className="max-w-[656px]">
                <SiteThemeSelector currentTheme={theme} />
              </div>
            </SiteSection>

            <SiteSection
              id="maintenance"
              title="Maintenance"
              description="Close the public site for a while, for example during a move, and say when it will be back."
            >
              <div className="max-w-[656px]">
                <MaintenanceForm
                  initialState={{
                    mode: maintenance.mode,
                    messageTitle: maintenance.messageTitle,
                    messageBody: maintenance.messageBody,
                    links: maintenance.links,
                    eta: maintenance.eta,
                  }}
                />
              </div>
            </SiteSection>
          </div>
        </Pane>
      </SiteUnsaved>
    </Screen>
  );
}
