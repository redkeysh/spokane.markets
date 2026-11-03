import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  eventUpdate: vi.fn(),
  eventUpdateMany: vi.fn(),
  venueFindFirst: vi.fn(),
  marketFindFirst: vi.fn(),
  scheduleDeleteMany: vi.fn(),
  scheduleCreateMany: vi.fn(),
  auditCreate: vi.fn(),
  auditCreateMany: vi.fn(),
  notify: vi.fn(),
  revalidatePath: vi.fn(),
  eventSlugProblem: vi.fn(async (): Promise<string | null> => null),
  lockEventForSlugChange: vi.fn(async () => ({ slug: "market-day", status: "PUBLISHED" })),
  recordEventSlugChange: vi.fn(async () => true),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/events/status-notifications", () => ({ notifySubmitterOfStatusChange: mocks.notify }));
vi.mock("@/lib/events/slug", () => ({
  eventSlugProblem: mocks.eventSlugProblem,
  lockEventForSlugChange: mocks.lockEventForSlugChange,
  recordEventSlugChange: mocks.recordEventSlugChange,
}));
vi.mock("@/lib/db", () => {
  const client = {
    event: {
      findFirst: mocks.eventFindFirst,
      findMany: mocks.eventFindMany,
      update: mocks.eventUpdate,
      updateMany: mocks.eventUpdateMany,
    },
    venue: { findFirst: mocks.venueFindFirst },
    market: { findFirst: mocks.marketFindFirst },
    eventScheduleDay: { deleteMany: mocks.scheduleDeleteMany, createMany: mocks.scheduleCreateMany },
    auditLog: { create: mocks.auditCreate, createMany: mocks.auditCreateMany },
    $transaction: (arg: unknown) => (typeof arg === "function" ? arg(client) : Promise.all(arg as Promise<unknown>[])),
  };
  return { db: client };
});

import { archiveEvents, EventMutationError, notificationTarget, setEventStatuses, updateEventFields } from "./mutations";

const existing = {
  id: "e1",
  title: "Market Day",
  slug: "market-day",
  status: "PENDING",
  submittedById: "u1",
  description: null,
  venueId: "v1",
  marketId: null,
  websiteUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  imageUrl: null,
  showImageInList: true,
  imageFocalX: 50,
  imageFocalY: 50,
  complianceNotes: null,
  startDate: new Date("2026-11-07T18:00:00Z"),
  endDate: new Date("2026-11-07T22:00:00Z"),
  tags: [{ id: "t1" }],
  features: [],
  scheduleDays: [],
  submittedBy: { name: "Dana Smith", email: "dana@example.com", notificationPreference: null },
};

const uniqueViolation = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "e1",
    title: (data.title as string) ?? existing.title,
    slug: (data.slug as string) ?? existing.slug,
    status: (data.status as string) ?? existing.status,
  }));
  mocks.eventUpdateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  mocks.auditCreateMany.mockResolvedValue({ count: 1 });
});

