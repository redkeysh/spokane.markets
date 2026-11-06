import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auditFindMany: vi.fn(), queryRaw: vi.fn(), eventFindMany: vi.fn(), userFindMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    auditLog: { findMany: mocks.auditFindMany },
    event: { findMany: mocks.eventFindMany },
    user: { findMany: mocks.userFindMany },
    submission: { findMany: vi.fn() },
    market: { findMany: vi.fn() },
    venue: { findMany: vi.fn() },
    $queryRaw: mocks.queryRaw,
  },
}));

import { decisionSentence, getDoneToday } from "./done-today";
import { accountNames, describeAuditEntry, getHistory, type HistoryAuditRow } from "./history";

const row = (overrides: Partial<HistoryAuditRow> & { meta?: Record<string, unknown> }): HistoryAuditRow => ({
  id: "r1",
  userId: "admin",
  action: "UPDATE_EVENT",
  targetType: "EVENT",
  targetId: "e1",
  createdAt: new Date("2026-11-03T17:41:00Z"),
  user: { name: "Hunter", email: "hunter@example.com" },
  metadata: (overrides.meta ?? {
    previousValue: { status: "PENDING" },
    newValue: { status: "PUBLISHED" },
    details: { title: "Emerge Holiday Market", decisionId: "d1", decisionKey: "ready:2026-11-07" },
  }) as HistoryAuditRow["metadata"],
  ...overrides,
});

describe("describeAuditEntry", () => {
  it("speaks to the viewer about their own changes", () => {
    expect(describeAuditEntry(row({}), "admin")).toEqual({ sentence: "You published Emerge Holiday Market.", href: "/admin/events/e1" });
    expect(describeAuditEntry(row({}), "someone-else").sentence).toBe("Hunter published Emerge Holiday Market.");
  });

  it("names an API token and the reason for a rejection", () => {
    const viaToken = row({
      meta: {
        previousValue: { status: "PENDING" },
        newValue: { status: "REJECTED", complianceNotes: "Rejected Nov 2, 2026: Same as another listing" },
        details: { title: "Rebel Junk Holiday Market", reason: "Same as another listing" },
        via: "mcp",
        tokenName: "Claude on my laptop",
      },
    });
    expect(describeAuditEntry(viaToken, "admin").sentence).toBe(
      "Claude on my laptop (API token) rejected Rebel Junk Holiday Market: Same as another listing."
    );
  });

  it("lists the fields of an edit and falls back to the shared labels", () => {
    const edit = row({ meta: { previousValue: { title: "A", tagIds: [] }, newValue: { title: "B", tagIds: ["t"] }, details: { title: "B" } } });
    expect(describeAuditEntry(edit, "admin").sentence).toBe("You changed B: title, tags.");
    const merge = row({ action: "MERGE_VENUES", targetType: "VENUE", targetId: "v1", meta: { mergedIds: ["v2"] } });
    expect(describeAuditEntry(merge, "admin")).toEqual({ sentence: "You merged 1 place into another place.", href: "/admin/venues/v1" });
  });

  it("words a published submission and links to its event", () => {
    const approval = row({
      action: "UPDATE_SUBMISSION_STATUS",
      targetType: "SUBMISSION",
      targetId: "s1",
      meta: {
        previousValue: { status: "PENDING" },
        newValue: { status: "APPROVED", createdEventId: "e9" },
        details: { title: "Big Give", notified: ["Pat Lee"] },
      },
    });
    expect(describeAuditEntry(approval, "admin")).toEqual({ sentence: "You published Big Give.", href: "/admin/events/e9" });
    const untitled = row({ action: "UPDATE_SUBMISSION_STATUS", targetType: "SUBMISSION", targetId: "s2", meta: { newValue: { status: "REJECTED" } } });
    expect(describeAuditEntry(untitled, "admin").sentence).toBe("You rejected a submission.");
  });

  it("words a snoozed decision brought back", () => {
    const back = row({
      action: "DELETE_ADMIN_MEMO",
      targetType: "ADMIN_MEMO",
      targetId: "m1",
      meta: { previousValue: { kind: "later", key: "trade-shows", until: "2026-11-09T08:00:00.000Z" }, newValue: null, details: { title: "17 look like trade shows" } },
    });
    expect(describeAuditEntry(back, "admin")).toEqual({ sentence: "You brought back 17 look like trade shows.", href: null });
  });
});

