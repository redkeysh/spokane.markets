import { db } from "@/lib/db";

export type QueueType =
  | "submission"
  | "review"
  | "photo"
  | "report"
  | "application";

export type QueueSummary = {
  type: QueueType;
  count: number;
  oldestAt: Date | null;
};

export async function getQueuesSummary(): Promise<QueueSummary[]> {
  const [
    submissions,
    reviews,
    photos,
    reports,
    applications,
  ] = await Promise.all([
    db.submission.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { createdAt: true },
    }),
    db.review.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { createdAt: true },
    }),
    db.photo.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { createdAt: true },
    }),
    db.report.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { createdAt: true },
    }),
    db.application.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { createdAt: true },
    }),
  ]);

  const [subCount, revCount, photoCount, reportCount, appCount] =
    await Promise.all([
      db.submission.count({ where: { status: "PENDING" } }),
      db.review.count({ where: { status: "PENDING" } }),
      db.photo.count({ where: { status: "PENDING" } }),
      db.report.count({ where: { status: "PENDING" } }),
      db.application.count({ where: { status: "PENDING" } }),
    ]);

  return [
    {
      type: "submission",
      count: subCount,
      oldestAt: submissions[0]?.createdAt ?? null,
    },
    {
      type: "review",
      count: revCount,
      oldestAt: reviews[0]?.createdAt ?? null,
    },
    {
      type: "photo",
      count: photoCount,
      oldestAt: photos[0]?.createdAt ?? null,
    },
    {
      type: "report",
      count: reportCount,
      oldestAt: reports[0]?.createdAt ?? null,
    },
    {
      type: "application",
      count: appCount,
      oldestAt: applications[0]?.createdAt ?? null,
    },
  ];
}
