import { db } from "@/lib/db";
import { formatDay, pacificDate, startOfPacificDay } from "@/lib/admin/format";

/** Published events that have not ended, soonest first, labeled for the event picker. */
export async function upcomingEventOptions(now: Date = new Date()) {
  const events = await db.event.findMany({
    where: { status: "PUBLISHED", deletedAt: null, endDate: { gte: startOfPacificDay(pacificDate(now)) } },
    select: { id: true, title: true, startDate: true },
    orderBy: [{ startDate: "asc" }, { title: "asc" }],
  });
  return events.map((e) => ({ id: e.id, title: e.title, when: formatDay(pacificDate(e.startDate), now) }));
}

export async function vendorOptions() {
  return db.vendorProfile.findMany({
    where: { deletedAt: null },
    select: { id: true, businessName: true },
    orderBy: { businessName: "asc" },
  });
}