describe("decisionSentence", () => {
  it("sums a batch publish for its weekend", () => {
    const entries = Array.from({ length: 8 }, (_, i) => row({ id: `r${i}`, targetId: `e${i}` }));
    expect(decisionSentence(entries, "admin")).toBe("You published 8 events for the weekend of Nov 7.");
  });

  it("describes keeping one twin and archiving the other", () => {
    const keep = row({ targetId: "keep", meta: { previousValue: { status: "PENDING" }, newValue: { status: "PUBLISHED" }, details: { title: "11th Annual Rebel Junk Holiday Market" } } });
    const twin = row({
      id: "r2",
      action: "SOFT_DELETE_EVENT",
      targetId: "twin",
      meta: { previousValue: { deletedAt: null }, newValue: { deletedAt: "x", duplicateOfId: "keep" }, details: { title: "Rebel Junk Holiday Market" } },
    });
    expect(decisionSentence([keep, twin], "admin")).toBe("You kept 11th Annual Rebel Junk Holiday Market, published it, and archived its twin.");
  });

  it("words a saved draft and its approval as one publish", () => {
    const save = row({
      action: "UPDATE_SUBMISSION",
      targetType: "SUBMISSION",
      targetId: "s1",
      meta: { previousValue: { venueCity: "SPOKANE" }, newValue: { venueCity: "Spokane" }, details: { title: "Big Give", decisionId: "d4" } },
    });
    const approval = row({
      id: "r2",
      action: "UPDATE_SUBMISSION_STATUS",
      targetType: "SUBMISSION",
      targetId: "s1",
      meta: { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED", createdEventId: "e9" }, details: { title: "Big Give", decisionId: "d4" } },
    });
    expect(decisionSentence([save, approval], "admin")).toBe("You edited and published Big Give.");
  });
});

describe("getDoneToday", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups today's entries by decision, newest first, with undo where the rows are unchanged", async () => {
    const batch = [row({ id: "a", targetId: "e1" }), row({ id: "b", targetId: "e2" })];
    const later = row({
      id: "c",
      targetId: "e3",
      createdAt: new Date("2026-11-03T18:00:00Z"),
      meta: { previousValue: { status: "PENDING" }, newValue: { status: "REJECTED" }, details: { title: "CardCon", decisionId: "d2" } },
    });
    const undone = row({ id: "u", action: "UNDO_DECISION", targetId: "e3", meta: { details: { undoOf: "d2" } } });
    mocks.auditFindMany.mockResolvedValue([...batch, later, undone]);
    mocks.eventFindMany.mockResolvedValue([
      { id: "e1", updatedAt: new Date("2026-11-03T17:41:00Z"), title: "Emerge Holiday Market" },
      { id: "e2", updatedAt: new Date("2026-11-03T17:41:00Z"), title: "Other" },
      { id: "e3", updatedAt: new Date("2026-11-03T18:30:00Z"), title: "CardCon" },
    ]);
    const items = await getDoneToday("admin", new Date("2026-11-03T19:00:00Z"));
    expect(items.map((i) => [i.decisionId, i.sentence, i.canUndo, i.undone])).toEqual([
      ["d2", "You rejected CardCon.", false, true],
      ["d1", "You published 2 events for the weekend of Nov 7.", true, false],
    ]);
    expect(mocks.auditFindMany.mock.calls[0][0].where).toEqual({ userId: "admin", createdAt: { gte: new Date("2026-11-03T08:00:00Z") } });
  });
});

describe("getHistory", () => {
  it("reads one record's entries newest first, as sentences", async () => {
    mocks.auditFindMany.mockReset();
    mocks.auditFindMany.mockResolvedValueOnce([row({})]);
    mocks.queryRaw.mockResolvedValueOnce([row({})]).mockResolvedValueOnce([]);
    mocks.eventFindMany.mockResolvedValue([{ id: "e1", updatedAt: new Date("2026-11-03T17:41:00Z"), title: "Emerge Holiday Market" }]);
    const entries = await getHistory({ targetType: "EVENT", targetId: "e1", limit: 3, viewerId: "admin" });
    expect(mocks.auditFindMany.mock.calls[0][0]).toMatchObject({ where: { targetType: "EVENT", targetId: "e1" }, take: 3 });
    expect(entries[0]).toMatchObject({
      sentence: "You published Emerge Holiday Market.",
      time: "9:41 am",
      timestamp: "Nov 3, 2026 at 9:41 am",
      decisionId: "d1",
      canUndo: true,
      previousValue: { status: "PENDING" },
      link: { title: "Emerge Holiday Market", href: "/admin/events/e1" },
      details: [{ label: "Status", before: "Pending", after: "Published" }],
    });
  });

  it("reads what the History filters let through, below a cursor", async () => {
    mocks.auditFindMany.mockReset();
    mocks.auditFindMany.mockResolvedValueOnce([]);
    const now = new Date("2026-11-03T17:41:00Z");
    await getHistory({
      viewerId: "admin",
      filters: { q: "", what: "merging", who: "you", when: "all" },
      cursor: { at: "2026-11-03T16:00:00.000Z", id: "r9" },
      now,
    });
    expect(mocks.auditFindMany.mock.calls[0][0].where).toEqual({
      AND: [
        {},
        { AND: [{ action: "MERGE_VENUES" }, { userId: "admin" }] },
        {
          OR: [
            { createdAt: { lt: new Date("2026-11-03T16:00:00.000Z") } },
            { createdAt: new Date("2026-11-03T16:00:00.000Z"), id: { lt: "r9" } },
          ],
        },
      ],
    });
  });
});

describe("accountNames", () => {
  beforeEach(() => mocks.userFindMany.mockReset());

  it("looks up each changed account once and names it by name, or email when there is none", async () => {
    const account = (id: string, targetId: string): HistoryAuditRow => ({
      ...row({ id }),
      action: "UPDATE_USER",
      targetType: "USER",
      targetId,
      metadata: { previousValue: { role: "USER" }, newValue: { role: "ORGANIZER" } },
    });
    mocks.userFindMany.mockResolvedValueOnce([
      { id: "u1", name: " Jane Doe ", email: "jane@example.com" },
      { id: "u2", name: null, email: "sam@example.com" },
    ]);
    const names = await accountNames([account("a", "u1"), account("b", "u1"), account("c", "u2"), row({ id: "d" })]);
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.userFindMany.mock.calls[0][0].where).toEqual({ id: { in: ["u1", "u2"] } });
    expect([...names]).toEqual([
      ["u1", "Jane Doe"],
      ["u2", "sam@example.com"],
    ]);
  });

  it("asks nothing when no account changed", async () => {
    expect((await accountNames([row({})])).size).toBe(0);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });
});
