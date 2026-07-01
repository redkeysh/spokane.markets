import { requireAdmin } from "@/lib/auth-utils";
import { type BannerKey } from "@/lib/banner-config";
import { getBannerImages } from "@/lib/banner-images";
import { COMMUNITY_IMAGES } from "@/lib/community-images";
import { getMaintenanceState } from "@/lib/maintenance";
import { getSiteAnnouncement } from "@/lib/site-announcement";
import { getSiteTheme } from "@/lib/site-theme";
import { BannerEditor } from "@/components/admin/banner-editor";
import { MaintenanceForm } from "@/components/admin/maintenance-form";
import { SiteAnnouncementForm } from "@/components/admin/site-announcement-form";
import { SiteThemeSelector } from "@/components/admin/site-theme-selector";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

const BANNER_LABELS: Record<BannerKey, string> = {
  hero: "Homepage hero",
  farmersMarket: "Markets page",
  produce: "About page",
  craftStall: "Submit page",
  community: "Auth layout",
  localVendor: "Vendors / Vendor survey",
  marketCrowd: "Events / Newsletter",
  events: "Event detail",
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [images, maintenanceState, siteTheme, siteAnnouncement] = await Promise.all([
    getBannerImages(),
    getMaintenanceState(),
    getSiteTheme(),
    getSiteAnnouncement(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Site Settings"
        description="Manage site-wide visuals, maintenance mode, and presentation defaults."
      />

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Color palette</h2>
        <SiteThemeSelector currentTheme={siteTheme} />
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Maintenance Mode</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control site-wide access and the public maintenance message from one place.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_APP_URL</code> for the maintenance proxy when running behind a reverse proxy.
          </p>
        </div>
        <MaintenanceForm
          initialState={{
            mode: maintenanceState.mode,
            messageTitle: maintenanceState.messageTitle,
            messageBody: maintenanceState.messageBody,
            links: maintenanceState.links,
            eta: maintenanceState.eta,
          }}
        />
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Banner Images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Update page banners, keep previews compact, and set the focal point used by cropped layouts.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(BANNER_LABELS).map(([rawKey, label]) => {
            const key = rawKey as BannerKey;
            const banner = images[key];
            return (
              <BannerEditor
                key={key}
                bannerKey={key}
                label={label}
                currentUrl={banner.url}
                currentFocalX={banner.focalX}
                currentFocalY={banner.focalY}
                isCustom={
                  banner.url !== COMMUNITY_IMAGES[key] ||
                  banner.focalX !== 50 ||
                  banner.focalY !== 50
                }
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Announcement Bar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish a short site-wide message with an optional CTA link below the main header.
          </p>
        </div>
        <SiteAnnouncementForm initialAnnouncement={siteAnnouncement} />
      </section>
    </div>
  );
}
