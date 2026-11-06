import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  queryRaw: vi.fn(),
  auditCreate: vi.fn(),
  eventFindMany: vi.fn(),
  eventUpdate: vi.fn(),
  eventUpdateMany: vi.fn(),
  submissionFindMany: vi.fn(),
  submissionUpdate: vi.fn(),
  submissionUpdateMany: vi.fn(),
  memoFindMany: vi.fn(),
  memoDeleteMany: vi.fn(),
  memoUpdateMany: vi.fn(),
  venueFindMany: vi.fn(),
  venueUpdate: vi.fn(),
  venueUpdateMany: vi.fn(),
  neighborhoodFindMany: vi.fn(),
  neighborhoodUpdateMany: vi.fn(),
  revalidatePath: vi.fn(),
  eventSlugProblem: vi.fn(async (): Promise<string | null> => null),
  lockEventForSlugChange: vi.fn(async () => ({ slug: "new-name", status: "PUBLISHED" })),
  recordEventSlugChange: vi.fn(async () => true),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/events/slug", () => ({
  eventSlugProblem: mocks.eventSlugProblem,
  lockEventForSlugChange: mocks.lockEventForSlugChange,
  recordEventSlugChange: mocks.recordEventSlugChange,
}));
vi.mock("@/lib/db", () => {
  const client = {
    auditLog: { findMany: mocks.auditFindMany, create: mocks.auditCreate },
    event: { findMany: mocks.eventFindMany, update: mocks.eventUpdate, updateMany: mocks.eventUpdateMany },
    eventScheduleDay: { deleteMany: vi.fn(), createMany: vi.fn() },
    submission: { findMany: mocks.submissionFindMany, update: mocks.submissionUpdate, updateMany: mocks.submissionUpdateMany },
    market: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    venue: { findMany: mocks.venueFindMany, update: mocks.venueUpdate, updateMany: mocks.venueUpdateMany },
    adminMemo: { findMany: mocks.memoFindMany, deleteMany: mocks.memoDeleteMany, updateMany: mocks.memoUpdateMany },
    neighborhood: { findMany: mocks.neighborhoodFindMany, updateMany: mocks.neighborhoodUpdateMany },
    $queryRaw: mocks.queryRaw,
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { db: client };
});

import { newDecisionId, undoBlockers, undoDecision, type AuditRow } from "./undo";

const at = "2026-11-03T17:41:00.000Z";
const entry = (id: string, targetId: string, extra: Partial<AuditRow> & { meta?: Record<string, unknown> } = {}): AuditRow => ({
  id,
  action: "UPDATE_EVENT",
  targetType: "EVENT",
  targetId,
  createdAt: new Date(at),
  metadata: {
    previousValue: { status: "PENDING" },
    newValue: { status: "PUBLISHED" },
    details: { decisionId: "d1", at, title: `Event ${targetId}` },
    ...extra.meta,
  },
  ...extra,
});

const memoEntry = (until: string | null) =>
  entry("1", "memo1", {
    action: "SET_ADMIN_MEMO",
    targetType: "ADMIN_MEMO",
    meta: { previousValue: null, newValue: { kind: "later", key: "trade-shows", until }, details: { decisionId: "d1", title: "Trade shows" } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.submissionFindMany.mockResolvedValue([]);
  mocks.memoFindMany.mockResolvedValue([]);
  mocks.eventUpdateMany.mockResolvedValue({ count: 1 });
  mocks.submissionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.memoDeleteMany.mockResolvedValue({ count: 1 });
  mocks.memoUpdateMany.mockResolvedValue({ count: 1 });
  mocks.venueFindMany.mockResolvedValue([]);
  mocks.venueUpdateMany.mockResolvedValue({ count: 1 });
  mocks.neighborhoodFindMany.mockResolvedValue([]);
  mocks.neighborhoodUpdateMany.mockResolvedValue({ count: 1 });
});

describe("undoBlockers", () => {
  it("allows rows unchanged since the decision and refuses changed or missing ones", () => {
    const entries = [entry("1", "a"), entry("2", "b"), entry("3", "c")];
    const rows = new Map([
      ["EVENT:a", { updatedAt: new Date(at), title: "A" }],
      ["EVENT:b", { updatedAt: new Date("2026-11-03T18:00:00Z"), title: "B" }],
    ]);
    expect(undoBlockers(entries, rows)).toEqual([
      { targetType: "EVENT", targetId: "b", title: "B", reason: "It changed after this decision." },
      { targetType: "EVENT", targetId: "c", title: "Event c", reason: "It no longer exists." },
    ]);
  });

  it("refuses kinds it cannot reverse, and a merge recorded without the moved rows", () => {
    expect(undoBlockers([entry("1", "x", { action: "UPDATE_USER_ROLE", targetType: "USER" })], new Map())[0].reason).toBe(
      "This change cannot be undone here."
    );
    expect(undoBlockers([entry("1", "v", { action: "MERGE_VENUES", targetType: "VENUE" })], new Map())).toHaveLength(1);
  });

  it("checks the event a submission created even when an edit was saved before the approval", () => {
    const edit = entry("1", "s1", {
      action: "UPDATE_SUBMISSION",
      targetType: "SUBMISSION",
      meta: { previousValue: { venueName: "Old" }, newValue: { venueName: "New" }, details: { decisionId: "d1", at, title: "Big Give" } },
    });
    const approval = entry("2", "s1", {
      action: "UPDATE_SUBMISSION_STATUS",
      targetType: "SUBMISSION",
      meta: { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED", createdEventId: "e9" }, details: { decisionId: "d1", at } },
    });
    const rows = new Map([
      ["SUBMISSION:s1", { updatedAt: new Date(at), title: "Big Give" }],
      ["EVENT:e9", { updatedAt: new Date("2026-11-03T19:00:00Z"), title: "Big Give" }],
    ]);
    expect(undoBlockers([edit, approval], rows)).toEqual([
      { targetType: "EVENT", targetId: "e9", title: "Big Give", reason: "Its event changed after it was published." },
    ]);
  });

  it("refuses a target when any of its entries cannot be reversed", () => {
    const update = entry("1", "v1", { action: "UPDATE_VENUE", targetType: "VENUE", meta: { details: { decisionId: "d1", at } } });
    const merge = entry("2", "v1", { action: "MERGE_VENUES", targetType: "VENUE", meta: { details: { decisionId: "d1", at } } });
    const rows = new Map([["VENUE:v1", { updatedAt: new Date(at), title: "Pavilion" }]]);
    expect(undoBlockers([update, merge], rows)[0].reason).toBe("This change cannot be undone here.");
  });

  it("refuses to take back a market that dates from a later decision are in", () => {
    const made = entry("1", "m1", {
      action: "CREATE_MARKET",
      targetType: "MARKET",
      meta: { newValue: { name: "Rathdrum Market" }, details: { decisionId: "d1", at, title: "Rathdrum Market" } },
    });
    const linked = entry("2", "a", { meta: { previousValue: { marketId: null }, newValue: { marketId: "m1" }, details: { decisionId: "d1", at } } });
    const rows = (eventIds: string[]) =>
      new Map([
        ["MARKET:m1", { updatedAt: new Date(at), title: "Rathdrum Market", eventIds }],
        ["EVENT:a", { updatedAt: new Date(at), title: "A" }],
      ]);
    expect(undoBlockers([made, linked], rows(["a"]))).toEqual([]);
    expect(undoBlockers([made, linked], rows(["a", "later1", "later2"]))).toEqual([
      {
        targetType: "MARKET",
        targetId: "m1",
        title: "Rathdrum Market",
        reason: "2 dates added to it since would be left in an archived market.",
      },
    ]);
  });

  it("refuses a memo that a later decision moved, or that is gone", () => {
    const until = "2026-11-04T08:00:00.000Z";
    const same = new Map([["ADMIN_MEMO:memo1", { updatedAt: new Date(at), title: null, until: new Date(until) }]]);
    expect(undoBlockers([memoEntry(until)], same)).toEqual([]);
    const moved = new Map([["ADMIN_MEMO:memo1", { updatedAt: new Date(at), title: null, until: new Date("2026-11-09T08:00:00Z") }]]);
    expect(undoBlockers([memoEntry(until)], moved)[0].reason).toBe("It changed after this decision.");
    expect(undoBlockers([memoEntry(until)], new Map())[0].reason).toBe("It no longer exists.");
  });
});

describe("undoDecision", () => {
  it("restores the unchanged rows, leaves the changed one and says who was already told", async () => {
    const entries = [
      entry("1", "a", { meta: { details: { decisionId: "d1", at, title: "Emerge Holiday Market", notified: ["Dana Smith"] } } }),
      entry("2", "b"),
    ];
    mocks.queryRaw.mockResolvedValueOnce(entries).mockResolvedValueOnce([]);
    mocks.eventFindMany
      .mockResolvedValueOnce([
        { id: "a", updatedAt: new Date(at), title: "Emerge Holiday Market" },
        { id: "b", updatedAt: new Date("2026-11-03T19:00:00Z"), title: "Fall Bazaar" },
      ])
      .mockResolvedValueOnce([{ slug: "emerge" }]);

    const result = await undoDecision("d1", "admin");
    expect(result.restored).toEqual([{ targetType: "EVENT", targetId: "a", title: "Emerge Holiday Market" }]);
    expect(result.refused).toEqual([{ targetType: "EVENT", targetId: "b", title: "Fall Bazaar", reason: "It changed after this decision." }]);
    expect(result.alreadyTold).toEqual(["Dana Smith"]);
    expect(result.message).toBe(
      "Restored Emerge Holiday Market. Left as it is: Fall Bazaar (it changed after this decision). Dana Smith was already told."
    );
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({
      where: { id: "a", updatedAt: { lte: new Date(Date.parse(at) + 2000) } },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.eventUpdate).toHaveBeenCalledWith({ where: { id: "a" }, data: expect.objectContaining({ status: "PENDING" }) });
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      action: "UNDO_DECISION",
      targetId: "a",
      metadata: { newValue: { status: "PENDING" }, details: { undoOf: "d1" } },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/emerge");
  });

  it("archives the dates a decision created", async () => {
    const created = entry("1", "n1", {
      action: "CREATE_EVENT",
      meta: { previousValue: null, newValue: { status: "DRAFT", marketId: "m1" }, details: { decisionId: "d1", at, title: "Night Market" } },
    });
    mocks.queryRaw.mockResolvedValueOnce([created]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "n1", updatedAt: new Date(at), title: "Night Market" }]).mockResolvedValueOnce([]);
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: true, restored: [{ targetType: "EVENT", targetId: "n1", title: "Night Market" }] });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({
      where: { id: "n1", updatedAt: { lte: new Date(Date.parse(at) + 2000) } },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
    });
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
  });

  it("restores nothing when a row changes between the check and the write", async () => {
    mocks.queryRaw.mockResolvedValueOnce([entry("1", "a"), entry("2", "b")]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([
      { id: "a", updatedAt: new Date(at), title: "Emerge Holiday Market" },
      { id: "b", updatedAt: new Date(at), title: "Fall Bazaar" },
    ]);
    mocks.eventUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: false, restored: [], message: "Nothing was restored: Fall Bazaar changed while undoing. Try again." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("puts an old web address back and keeps a redirect from the newer one", async () => {
    const renamed = entry("1", "a", { meta: { previousValue: { slug: "old-name" }, newValue: { slug: "new-name" } } });
    mocks.queryRaw.mockResolvedValueOnce([renamed]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "a", updatedAt: new Date(at), title: "Market Day" }]).mockResolvedValueOnce([]);
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: true });
    expect(mocks.eventUpdate.mock.calls[0][0].data).toMatchObject({ slug: "old-name" });
    expect(mocks.recordEventSlugChange).toHaveBeenCalledWith(expect.anything(), "a", "new-name", "old-name", { previousStatus: "PUBLISHED" });
  });

  it("restores nothing when the old web address has been taken since", async () => {
    const renamed = entry("1", "a", { meta: { previousValue: { slug: "old-name" }, newValue: { slug: "new-name" } } });
    mocks.queryRaw.mockResolvedValueOnce([renamed]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "a", updatedAt: new Date(at), title: "Market Day" }]);
    mocks.eventSlugProblem.mockResolvedValueOnce('"Other" already uses /events/old-name.');
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: false, restored: [] });
    expect(result.message).toContain("no longer free");
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
  });

  it("restores archive state and the duplicate link of a kept twin", async () => {
    const archived = entry("1", "twin", {
      action: "SOFT_DELETE_EVENT",
      meta: { previousValue: { deletedAt: null, duplicateOfId: null }, newValue: { deletedAt: at, duplicateOfId: "keep" } },
    });
    mocks.queryRaw.mockResolvedValueOnce([archived]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "twin", updatedAt: new Date(at), title: "Twin" }]).mockResolvedValueOnce([]);
    await undoDecision("d1", "admin");
    expect(mocks.eventUpdate.mock.calls[0][0].data).toMatchObject({ deletedAt: null, duplicateOfId: null });
  });

  it("puts an approved submission back and archives the event it created", async () => {
    const approval = entry("1", "s1", {
      action: "UPDATE_SUBMISSION_STATUS",
      targetType: "SUBMISSION",
      meta: { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED", createdEventId: "e9" }, details: { decisionId: "d1" } },
    });
    mocks.queryRaw.mockResolvedValueOnce([approval]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "e9", updatedAt: new Date(at), title: "Big Give" }]).mockResolvedValueOnce([]);
    mocks.submissionFindMany.mockResolvedValueOnce([{ id: "s1", updatedAt: new Date(at), eventTitle: "Big Give" }]);
    const result = await undoDecision("d1", "admin");
    expect(result.ok).toBe(true);
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({
      where: { id: "e9", updatedAt: { lte: expect.any(Date) } },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(mocks.submissionUpdate.mock.calls[0][0].data).toMatchObject({
      status: "PENDING",
      reviewer: { disconnect: true },
      createdEvent: { disconnect: true },
    });
  });

  it("leaves an edited and published submission whole when its event changed since", async () => {
    const edit = entry("1", "s1", {
      action: "UPDATE_SUBMISSION",
      targetType: "SUBMISSION",
      meta: { previousValue: { venueName: "Old" }, newValue: { venueName: "New" }, details: { decisionId: "d1", at } },
    });
    const approval = entry("2", "s1", {
      action: "UPDATE_SUBMISSION_STATUS",
      targetType: "SUBMISSION",
      meta: { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED", createdEventId: "e9" }, details: { decisionId: "d1", at } },
    });
    mocks.queryRaw.mockResolvedValueOnce([edit, approval]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "e9", updatedAt: new Date("2026-11-03T19:00:00Z"), title: "Big Give" }]);
    mocks.submissionFindMany.mockResolvedValueOnce([{ id: "s1", updatedAt: new Date(at), eventTitle: "Big Give" }]);
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: false, restored: [], refused: [{ targetType: "EVENT", targetId: "e9" }] });
    expect(mocks.submissionUpdate).not.toHaveBeenCalled();
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
  });

  it("deletes a memo the decision created, only while it is as the decision left it", async () => {
    mocks.queryRaw.mockResolvedValueOnce([memoEntry(null)]).mockResolvedValueOnce([]);
    mocks.memoFindMany.mockResolvedValueOnce([{ id: "memo1", createdAt: new Date(at), until: null }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: true });
    expect(mocks.memoDeleteMany).toHaveBeenCalledWith({ where: { id: "memo1", until: null } });
  });

  it("leaves a memo a newer decision changed", async () => {
    mocks.queryRaw.mockResolvedValueOnce([memoEntry("2026-11-04T08:00:00.000Z")]).mockResolvedValueOnce([]);
    mocks.memoFindMany.mockResolvedValueOnce([{ id: "memo1", createdAt: new Date(at), until: new Date("2026-11-09T08:00:00Z") }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: false, refused: [{ reason: "It changed after this decision." }] });
    expect(mocks.memoDeleteMany).not.toHaveBeenCalled();
  });

  it("takes a neighborhood it added back off the area filter and clears it from the places", async () => {
    const added = entry("1", "n1", {
      action: "CREATE_NEIGHBORHOOD",
      targetType: "NEIGHBORHOOD",
      meta: { previousValue: null, newValue: { slug: "post-falls", label: "Post Falls", isActive: true }, details: { decisionId: "d1", at, title: "Post Falls" } },
    });
    const set = entry("2", "v1", {
      action: "UPDATE_VENUE",
      targetType: "VENUE",
      meta: { previousValue: { neighborhood: null }, newValue: { neighborhood: "post-falls" }, details: { decisionId: "d1", at, title: "Post Falls City Hall" } },
    });
    mocks.queryRaw.mockResolvedValueOnce([added, set]).mockResolvedValueOnce([]);
    mocks.neighborhoodFindMany.mockResolvedValueOnce([{ id: "n1", updatedAt: new Date(at), label: "Post Falls" }]);
    mocks.venueFindMany.mockResolvedValueOnce([{ id: "v1", updatedAt: new Date(at), name: "Post Falls City Hall" }]);
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: true, refused: [] });
    expect(mocks.neighborhoodUpdateMany).toHaveBeenCalledWith({ where: { id: "n1", updatedAt: { lte: expect.any(Date) } }, data: { isActive: false } });
    expect(mocks.venueUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { neighborhood: null } });
  });

  it("turns a neighborhood it turned on back off", async () => {
    const turnedOn = entry("1", "n1", {
      action: "UPDATE_NEIGHBORHOOD",
      targetType: "NEIGHBORHOOD",
      meta: { previousValue: { isActive: false }, newValue: { isActive: true }, details: { decisionId: "d1", at, title: "Post Falls" } },
    });
    mocks.queryRaw.mockResolvedValueOnce([turnedOn]).mockResolvedValueOnce([]);
    mocks.neighborhoodFindMany.mockResolvedValueOnce([{ id: "n1", updatedAt: new Date(at), label: "Post Falls" }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: true });
    expect(mocks.neighborhoodUpdateMany).toHaveBeenCalledWith({ where: { id: "n1", updatedAt: { lte: expect.any(Date) } }, data: { isActive: false } });
  });

  it("refuses a decision already undone", async () => {
    mocks.queryRaw.mockResolvedValueOnce([entry("1", "a")]).mockResolvedValueOnce([{ metadata: { details: { undoOf: "d1" } } }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: false, message: "This decision was already undone." });
  });
});

describe("newDecisionId", () => {
  it("is unique and prefixed", () => {
    expect(newDecisionId()).toMatch(/^d_[0-9a-f-]{36}$/);
    expect(newDecisionId()).not.toBe(newDecisionId());
  });
});