describe("updateEventFields", () => {
  it("refuses a missing event and an archived place", async () => {
    mocks.eventFindFirst.mockResolvedValue(null);
    await expect(updateEventFields("e1", { title: "X" }, "admin")).rejects.toEqual(new EventMutationError("Event not found or archived."));
    mocks.eventFindFirst.mockResolvedValue(existing);
    mocks.venueFindFirst.mockResolvedValue(null);
    await expect(updateEventFields("e1", { venueId: "v9" }, "admin")).rejects.toThrow("That venue does not exist or is archived.");
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
  });

  it("publishes, tells the submitter, audits the previous value in the same transaction and revalidates the admin", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    const result = await updateEventFields("e1", { status: "PUBLISHED" }, "admin", { decisionId: "d1", auditMeta: { via: "mcp" } });
    expect(result).toEqual({
      id: "e1",
      title: "Market Day",
      slug: "market-day",
      status: "PUBLISHED",
      notified: ["Dana Smith"],
      previousSlug: "market-day",
      redirected: false,
    });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ submittedById: "u1", previousStatus: "PENDING", newStatus: "PUBLISHED" }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin",
        action: "UPDATE_EVENT",
        targetType: "EVENT",
        targetId: "e1",
        metadata: expect.objectContaining({
          previousValue: { status: "PENDING" },
          newValue: { status: "PUBLISHED" },
          details: expect.objectContaining({ decisionId: "d1", notified: ["Dana Smith"], title: "Market Day" }),
          via: "mcp",
        }),
      }),
    });
    expect(mocks.auditCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/market-day");
  });

  it("writes no audit entry and tells no one when the save fails", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    mocks.eventUpdate.mockRejectedValueOnce(new Error("connection lost"));
    await expect(updateEventFields("e1", { status: "PUBLISHED" }, "admin")).rejects.toThrow("connection lost");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("replaces schedule days and moves the start and end with them", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    await updateEventFields("e1", {
      scheduleDays: [
        { date: "2026-11-08", allDay: false, startTime: "10:00", endTime: "16:00" },
        { date: "2026-11-07", allDay: false, startTime: "09:00", endTime: "15:00" },
      ],
      tagIds: ["t2"],
    }, "admin");
    expect(mocks.scheduleDeleteMany).toHaveBeenCalledWith({ where: { eventId: "e1" } });
    expect(mocks.scheduleCreateMany).toHaveBeenCalled();
    const data = mocks.eventUpdate.mock.calls[0][0].data;
    expect(data.startDate).toEqual(new Date("2026-11-07T17:00:00.000Z"));
    expect(data.endDate).toEqual(new Date("2026-11-09T00:00:00.000Z"));
    expect(data.tags).toEqual({ set: [{ id: "t2" }] });
    const audit = mocks.auditCreate.mock.calls[0][0].data.metadata;
    expect(audit.previousValue).toMatchObject({ tagIds: ["t1"], scheduleDays: [] });
  });

  it("merges two days on one date into one schedule day", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    await updateEventFields("e1", {
      scheduleDays: [
        { date: "2026-11-07", allDay: false, startTime: "13:00", endTime: "17:00" },
        { date: "2026-11-07", allDay: false, startTime: "09:00", endTime: "12:00" },
      ],
    }, "admin");
    const rows = mocks.scheduleCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startTime: "09:00", endTime: "17:00", allDay: false });
    const { newValue } = mocks.auditCreate.mock.calls[0][0].data.metadata;
    expect(newValue.scheduleDays).toEqual([{ date: "2026-11-07", allDay: false, startTime: "09:00", endTime: "17:00" }]);
    expect(newValue.startDate).toBe("2026-11-07T17:00:00.000Z");
    expect(newValue.endDate).toBe("2026-11-08T01:00:00.000Z");
  });

  it("refuses a slug the slug rules reject, before writing anything", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    mocks.eventSlugProblem.mockResolvedValueOnce('"Other" already uses /events/taken.');
    await expect(updateEventFields("e1", { slug: "taken" }, "admin")).rejects.toEqual(
      new EventMutationError('"Other" already uses /events/taken.')
    );
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
  });

  it("records the old address the locked row really had and reports the redirect", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    mocks.lockEventForSlugChange.mockResolvedValueOnce({ slug: "renamed-meanwhile", status: "PUBLISHED" });
    mocks.eventUpdate.mockResolvedValue({ id: "e1", title: "Market Day", slug: "market-day-2026", status: "PENDING" });
    const result = await updateEventFields("e1", { slug: "market-day-2026" }, "admin");
    expect(mocks.recordEventSlugChange).toHaveBeenCalledWith(expect.anything(), "e1", "renamed-meanwhile", "market-day-2026", {
      previousStatus: "PUBLISHED",
    });
    expect(result).toMatchObject({ previousSlug: "renamed-meanwhile", redirected: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/renamed-meanwhile");
  });

  it("calls a unique violation a taken web address only when the slug changes", async () => {
    mocks.eventFindFirst.mockResolvedValue(existing);
    mocks.eventUpdate.mockRejectedValueOnce(uniqueViolation);
    await expect(updateEventFields("e1", { slug: "taken" }, "admin")).rejects.toEqual(
      new EventMutationError("Another event already uses this web address.")
    );
    mocks.eventUpdate.mockRejectedValueOnce(uniqueViolation);
    await expect(updateEventFields("e1", { title: "New" }, "admin")).rejects.toBe(uniqueViolation);
  });
});

