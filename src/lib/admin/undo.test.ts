import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
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
    venue: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    adminMemo: { findMany: mocks.memoFindMany, deleteMany: mocks.memoDeleteMany, updateMany: mocks.memoUpdateMany },
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
    mocks.auditFindMany.mockResolvedValueOnce(entries).mockResolvedValueOnce([]);
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

  it("restores nothing when a row changes between the check and the write", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([entry("1", "a"), entry("2", "b")]).mockResolvedValueOnce([]);
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
    mocks.auditFindMany.mockResolvedValueOnce([renamed]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "a", updatedAt: new Date(at), title: "Market Day" }]).mockResolvedValueOnce([]);
    const result = await undoDecision("d1", "admin");
    expect(result).toMatchObject({ ok: true });
    expect(mocks.eventUpdate.mock.calls[0][0].data).toMatchObject({ slug: "old-name" });
    expect(mocks.recordEventSlugChange).toHaveBeenCalledWith(expect.anything(), "a", "new-name", "old-name", { previousStatus: "PUBLISHED" });
  });

  it("restores nothing when the old web address has been taken since", async () => {
    const renamed = entry("1", "a", { meta: { previousValue: { slug: "old-name" }, newValue: { slug: "new-name" } } });
    mocks.auditFindMany.mockResolvedValueOnce([renamed]).mockResolvedValueOnce([]);
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
    mocks.auditFindMany.mockResolvedValueOnce([archived]).mockResolvedValueOnce([]);
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
    mocks.auditFindMany.mockResolvedValueOnce([approval]).mockResolvedValueOnce([]);
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

  it("deletes a memo the decision created, only while it is as the decision left it", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([memoEntry(null)]).mockResolvedValueOnce([]);
    mocks.memoFindMany.mockResolvedValueOnce([{ id: "memo1", createdAt: new Date(at), until: null }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: true });
    expect(mocks.memoDeleteMany).toHaveBeenCalledWith({ where: { id: "memo1", until: null } });
  });

  it("leaves a memo a newer decision changed", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([memoEntry("2026-11-04T08:00:00.000Z")]).mockResolvedValueOnce([]);
    mocks.memoFindMany.mockResolvedValueOnce([{ id: "memo1", createdAt: new Date(at), until: new Date("2026-11-09T08:00:00Z") }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: false, refused: [{ reason: "It changed after this decision." }] });
    expect(mocks.memoDeleteMany).not.toHaveBeenCalled();
  });

  it("refuses a decision already undone", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([entry("1", "a")]).mockResolvedValueOnce([{ metadata: { details: { undoOf: "d1" } } }]);
    await expect(undoDecision("d1", "admin")).resolves.toMatchObject({ ok: false, message: "This decision was already undone." });
  });
});

describe("newDecisionId", () => {
  it("is unique and prefixed", () => {
    expect(newDecisionId()).toMatch(/^d_[0-9a-f-]{36}$/);
    expect(newDecisionId()).not.toBe(newDecisionId());
  });
});
