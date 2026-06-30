import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_NAME } from "@/lib/constants";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toJsonLdScript } from "@/lib/utils";
import { TrackVendorView } from "@/components/track-content-view";
import { VendorProfileHeader } from "@/components/vendor/vendor-profile-header";
import { VendorProfileLeftRail } from "@/components/vendor/vendor-profile-left-rail";
import { VendorProfileRightContent } from "@/components/vendor/vendor-profile-right-content";
import {
  type VendorProfileTab,
  VENDOR_PROFILE_TABS,
  VendorProfileTabs,
} from "@/components/vendor/vendor-profile-tabs";
import {
  buildVendorProfileJsonLd,
  toPublicVendorProfile,
} from "@/lib/vendor-public-profile";
import {
  getVendorAppearances,
  splitAppearancesByTime,
} from "@/lib/services/vendor-appearances";
import { getAttendanceCountsByEventIds } from "@/lib/attendance-counts";
import { getVendorParticipationCountsByEventIds } from "@/lib/event-vendor-participation-count";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}

async function getVendorBySlug(slug: string) {
  return db.vendorProfile.findFirst({
    where: { slug, deletedAt: null },
    include: {
      listingCommunityBadges: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true, icon: true },
      },
    },
  });
}

function absUrl(baseUrl: string, url: string | null | undefined) {
  if (!url?.trim()) return undefined;
  if (url.startsWith("http")) return url;
  return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);

  if (!vendor) {
    return { title: "Vendor Not Found" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const description =
    vendor.description ?? `${vendor.businessName} — a local vendor on ${SITE_NAME}.`;
  const ogImage =
    absUrl(baseUrl, vendor.heroImageUrl) ??
    absUrl(baseUrl, vendor.imageUrl);
  return {
    title: `${vendor.businessName} | ${SITE_NAME}`,
    description,
    alternates: { canonical: `${baseUrl}/vendors/${slug}` },
    openGraph: {
      title: vendor.businessName,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: vendor.businessName,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

function parseVendorTab(tabValue: string | string[] | undefined): VendorProfileTab {
  const rawTab = Array.isArray(tabValue) ? tabValue[0] : tabValue;
  if (rawTab && VENDOR_PROFILE_TABS.includes(rawTab as VendorProfileTab)) {
    return rawTab as VendorProfileTab;
  }
  return "activity";
}

export default async function VendorProfilePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeTab = parseVendorTab(resolvedSearchParams.tab);
  const [vendor, session] = await Promise.all([
    getVendorBySlug(slug),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!vendor) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicVendor = toPublicVendorProfile(vendor, baseUrl);
  const vendorJsonLd = buildVendorProfileJsonLd(publicVendor, baseUrl);
  const vendorUrl = `${baseUrl}/vendors/${vendor.slug}`;

  const { rows: appearanceRows } = await getVendorAppearances(vendor.id);
  const { upcoming, past } = splitAppearancesByTime(appearanceRows);

  const appearanceEventIds = [...upcoming, ...past].map((r) => r.event.id);
  const [attendanceMap, vendorParticipationMap, favoriteCount] = await Promise.all([
    getAttendanceCountsByEventIds(appearanceEventIds),
    getVendorParticipationCountsByEventIds(appearanceEventIds),
    db.favoriteVendor.count({ where: { vendorProfileId: vendor.id } }),
  ]);

  const favorite = session?.user
    ? await db.favoriteVendor.findUnique({
        where: {
          userId_vendorProfileId: {
            userId: session.user.id!,
            vendorProfileId: vendor.id,
          },
        },
      })
    : null;

  const categoryTag = vendor.primaryCategory?.trim() || vendor.specialties?.split(",")[0]?.trim();
  const specialtyTags =
    vendor.specialties
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const upcomingEvents = upcoming.map((row) => ({
    ...row.event,
    attendance: attendanceMap[row.event.id],
    vendorParticipationCount: vendorParticipationMap[row.event.id],
  }));
  const pastEvents = past.map((row) => ({
    ...row.event,
    attendance: attendanceMap[row.event.id],
    vendorParticipationCount: vendorParticipationMap[row.event.id],
  }));
  const canEditMedia =
    Boolean(session?.user?.id) &&
    (session?.user?.role === "ADMIN" || vendor.userId === session?.user?.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(vendorJsonLd) }}
      />
      <TrackVendorView
        vendorId={vendor.id}
        category={categoryTag ? categoryTag.toLowerCase().replace(/\s+/g, "-") : undefined}
      />

      <VendorProfileHeader
        vendorId={vendor.id}
        slug={vendor.slug}
        vendorName={vendor.businessName}
        verificationStatus={vendor.verificationStatus}
        description={vendor.description}
        imageUrl={vendor.imageUrl}
        imageFocalX={vendor.imageFocalX}
        imageFocalY={vendor.imageFocalY}
        heroImageUrl={vendor.heroImageUrl}
        heroImageFocalX={vendor.heroImageFocalX}
        heroImageFocalY={vendor.heroImageFocalY}
        primaryCategory={vendor.primaryCategory}
        specialtyTags={specialtyTags}
        serviceAreaLabel={vendor.serviceAreaLabel}
        favoriteCount={favoriteCount}
        initialFavorited={Boolean(favorite)}
        initialEmailAlerts={favorite?.emailAlerts ?? true}
        isLoggedIn={Boolean(session?.user)}
        canEditMedia={canEditMedia}
        vendorUrl={vendorUrl}
      />

      <VendorProfileTabs slug={vendor.slug} activeTab={activeTab} />

      <div className="mt-4 flex flex-col gap-8 sm:mt-5 lg:mt-6 lg:flex-row lg:items-start lg:gap-10">
        <VendorProfileLeftRail
          vendorId={vendor.id}
          primaryCategory={vendor.primaryCategory}
          serviceAreaLabel={vendor.serviceAreaLabel}
          specialties={specialtyTags}
          contactEmail={publicVendor.contactEmail}
          contactPhone={publicVendor.contactPhone}
          websiteUrl={publicVendor.websiteUrl}
          facebookUrl={publicVendor.facebookUrl}
          instagramUrl={publicVendor.instagramUrl}
          listingCommunityBadges={vendor.listingCommunityBadges}
        />
        <VendorProfileRightContent
          activeTab={activeTab}
          vendorName={vendor.businessName}
          description={vendor.description}
          galleryUrls={vendor.galleryUrls ?? []}
          upcomingEvents={upcomingEvents}
          pastEvents={pastEvents}
        />
      </div>
    </div>
  );
}
