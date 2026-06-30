import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  eventListingUrl,
  marketListingUrl,
  toFacebookUrlFromHandle,
  toInstagramUrlFromHandle,
  toNormalizedUrl,
  vendorListingUrl,
} from "@/lib/marketing/urls";

export const MARKETING_PLACEHOLDER_MAPPING: Array<{
  placeholder: string;
  entity: "VendorProfile" | "Event" | "Market" | "Venue" | "Photo";
  field: string;
  transform?: string;
}> = [
  { placeholder: "VENDOR_NAME", entity: "VendorProfile", field: "businessName" },
  { placeholder: "HANDLE", entity: "VendorProfile", field: "instagramUrl", transform: "stripAtHandle" },
  { placeholder: "LISTING_URL", entity: "VendorProfile", field: "slug", transform: "vendorListingUrl" },
  { placeholder: "VENDOR_CATEGORY", entity: "VendorProfile", field: "primaryCategory" },
  { placeholder: "VENDOR_LOCATION", entity: "VendorProfile", field: "serviceAreaLabel" },
  { placeholder: "VENDOR_IMAGE_URL", entity: "VendorProfile", field: "heroImageUrl|imageUrl" },
  { placeholder: "VENDOR_WEBSITE_URL", entity: "VendorProfile", field: "websiteUrl", transform: "normalizeUrlToHttps" },
  { placeholder: "EVENT_NAME", entity: "Event", field: "title" },
  { placeholder: "EVENT_DATE", entity: "Event", field: "startDate", transform: "isoDate" },
  { placeholder: "EVENT_END_DATE", entity: "Event", field: "endDate", transform: "isoDate" },
  { placeholder: "EVENT_URL", entity: "Event", field: "slug", transform: "eventListingUrl" },
  { placeholder: "EVENT_IMAGE_URL", entity: "Event", field: "imageUrl" },
  { placeholder: "EVENT_LOCATION", entity: "Venue", field: "name|city|state", transform: "joinLocation" },
  { placeholder: "MARKET_NAME", entity: "Market", field: "name" },
  { placeholder: "MARKET_URL", entity: "Market", field: "slug", transform: "marketListingUrl" },
  { placeholder: "MARKET_IMAGE_URL", entity: "Market", field: "imageUrl" },
  { placeholder: "MARKET_LOCATION", entity: "Venue", field: "name|city|state", transform: "joinLocation" },
  { placeholder: "MARKET_BASE_AREA", entity: "Market", field: "baseArea" },
  { placeholder: "INSTAGRAM_URL", entity: "VendorProfile", field: "instagramUrl", transform: "instagramProfileUrl" },
  { placeholder: "FACEBOOK_URL", entity: "VendorProfile", field: "facebookUrl", transform: "facebookProfileUrl" },
];

function formatIsoDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function joinLocation(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && p.trim().length > 0).join(", ");
}

export async function buildVendorPrefillVariables(vendorId: string): Promise<Record<string, string>> {
  const vendor = await db.vendorProfile.findUnique({
    where: { id: vendorId },
    select: {
      businessName: true,
      slug: true,
      primaryCategory: true,
      serviceAreaLabel: true,
      heroImageUrl: true,
      imageUrl: true,
      websiteUrl: true,
      instagramUrl: true,
      facebookUrl: true,
      deletedAt: true,
    },
  });
  if (!vendor || vendor.deletedAt) return {};
  return {
    VENDOR_NAME: vendor.businessName,
    HANDLE: (vendor.instagramUrl ?? "").replace(/^@/, ""),
    LISTING_URL: vendorListingUrl(vendor.slug),
    VENDOR_CATEGORY: vendor.primaryCategory ?? "",
    VENDOR_LOCATION: vendor.serviceAreaLabel ?? "",
    VENDOR_IMAGE_URL: vendor.heroImageUrl ?? vendor.imageUrl ?? "",
    VENDOR_WEBSITE_URL: toNormalizedUrl(vendor.websiteUrl),
    INSTAGRAM_URL: toInstagramUrlFromHandle(vendor.instagramUrl),
    FACEBOOK_URL: toFacebookUrlFromHandle(vendor.facebookUrl),
  };
}

