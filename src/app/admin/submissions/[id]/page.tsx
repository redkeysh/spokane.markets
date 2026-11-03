import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { AdminSubmissionReview } from "@/components/admin/admin-submission-review";
import type { AdminSubmissionReviewPayload } from "@/components/admin/admin-submission-review";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("admin.moderation.manage");
  const { id } = await params;

  const [submission, markets, tags, features, venues] = await Promise.all([
    db.submission.findUnique({
      where: { id },
      include: {
        createdEvent: { select: { id: true, slug: true } },
      },
    }),
    db.market.findMany({ select: { id: true, name: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
    db.feature.findMany({ select: { id: true, name: true } }),
    db.venue.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, address: true, city: true, state: true, zip: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!submission) notFound();

  const marketMap = new Map(markets.map((m) => [m.id, m.name]));
  const tagMap = new Map(tags.map((t) => [t.id, t.name]));
  const featureMap = new Map(features.map((f) => [f.id, f.name]));

  const payload: AdminSubmissionReviewPayload = {
    id: submission.id,
    eventTitle: submission.eventTitle,
    eventDescription: submission.eventDescription,
    submitterName: submission.submitterName,
    submitterEmail: submission.submitterEmail,
    scheduleDays: submission.scheduleDays,
    eventDate: submission.eventDate,
    eventTime: submission.eventTime,
    endDate: submission.endDate,
    endTime: submission.endTime,
    allDay: submission.allDay,
    venueName: submission.venueName,
    venueAddress: submission.venueAddress,
    venueCity: submission.venueCity,
    venueState: submission.venueState,
    venueZip: submission.venueZip,
    marketId: submission.marketId,
    marketName: submission.marketId ? marketMap.get(submission.marketId) ?? null : null,
    imageUrl: submission.imageUrl,
    tagIds: submission.tagIds ?? [],
    featureIds: submission.featureIds ?? [],
    tagNames: (submission.tagIds ?? []).map((tid) => tagMap.get(tid) ?? tid),
    featureNames: (submission.featureIds ?? []).map((fid) => featureMap.get(fid) ?? fid),
    notes: submission.notes,
    facebookUrl: submission.facebookUrl,
    instagramUrl: submission.instagramUrl,
    websiteUrl: submission.websiteUrl,
    status: submission.status,
    createdAt: submission.createdAt.toISOString(),
    createdEventId: submission.createdEventId,
    createdEventSlug: submission.createdEvent?.slug ?? null,
    reviewNotes: submission.reviewNotes,
  };

  return (
    <div className="space-y-6">
      <AdminSubmissionReview submission={payload} venues={venues} />
    </div>
  );
}
