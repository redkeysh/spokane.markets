import { db } from "@/lib/db";
import { reportTargets } from "./report-targets";
import { personName } from "./words";

/** Items from the public that wait on the owner, as To do's decision kinds read them. */
export type PublicDecisionItems = {
  reviews: { id: string; createdAt: Date; rating: number; author: string; target: string | null }[];
  photos: { id: string; createdAt: Date; uploader: string; target: string | null }[];
  reports: { id: string; createdAt: Date; targetType: string; target: string; reason: string | null; severity: string }[];
  applications: { id: string; createdAt: Date; formType: string; name: string }[];
  messages: { id: string; createdAt: Date; name: string; subject: string | null }[];
  /** Markets waiting for verification; `requestedAt` is the market's last change. */
  markets: { id: string; name: string; requestedAt: Date; owner: string | null }[];
};

/** How many items the decision kinds file. */
export function publicItemCount(items: PublicDecisionItems | undefined): number {
  if (!items) return 0;
  return (
    items.reviews.length +
    items.photos.length +
    items.reports.length +
    items.applications.length +
    items.messages.length +
    items.markets.length
  );
}

/** The most items of one kind To do files; the inbox lists the rest. */
const PER_KIND = 100;

/** Waiting reviews, photos, reports, applications, unread messages and markets awaiting verification, oldest first. */
export async function loadPublicDecisionItems(): Promise<PublicDecisionItems> {
  const oldest = { createdAt: "asc" } as const;
  const [reviews, photos, reports, applications, messages, markets] = await Promise.all([
    db.review.findMany({
      where: { status: "PENDING" },
      orderBy: oldest,
      take: PER_KIND,
      select: {
        id: true,
        createdAt: true,
        rating: true,
        user: { select: { name: true, email: true } },
        event: { select: { title: true } },
        market: { select: { name: true } },
      },
    }),
    db.photo.findMany({
      where: { status: "PENDING" },
      orderBy: oldest,
      take: PER_KIND,
      select: {
        id: true,
        createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
        event: { select: { title: true } },
        market: { select: { name: true } },
      },
    }),
    db.report.findMany({
      where: { status: "PENDING" },
      orderBy: oldest,
      take: PER_KIND,
      select: { id: true, createdAt: true, targetType: true, targetId: true, reason: true, severity: true },
    }),
    db.application.findMany({
      where: { status: "PENDING" },
      orderBy: oldest,
      take: PER_KIND,
      select: { id: true, createdAt: true, name: true, form: { select: { type: true } } },
    }),
    db.contactMessage.findMany({
      where: { status: "PENDING" },
      orderBy: oldest,
      take: PER_KIND,
      select: { id: true, createdAt: true, name: true, subject: true },
    }),
    db.market.findMany({
      where: { deletedAt: null, verificationStatus: "PENDING" },
      orderBy: { updatedAt: "asc" },
      take: PER_KIND,
      select: { id: true, name: true, updatedAt: true, owner: { select: { name: true, email: true } } },
    }),
  ]);
  const targets = await reportTargets(reports);

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      rating: r.rating,
      author: personName(r.user, "Someone without an account"),
      target: r.event?.title.trim() ?? r.market?.name.trim() ?? null,
    })),
    photos: photos.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      uploader: personName(p.uploadedBy),
      target: p.event?.title.trim() ?? p.market?.name.trim() ?? null,
    })),
    reports: reports.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      targetType: r.targetType,
      target: targets.get(r.id)?.label ?? "a listing that is gone",
      reason: r.reason,
      severity: r.severity,
    })),
    applications: applications.map((a) => ({ id: a.id, createdAt: a.createdAt, formType: a.form.type, name: a.name })),
    messages: messages.map((m) => ({ id: m.id, createdAt: m.createdAt, name: m.name.trim() || "Someone", subject: m.subject?.trim() || null })),
    markets: markets.map((m) => ({ id: m.id, name: m.name.trim(), requestedAt: m.updatedAt, owner: m.owner ? personName(m.owner) : null })),
  };
}

/** Everything from the public that waits on the owner, for the To do dot: one count per table. */
export async function countPublicWaiting(): Promise<number> {
  const counts = await Promise.all([
    db.submission.count({ where: { status: "PENDING" } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.photo.count({ where: { status: "PENDING" } }),
    db.report.count({ where: { status: "PENDING" } }),
    db.application.count({ where: { status: "PENDING" } }),
    db.contactMessage.count({ where: { status: "PENDING" } }),
    db.market.count({ where: { deletedAt: null, verificationStatus: "PENDING" } }),
  ]);
  return counts.reduce((sum, n) => sum + n, 0);
}
