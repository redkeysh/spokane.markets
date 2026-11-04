import { getFacebookDisplayUrl, getInstagramDisplayUrl, normalizeUrlToHttps, slugify } from "@/lib/utils";

/** The market fields the details form edits. Verification has its own menu and confirm. */
export type MarketDetails = {
  name: string;
  slug: string;
  venueId: string;
  baseArea: string;
  typicalSchedule: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  ownerId: string;
  participationMode: "OPEN" | "REQUEST_TO_JOIN" | "INVITE_ONLY" | "CAPACITY_LIMITED";
  vendorCapacity: number | null;
  publicIntentListEnabled: boolean;
  publicIntentNamesEnabled: boolean;
  publicRosterEnabled: boolean;
  vendorWorkflowMode: "INTENT_ONLY" | "BOTH";
  vendorApplicationState: "NOT_ACCEPTING" | "OPEN" | "WAITLIST" | "CLOSED";
  imageUrl: string;
  imageFocalX: number;
  imageFocalY: number;
  websiteUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  listingCommunityBadgeIds: string[];
  complianceFlagged: boolean;
  complianceNotes: string;
};

export const MARKET_DETAIL_KEYS = [
  "name",
  "slug",
  "venueId",
  "baseArea",
  "typicalSchedule",
  "description",
  "contactEmail",
  "contactPhone",
  "ownerId",
  "participationMode",
  "vendorCapacity",
  "publicIntentListEnabled",
  "publicIntentNamesEnabled",
  "publicRosterEnabled",
  "vendorWorkflowMode",
  "vendorApplicationState",
  "imageUrl",
  "imageFocalX",
  "imageFocalY",
  "websiteUrl",
  "facebookUrl",
  "instagramUrl",
  "listingCommunityBadgeIds",
  "complianceFlagged",
  "complianceNotes",
] as const satisfies readonly (keyof MarketDetails)[];

export function emptyMarketDetails(prefill: Partial<MarketDetails> = {}): MarketDetails {
  return {
    name: "",
    slug: "",
    venueId: "",
    baseArea: "",
    typicalSchedule: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
    ownerId: "",
    participationMode: "OPEN",
    vendorCapacity: null,
    publicIntentListEnabled: true,
    publicIntentNamesEnabled: true,
    publicRosterEnabled: true,
    vendorWorkflowMode: "INTENT_ONLY",
    vendorApplicationState: "NOT_ACCEPTING",
    imageUrl: "",
    imageFocalX: 50,
    imageFocalY: 50,
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    listingCommunityBadgeIds: [],
    complianceFlagged: false,
    complianceNotes: "",
    ...prefill,
  };
}

type MarketRow = {
  name: string;
  slug: string;
  venueId: string;
  baseArea: string | null;
  typicalSchedule: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerId: string | null;
  participationMode: MarketDetails["participationMode"];
  vendorCapacity: number | null;
  publicIntentListEnabled: boolean;
  publicIntentNamesEnabled: boolean;
  publicRosterEnabled: boolean;
  vendorWorkflowMode: MarketDetails["vendorWorkflowMode"];
  vendorApplicationState: MarketDetails["vendorApplicationState"];
  imageUrl: string | null;
  imageFocalX: number;
  imageFocalY: number;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  listingCommunityBadges: { id: string }[];
  complianceFlagged: boolean;
  complianceNotes: string | null;
};

export function marketDetailsFrom(row: MarketRow): MarketDetails {
  return {
    name: row.name,
    slug: row.slug,
    venueId: row.venueId,
    baseArea: row.baseArea ?? "",
    typicalSchedule: row.typicalSchedule ?? "",
    description: row.description ?? "",
    contactEmail: row.contactEmail ?? "",
    contactPhone: row.contactPhone ?? "",
    ownerId: row.ownerId ?? "",
    participationMode: row.participationMode,
    vendorCapacity: row.vendorCapacity,
    publicIntentListEnabled: row.publicIntentListEnabled,
    publicIntentNamesEnabled: row.publicIntentNamesEnabled,
    publicRosterEnabled: row.publicRosterEnabled,
    vendorWorkflowMode: row.vendorWorkflowMode,
    vendorApplicationState: row.vendorApplicationState,
    imageUrl: row.imageUrl ?? "",
    imageFocalX: row.imageFocalX,
    imageFocalY: row.imageFocalY,
    websiteUrl: row.websiteUrl ?? "",
    facebookUrl: row.facebookUrl ?? "",
    instagramUrl: row.instagramUrl ?? "",
    listingCommunityBadgeIds: row.listingCommunityBadges.map((b) => b.id),
    complianceFlagged: row.complianceFlagged,
    complianceNotes: row.complianceNotes ?? "",
  };
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  return a === b;
}

/** The keys whose values differ, for "2 unsaved changes" and the audit entry. */
export function changedKeys(before: MarketDetails, after: MarketDetails): (keyof MarketDetails)[] {
  return MARKET_DETAIL_KEYS.filter((key) => !same(before[key], after[key]));
}

/**
 * Links as the owner typed them, made clickable: a bare domain gets https://, a Facebook or
 * Instagram handle becomes its page address.
 */
export function normalizeMarketLinks(values: MarketDetails): MarketDetails {
  return {
    ...values,
    websiteUrl: values.websiteUrl.trim() ? normalizeUrlToHttps(values.websiteUrl) : "",
    facebookUrl: getFacebookDisplayUrl(values.facebookUrl) ?? "",
    instagramUrl: getInstagramDisplayUrl(values.instagramUrl) ?? "",
  };
}

/** A web address from a name, as the market's public page uses it. */
export function marketSlugFrom(name: string): string {
  return slugify(name);
}
