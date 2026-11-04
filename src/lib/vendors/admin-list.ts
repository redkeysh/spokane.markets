import type { Prisma, VerificationStatus } from "@prisma/client";

/** The "Show" scope of the admin vendor list. */
export const VENDOR_SHOWS = ["all", "unclaimed", "verified", "waiting", "archived"] as const;
export type VendorShow = (typeof VENDOR_SHOWS)[number];

export const VENDOR_SHOW_LABELS: Record<VendorShow, string> = {
  all: "All",
  unclaimed: "Not claimed",
  verified: "Verified",
  waiting: "Waiting for verification",
  archived: "Archived",
};

export const VENDOR_PAGE_SIZE = 50;

export type VendorListParams = { q: string; show: VendorShow; page: number };

type RawParams = { q?: string | string[]; show?: string | string[]; page?: string | string[]; orphaned?: string | string[]; archived?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the list filters from the URL. The old `?orphaned=1` and `?archived=1` links map to
 * "Not claimed" and "Archived".
 */
export function parseVendorListParams(raw: RawParams): VendorListParams {
  const q = (first(raw.q) ?? "").trim().slice(0, 200);
  const showParam = first(raw.show);
  let show: VendorShow = (VENDOR_SHOWS as readonly string[]).includes(showParam ?? "") ? (showParam as VendorShow) : "all";
  if (!showParam) {
    if (first(raw.archived) === "1") show = "archived";
    else if (first(raw.orphaned) === "1") show = "unclaimed";
  }
  const rawPage = Number.parseInt(first(raw.page) ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  return { q, show, page };
}

export function vendorListWhere({ q, show }: Pick<VendorListParams, "q" | "show">): Prisma.VendorProfileWhereInput {
  const and: Prisma.VendorProfileWhereInput[] = [show === "archived" ? { deletedAt: { not: null } } : { deletedAt: null }];
  if (show === "unclaimed") and.push({ userId: null });
  if (show === "verified") and.push({ verificationStatus: "VERIFIED" });
  if (show === "waiting") and.push({ verificationStatus: "PENDING" });
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { businessName: contains },
        { specialties: contains },
        { primaryCategory: contains },
        { user: { is: { name: contains } } },
        { user: { is: { email: contains } } },
      ],
    });
  }
  return { AND: and };
}

/** A list URL with the current filters, minus defaults. */
export function vendorListHref(params: Partial<VendorListParams>): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.show && params.show !== "all") qs.set("show", params.show);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `/admin/vendors?${s}` : "/admin/vendors";
}

/**
 * The vendor CSV export. The export route filters only by "not claimed", so with any other scope
 * or a search the link exports every active vendor and says so.
 */
export function vendorExport({ q, show }: Pick<VendorListParams, "q" | "show">): { href: string; label: string } {
  const base = "/api/admin/data/export/entity?entity=vendors";
  if (q || (show !== "all" && show !== "unclaimed")) return { href: base, label: "Export all vendors" };
  return { href: show === "unclaimed" ? `${base}&orphaned=1` : base, label: "Export CSV" };
}

/** Accepts a list address to return to, refusing anything outside the vendor list. */
export function safeVendorListBack(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (value === "/admin/vendors" || value.startsWith("/admin/vendors?"))) return value;
  return "/admin/vendors";
}

/** A vendor page address that remembers the list it was opened from. */
export function vendorPageHref(id: string, back = "/admin/vendors"): string {
  const path = `/admin/vendors/${encodeURIComponent(id)}`;
  return back === "/admin/vendors" ? path : `${path}?back=${encodeURIComponent(back)}`;
}

const EMPTY_SCOPE: Record<VendorShow, string> = {
  all: "vendors",
  unclaimed: "vendors that nobody has claimed",
  verified: "verified vendors",
  waiting: "vendors waiting for verification",
  archived: "archived vendors",
};

/** Says which filter emptied the list. */
export function vendorEmptyMessage({ q, show }: Pick<VendorListParams, "q" | "show">): string {
  if (q) return `No ${EMPTY_SCOPE[show]} match "${q}".`;
  if (show === "all") return "No vendor profiles yet.";
  return `No ${EMPTY_SCOPE[show]}.`;
}

/** "1 vendor", "12 vendors", for the results announcement. */
export function vendorCountSentence(total: number, { q, show }: Pick<VendorListParams, "q" | "show">): string {
  const noun = total === 1 ? "vendor" : "vendors";
  const scope = show === "all" ? "" : ` ${VENDOR_SHOW_LABELS[show].toLowerCase()}`;
  return `${total} ${noun}${scope}${q ? ` matching "${q}"` : ""}.`;
}

/** Verification is shown as a word only, never a stall. */
export function verificationMarkStatus(status: VerificationStatus): "VERIFIED" | "VERIFICATION_PENDING" | "NOT_VERIFIED" {
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "PENDING") return "VERIFICATION_PENDING";
  return "NOT_VERIFIED";
}

/**
 * Distinct events per vendor across the profile links, the vendor's own plans and the
 * organizers' lists, so an event linked three ways counts once.
 */
export function countEventsByVendor(links: ReadonlyArray<{ vendorProfileId: string; eventId: string }>): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const { vendorProfileId, eventId } of links) {
    let events = seen.get(vendorProfileId);
    if (!events) {
      events = new Set();
      seen.set(vendorProfileId, events);
    }
    events.add(eventId);
  }
  return new Map([...seen].map(([id, events]) => [id, events.size]));
}

/**
 * The primary categories vendors use, most used first, merging spelling that differs only by
 * case or spacing (the first spelling seen wins).
 */
export function topCategories(values: ReadonlyArray<string | null>, limit = 16): string[] {
  const tally = new Map<string, { label: string; count: number }>();
  for (const raw of values) {
    const label = raw?.trim().replace(/\s+/g, " ");
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = tally.get(key);
    if (entry) entry.count += 1;
    else tally.set(key, { label, count: 1 });
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => e.label);
}

/** "At 3 events", "At 1 event", "At no events". */
export function eventsAtLabel(count: number): string {
  if (count === 0) return "At no events";
  return `At ${count} ${count === 1 ? "event" : "events"}`;
}