export async function buildEventPrefillVariables(eventId: string): Promise<Record<string, string>> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      slug: true,
      imageUrl: true,
      startDate: true,
      endDate: true,
      instagramUrl: true,
      facebookUrl: true,
      websiteUrl: true,
      deletedAt: true,
      venue: { select: { name: true, city: true, state: true } },
    },
  });
  if (!event || event.deletedAt) return {};
  return {
    EVENT_NAME: event.title,
    EVENT_DATE: formatIsoDate(event.startDate),
    EVENT_END_DATE: formatIsoDate(event.endDate),
    EVENT_URL: eventListingUrl(event.slug),
    EVENT_IMAGE_URL: event.imageUrl ?? "",
    EVENT_LOCATION: joinLocation([event.venue?.name, event.venue?.city, event.venue?.state]),
    INSTAGRAM_URL: toInstagramUrlFromHandle(event.instagramUrl),
    FACEBOOK_URL: toFacebookUrlFromHandle(event.facebookUrl),
    EVENT_WEBSITE_URL: toNormalizedUrl(event.websiteUrl),
  };
}

export async function buildMarketPrefillVariables(marketId: string): Promise<Record<string, string>> {
  const market = await db.market.findUnique({
    where: { id: marketId },
    select: {
      name: true,
      slug: true,
      imageUrl: true,
      baseArea: true,
      instagramUrl: true,
      facebookUrl: true,
      websiteUrl: true,
      deletedAt: true,
      venue: { select: { name: true, city: true, state: true } },
    },
  });
  if (!market || market.deletedAt) return {};
  return {
    MARKET_NAME: market.name,
    MARKET_URL: marketListingUrl(market.slug),
    MARKET_IMAGE_URL: market.imageUrl ?? "",
    MARKET_LOCATION: joinLocation([market.venue?.name, market.venue?.city, market.venue?.state]),
    MARKET_BASE_AREA: market.baseArea ?? "",
    INSTAGRAM_URL: toInstagramUrlFromHandle(market.instagramUrl),
    FACEBOOK_URL: toFacebookUrlFromHandle(market.facebookUrl),
    MARKET_WEBSITE_URL: toNormalizedUrl(market.websiteUrl),
  };
}

export async function buildEntityPrefillVariables(entityIds: {
  vendorId?: string | null;
  eventId?: string | null;
  marketId?: string | null;
}): Promise<Record<string, string>> {
  const parts: Array<Promise<Record<string, string>>> = [];
  if (entityIds.vendorId) parts.push(buildVendorPrefillVariables(entityIds.vendorId));
  if (entityIds.eventId) parts.push(buildEventPrefillVariables(entityIds.eventId));
  if (entityIds.marketId) parts.push(buildMarketPrefillVariables(entityIds.marketId));
  const resolved = await Promise.all(parts);
  // First entity wins on key conflicts. INSTAGRAM_URL/FACEBOOK_URL are emitted
  // by all three builders but map to the vendor in the placeholder catalog, so a
  // later entity must not silently overwrite an earlier one's social URLs.
  return resolved.reduce((acc, next) => ({ ...next, ...acc }), {});
}

export type MarketingEntitySearchResult = {
  id: string;
  label: string;
  subtitle?: string;
};

type SearchKind = "vendor" | "event" | "market";

const SEARCH_LIMIT = 25;

export async function searchMarketingEntities(
  kind: SearchKind,
  q: string
): Promise<MarketingEntitySearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  if (kind === "vendor") {
    const rows = await db.vendorProfile.findMany({
      where: {
        deletedAt: null,
        OR: [
          { businessName: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, businessName: true, slug: true },
      orderBy: { businessName: "asc" },
      take: SEARCH_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.businessName,
      subtitle: `@${row.slug}`,
    }));
  }
  if (kind === "event") {
    const rows = await db.event.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, slug: true, startDate: true },
      orderBy: { startDate: "desc" },
      take: SEARCH_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.title,
      subtitle: `${row.slug} - ${formatIsoDate(row.startDate)}`,
    }));
  }
  const rows = await db.market.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: SEARCH_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.name,
    subtitle: row.slug,
  }));
}

export type MarketingRenderJson = Prisma.JsonObject;