describe("setEventStatuses", () => {
  const place = { name: "Hall", address: "1 Main St", city: "Spokane", state: "WA", zip: "99201", deletedAt: null };
  const rows = [
    { id: "a", title: "A", slug: "a", status: "PENDING", complianceNotes: null, submittedById: null, submittedBy: null, venue: place },
    { id: "b", title: "B", slug: "b", status: "PUBLISHED", complianceNotes: null, submittedById: null, submittedBy: null, venue: place },
    {
      id: "c",
      title: "C",
      slug: "c",
      status: "DRAFT",
      complianceNotes: "Called them.",
      submittedById: "u2",
      submittedBy: { name: null, email: "pat@example.com", notificationPreference: { organizerAlertsEnabled: true } },
      venue: place,
    },
  ];

  it("changes what is not there yet, in one transaction, and reports the rest", async () => {
    mocks.eventFindMany.mockResolvedValue(rows);
    const result = await setEventStatuses(["a", "b", "c", "gone"], "PUBLISHED", "admin", { decisionId: "d2", decisionKey: "ready:2026-11-07" });
    expect(result).toEqual({ changed: ["a", "c"], alreadyThere: ["b"], missing: ["gone"], refused: [], notified: ["pat"] });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] }, deletedAt: null, status: "PENDING" },
      data: expect.objectContaining({ status: "PUBLISHED" }),
    });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c"] }, deletedAt: null, status: "DRAFT" },
      data: expect.objectContaining({ status: "PUBLISHED" }),
    });
    const audit = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      action: "UPDATE_EVENT",
      targetId: "a",
      metadata: { previousValue: { status: "PENDING" }, newValue: { status: "PUBLISHED" }, details: { decisionId: "d2", decisionKey: "ready:2026-11-07" } },
    });
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it("refuses to publish an event whose place was archived or lost part of its address", async () => {
    mocks.eventFindMany.mockResolvedValue([
      rows[0],
      { ...rows[2], id: "d", venue: { ...place, name: "Old Hall", deletedAt: new Date("2026-11-03T17:00:00Z") } },
      { ...rows[2], id: "e", venue: { ...place, zip: " " } },
    ]);
    const result = await setEventStatuses(["a", "d", "e"], "PUBLISHED", "admin");
    expect(result.changed).toEqual(["a"]);
    expect(result.refused).toEqual([
      { id: "d", reason: "Its place, Old Hall, is archived." },
      { id: "e", reason: "Can't publish yet: no ZIP." },
    ]);
    expect(mocks.eventUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreateMany.mock.calls[0][0].data.map((e: { targetId: string }) => e.targetId)).toEqual(["a"]);
  });

  it("rejects with a reason in one write per previous note, appending the reason to the notes", async () => {
    mocks.eventFindMany.mockResolvedValue([rows[0], { ...rows[0], id: "a2" }, rows[2]]);
    await setEventStatuses(["a", "a2", "c"], "REJECTED", "admin", { reason: "Not a market or fair" });
    expect(mocks.eventUpdateMany).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.eventUpdateMany.mock.calls.map((call) => call[0]);
    expect(first.where).toEqual({ id: { in: ["a", "a2"] }, deletedAt: null, status: "PENDING", complianceNotes: null });
    expect(first.data.complianceNotes).toMatch(/^Rejected [A-Z][a-z]{2} \d{1,2}, \d{4}: Not a market or fair$/);
    expect(second.where).toMatchObject({ id: { in: ["c"] }, complianceNotes: "Called them." });
    expect(second.data.complianceNotes).toMatch(/^Called them\.\nRejected [A-Z][a-z]{2} \d{1,2}, \d{4}: Not a market or fair$/);
  });

  it("changes nothing when a row changed after it was read", async () => {
    mocks.eventFindMany.mockResolvedValue(rows);
    mocks.eventUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(setEventStatuses(["a", "c"], "PUBLISHED", "admin")).rejects.toBeInstanceOf(EventMutationError);
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("keeps a committed change when a notification fails", async () => {
    mocks.eventFindMany.mockResolvedValue([rows[2]]);
    mocks.notify.mockRejectedValueOnce(new Error("mail down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(setEventStatuses(["c"], "PUBLISHED", "admin")).resolves.toMatchObject({ changed: ["c"] });
    spy.mockRestore();
  });
});

describe("archiveEvents", () => {
  it("archives a twin as a duplicate of the kept event", async () => {
    mocks.eventFindFirst.mockResolvedValue({ id: "keep" });
    mocks.eventFindMany.mockResolvedValue([{ id: "twin", title: "Twin", slug: "twin", status: "PENDING", duplicateOfId: null }]);
    const result = await archiveEvents(["twin"], "admin", { duplicateOfId: "keep", decisionId: "d3" });
    expect(result).toEqual({ archived: ["twin"], missing: [] });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ duplicateOfId: "keep", deletedAt: expect.any(Date) }) })
    );
    expect(mocks.auditCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      action: "SOFT_DELETE_EVENT",
      metadata: { previousValue: { deletedAt: null, duplicateOfId: null }, newValue: { duplicateOfId: "keep" }, details: { decisionId: "d3" } },
    });
  });

  it("refuses to make an event a duplicate of itself", async () => {
    await expect(archiveEvents(["a"], "admin", { duplicateOfId: "a" })).rejects.toThrow("duplicate of itself");
  });
});

describe("notificationTarget", () => {
  it("names submitters with alerts on, once each", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { submittedById: "u1", submittedBy: { name: "Dana", email: "d@x", notificationPreference: null } },
      { submittedById: "u1", submittedBy: { name: "Dana", email: "d@x", notificationPreference: null } },
      { submittedById: "u2", submittedBy: { name: "Lee", email: "l@x", notificationPreference: { organizerAlertsEnabled: false } } },
    ]);
    await expect(notificationTarget(["a", "b", "c"])).resolves.toEqual(["Dana"]);
  });
});
