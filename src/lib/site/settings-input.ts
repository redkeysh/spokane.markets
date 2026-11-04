import { z } from "zod";
import type { MaintenanceMode } from "@prisma/client";
import type { BannerKey } from "@/lib/banner-config";
import type { SiteTheme } from "@/lib/site-theme";
import { parseDateTimeInTimezone } from "@/lib/utils";

/**
 * A site path or an http(s) address. Stricter than isValidSiteAnnouncementUrl: "//host" leaves the
 * site, so it is refused. Kept here because site-announcement.ts reaches the database and this
 * module also runs in the browser.
 */
function isAnnouncementLink(value: string): boolean {
  return (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("http://") || value.startsWith("https://");
}

/** The announcement bar as the Site page saves it. */
export const announcementInputSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().trim().max(500, "Keep the message under 500 characters."),
    linkLabel: z.string().trim().max(80, "Keep the link label under 80 characters."),
    linkUrl: z.string().trim().max(500),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && !value.text) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "Write a message, or turn the bar off." });
    }
    if (Boolean(value.linkLabel) !== Boolean(value.linkUrl)) {
      ctx.addIssue({
        code: "custom",
        path: [value.linkLabel ? "linkUrl" : "linkLabel"],
        message: "Add both a link label and a link, or leave both empty.",
      });
    }
    if (value.linkUrl && !isAnnouncementLink(value.linkUrl)) {
      ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "Start the link with /, http:// or https://." });
    }
  });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const SITE_PALETTES: ReadonlyArray<{ value: SiteTheme; label: string; description: string }> = [
  { value: "cedar", label: "Cedar and harvest", description: "Cream ground, cedar green and honey. The default." },
  { value: "evergreen", label: "Evergreen mist", description: "Cool gray ground with deep evergreen." },
  { value: "paper", label: "Paper forest", description: "White ground with forest green." },
  { value: "clay", label: "Soft clay", description: "Warm sand ground with clay accents." },
];

export const paletteSchema = z.enum(["cedar", "evergreen", "paper", "clay"]);

export const MAINTENANCE_MODES: ReadonlyArray<{ value: MaintenanceMode; label: string; description: string }> = [
  { value: "OFF", label: "Off", description: "The site is open to everyone." },
  {
    value: "MAINTENANCE_ADMIN_ONLY",
    label: "Closed to everyone but admins",
    description: "Visitors, vendors and organizers see the maintenance page.",
  },
  {
    value: "MAINTENANCE_PRIVILEGED",
    label: "Closed to visitors",
    description: "Admins, vendors and organizers can still sign in and use the site. Everyone else sees the maintenance page.",
  },
];

const maintenanceLinkSchema = z.object({
  label: z.string().trim().min(1, "Give the link a label.").max(100),
  url: z
    .string()
    .trim()
    .min(1, "Add the link.")
    .refine((v) => (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v), "Start the link with /, http:// or https://."),
});

export const maintenanceInputSchema = z.object({
  mode: z.enum(["OFF", "MAINTENANCE_ADMIN_ONLY", "MAINTENANCE_PRIVILEGED"]),
  messageTitle: z.string().trim().max(200),
  messageBody: z.string().max(20000),
  links: z.array(maintenanceLinkSchema).max(6, "Up to 6 links."),
  /** "2026-11-07T09:00" from a datetime-local field, in Pacific time; empty for none. */
  eta: z.string().trim(),
});

export type MaintenanceInput = z.infer<typeof maintenanceInputSchema>;

export const DEFAULT_MAINTENANCE_TITLE = "We'll be right back";

/** Rows with neither a label nor a link are dropped before validation. */
export function withoutBlankLinks(links: ReadonlyArray<{ label: string; url: string }>) {
  return links.filter((l) => l.label.trim() || l.url.trim());
}

/** A datetime-local value read as Pacific wall-clock time; null when empty or unreadable. */
export function parseMaintenanceEta(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^\d{2}:\d{2}/.test(timePart)) return null;
  const at = parseDateTimeInTimezone(datePart, timePart.slice(0, 5));
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Each banner named by the public page it shows on. */
export const BANNER_PLACES: Record<BannerKey, { label: string; detail: string }> = {
  hero: { label: "Homepage", detail: "The large picture at the top of the homepage." },
  farmersMarket: { label: "Markets page", detail: "The top of the markets list." },
  produce: { label: "About page", detail: "The top of the about page." },
  craftStall: { label: "Submit page", detail: "The top of the page where people send in events." },
  community: { label: "Sign-in pages", detail: "Beside the sign-in and sign-up forms." },
  localVendor: { label: "Vendors page", detail: "The vendors list and the vendor survey." },
  marketCrowd: { label: "Events pages", detail: "The events list, calendar, map and newsletter pages." },
  events: { label: "Event pages without a picture", detail: "Stands in for an event's own picture when it has none." },
};

export const bannerKeySchema = z.enum(["hero", "farmersMarket", "produce", "craftStall", "community", "localVendor", "marketCrowd", "events"]);

export const bannerImageUrlSchema = z
  .string()
  .trim()
  .refine((v) => v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/uploads/"), "That is not a picture link.");

export const focalPointSchema = z.object({
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
});

/** Keeps a focal point on the grid of whole percents inside the picture. */
export function clampFocal(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export type FeaturedWindow = "now" | "upcoming" | "ended";

/** Whether a featured entry is showing now, starts later, or has ended. */
export function featuredWindow(promotion: { startDate: Date; endDate: Date }, now: Date): FeaturedWindow {
  if (promotion.endDate < now) return "ended";
  if (promotion.startDate > now) return "upcoming";
  return "now";
}

/** Current entries first, then upcoming by start, then ended (newest first). */
export function splitFeatured<T extends { startDate: Date; endDate: Date }>(promotions: readonly T[], now: Date) {
  const current: T[] = [];
  const upcoming: T[] = [];
  const ended: T[] = [];
  for (const p of promotions) {
    const w = featuredWindow(p, now);
    if (w === "now") current.push(p);
    else if (w === "upcoming") upcoming.push(p);
    else ended.push(p);
  }
  upcoming.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  ended.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  return { current, upcoming, ended };
}
