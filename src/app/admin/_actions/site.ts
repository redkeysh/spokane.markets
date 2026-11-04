"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getBannerFocalXKey, getBannerFocalYKey, type BannerKey } from "@/lib/banner-config";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { normalizeSiteAnnouncement, SITE_ANNOUNCEMENT_CACHE_TAG } from "@/lib/site-announcement";
import { SITE_THEME_CACHE_TAG } from "@/lib/site-theme";
import {
  announcementInputSchema,
  bannerImageUrlSchema,
  bannerKeySchema,
  DEFAULT_MAINTENANCE_TITLE,
  focalPointSchema,
  maintenanceInputSchema,
  paletteSchema,
  parseMaintenanceEta,
  withoutBlankLinks,
  type AnnouncementInput,
  type MaintenanceInput,
} from "@/lib/site/settings-input";
import type { SiteTheme } from "@/lib/site-theme";

export type SiteActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Public pages that show a banner picture. */
const BANNER_PATHS = ["/", "/markets", "/events", "/events/calendar", "/events/map", "/vendors", "/submit", "/vendor-survey", "/newsletter", "/about"];

function firstErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function invalid(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): SiteActionResult {
  const fieldErrors = firstErrors(issues);
  return { ok: false, error: Object.values(fieldErrors)[0] ?? "Check the highlighted fields.", fieldErrors };
}

/** Returns the unexecuted Prisma query so $transaction can batch it. */
function upsertConfig(key: string, value: string) {
  return db.siteConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function saveAnnouncement(input: AnnouncementInput): Promise<SiteActionResult> {
  const session = await requireAdminAction();
  const parsed = announcementInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const announcement = normalizeSiteAnnouncement(parsed.data);
  await db.$transaction([
    upsertConfig("site_announcement_enabled", announcement.enabled ? "true" : "false"),
    upsertConfig("site_announcement_text", announcement.text),
    upsertConfig("site_announcement_link_label", announcement.linkLabel ?? ""),
    upsertConfig("site_announcement_link_url", announcement.linkUrl ?? ""),
  ]);
  await logAudit(session.user.id, "UPDATE_SITE_ANNOUNCEMENT", "SITE_CONFIG", "announcement", {
    newValue: announcement,
    details: { title: "the announcement bar" },
  });

  revalidateTag(SITE_ANNOUNCEMENT_CACHE_TAG, "max");
  revalidatePath("/", "layout");
  revalidateAdmin();
  return { ok: true };
}

export async function saveSitePalette(theme: SiteTheme): Promise<SiteActionResult> {
  const session = await requireAdminAction();
  const parsed = paletteSchema.safeParse(theme);
  if (!parsed.success) return { ok: false, error: "Pick one of the palettes." };

  const previous = await db.siteConfig.findUnique({ where: { key: "site_theme" }, select: { value: true } });
  await upsertConfig("site_theme", parsed.data);
  await logAudit(session.user.id, "UPDATE_SITE_THEME", "SITE_CONFIG", "site_theme", {
    previousValue: { theme: previous?.value ?? "cedar" },
    newValue: { theme: parsed.data },
    details: { title: "the color palette" },
  });

  revalidateTag(SITE_THEME_CACHE_TAG, "max");
  revalidatePath("/", "layout");
  revalidateAdmin();
  return { ok: true };
}

export async function saveMaintenance(input: MaintenanceInput): Promise<SiteActionResult> {
  const session = await requireAdminAction();
  const parsed = maintenanceInputSchema.safeParse({ ...input, links: withoutBlankLinks(input?.links ?? []) });
  if (!parsed.success) return invalid(parsed.error.issues);

  const { mode, messageTitle, messageBody, links, eta: rawEta } = parsed.data;
  const eta = parseMaintenanceEta(rawEta);
  if (rawEta && !eta) return { ok: false, error: "Pick a date and time for the return.", fieldErrors: { eta: "Pick a date and time for the return." } };

  const previous = await db.siteState.findUnique({ where: { id: "default" }, select: { mode: true } });
  const data = {
    mode,
    messageTitle: messageTitle || DEFAULT_MAINTENANCE_TITLE,
    messageBody: messageBody.trim() || null,
    links,
    eta,
    updatedByUserId: session.user.id,
  };
  await db.siteState.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  await logAudit(session.user.id, "UPDATE_MAINTENANCE_MODE", "SITE_STATE", "default", {
    previousValue: { mode: previous?.mode ?? "OFF" },
    newValue: { mode, messageTitle: data.messageTitle },
  });

  revalidatePath("/");
  revalidatePath("/maintenance");
  revalidateAdmin();
  return { ok: true };
}

function revalidateBanners() {
  for (const path of BANNER_PATHS) revalidatePath(path);
  revalidatePath("/auth", "layout");
  revalidatePath("/events/[slug]", "page");
  revalidateAdmin();
}

export async function setBannerImage(key: BannerKey, url: string): Promise<SiteActionResult> {
  const session = await requireAdminAction();
  const parsedKey = bannerKeySchema.safeParse(key);
  const parsedUrl = bannerImageUrlSchema.safeParse(url);
  if (!parsedKey.success) return { ok: false, error: "That banner does not exist." };
  if (!parsedUrl.success) return { ok: false, error: parsedUrl.error.issues[0]?.message ?? "That is not a picture link." };

  await db.$transaction([
    upsertConfig(parsedKey.data, parsedUrl.data),
    db.siteConfig.deleteMany({ where: { key: { in: [getBannerFocalXKey(parsedKey.data), getBannerFocalYKey(parsedKey.data)] } } }),
  ]);
  await logAudit(session.user.id, "UPDATE_BANNER", "SITE_CONFIG", parsedKey.data, { newValue: { url: parsedUrl.data } });
  revalidateBanners();
  return { ok: true };
}

export async function setBannerFocus(key: BannerKey, point: { x: number; y: number }): Promise<SiteActionResult> {
  const session = await requireAdminAction();
  const parsedKey = bannerKeySchema.safeParse(key);
  const parsedPoint = focalPointSchema.safeParse(point);
  if (!parsedKey.success) return { ok: false, error: "That banner does not exist." };
  if (!parsedPoint.success) return { ok: false, error: "The focal point must sit inside the picture." };

  await db.$transaction([
    upsertConfig(getBannerFocalXKey(parsedKey.data), String(parsedPoint.data.x)),
    upsertConfig(getBannerFocalYKey(parsedKey.data), String(parsedPoint.data.y)),
  ]);
  await logAudit(session.user.id, "UPDATE_BANNER", "SITE_CONFIG", parsedKey.data, { newValue: { focalX: parsedPoint.data.x, focalY: parsedPoint.data.y } });
  revalidateBanners();
  return { ok: true };
}

/** Back to the built-in picture, centered. */
export async function resetBanner(key: BannerKey): Promise<SiteActionResult> {
  const session = await requireAdminAction();
  const parsedKey = bannerKeySchema.safeParse(key);
  if (!parsedKey.success) return { ok: false, error: "That banner does not exist." };

  await db.siteConfig.deleteMany({
    where: { key: { in: [parsedKey.data, getBannerFocalXKey(parsedKey.data), getBannerFocalYKey(parsedKey.data)] } },
  });
  await logAudit(session.user.id, "RESET_BANNER", "SITE_CONFIG", parsedKey.data);
  revalidateBanners();
  return { ok: true };
}
