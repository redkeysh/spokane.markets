import { db } from "@/lib/db";
import { publicItemHref } from "./model";
import { excerpt, personName } from "./words";

export type ReportTarget = {
  /** "Kendall Yards Night Market", or the review's opening words. */
  label: string;
  /** The listing on the public site, when it is still listed. */
  publicHref: string | null;
  /** Where the owner fixes it: the admin record, or the review in the inbox. */
  adminHref: string | null;
  /** True when the record is archived or deleted. */
  gone: boolean;
};

type ReportRow = { id: string; targetType: string; targetId: string };

/** The record each report is about, read in one query per record type. Keyed by report id. */
export async function reportTargets(reports: ReportRow[]): Promise<Map<string, ReportTarget>> {
  const ids = (type: string) => [...new Set(reports.filter((r) => r.targetType === type).map((r) => r.targetId))];
  const [events, markets, vendors, reviews] = await Promise.all([
    ids("EVENT").length
      ? db.event.findMany({ where: { id: { in: ids("EVENT") } }, select: { id: true, title: true, slug: true, deletedAt: true, status: true } })
      : [],
    ids("MARKET").length
      ? db.market.findMany({ where: { id: { in: ids("MARKET") } }, select: { id: true, name: true, slug: true, deletedAt: true } })
      : [],
    ids("VENDOR").length
      ? db.vendorProfile.findMany({ where: { id: { in: ids("VENDOR") } }, select: { id: true, businessName: true, slug: true, deletedAt: true } })
      : [],
    ids("REVIEW").length
      ? db.review.findMany({
          where: { id: { in: ids("REVIEW") } },
          select: { id: true, text: true, user: { select: { name: true, email: true } } },
        })
      : [],
  ]);
  const byKey = new Map<string, ReportTarget>();
  for (const e of events) {
    byKey.set(`EVENT:${e.id}`, {
      label: e.title.trim(),
      publicHref: !e.deletedAt && e.status === "PUBLISHED" ? `/events/${e.slug}` : null,
      adminHref: `/admin/events/${e.id}`,
      gone: !!e.deletedAt,
    });
  }
  for (const m of markets) {
    byKey.set(`MARKET:${m.id}`, {
      label: m.name.trim(),
      publicHref: m.deletedAt ? null : `/markets/${m.slug}`,
      adminHref: `/admin/markets/${m.id}`,
      gone: !!m.deletedAt,
    });
  }
  for (const v of vendors) {
    byKey.set(`VENDOR:${v.id}`, {
      label: v.businessName.trim(),
      publicHref: v.deletedAt ? null : `/vendors/${v.slug}`,
      adminHref: `/admin/vendors/${v.id}`,
      gone: !!v.deletedAt,
    });
  }
  for (const r of reviews) {
    const words = excerpt(r.text, 60);
    byKey.set(`REVIEW:${r.id}`, {
      label: words ? `the review "${words}"` : `a review by ${personName(r.user)}`,
      publicHref: null,
      adminHref: publicItemHref("review", r.id),
      gone: false,
    });
  }
  const out = new Map<string, ReportTarget>();
  for (const report of reports) {
    out.set(
      report.id,
      byKey.get(`${report.targetType}:${report.targetId}`) ?? { label: "a listing that is gone", publicHref: null, adminHref: null, gone: true }
    );
  }
  return out;
}
