import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auditFindMany: vi.fn(), queryRaw: vi.fn(), userFindMany: vi.fn(), undoability: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    auditLog: { findMany: mocks.auditFindMany },
    user: { findMany: mocks.userFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/admin/undo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/undo")>();
  return { ...actual, undoability: mocks.undoability };
});

import type { HistoryAuditRow } from "@/lib/admin/history";
import { historyPeople, loadHistoryPage } from "./history-query";
import { DEFAULT_HISTORY_FILTERS } from "./history-shared";

const NOW = new Date("2026-11-03T17:41:00Z");

function row(id: string, at: string, decisionId?: string, title = id): HistoryAuditRow {
  return {
    id,
    userId: "admin",
    action: "UPDATE_EVENT",
    targetType: "EVENT",
    targetId: `e-${id}`,
    createdAt: new Date(at),
    user: { name: "Hunter", email: "h@example.com" },
    metadata: {
      previousValue: { status: "PENDING" },
      newValue: { status: "PUBLISHED" },
      details: { title, ...(decisionId ? { decisionId } : {}) },
    },
  };
}

beforeEach(() => {
  mocks.auditFindMany.mockReset();
  mocks.queryRaw.mockReset();
  mocks.userFindMany.mockReset();
  mocks.undoability.mockReset();
  mocks.undoability.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, true])));
});

describe("loadHistoryPage", () => {
  it("returns lines newest first and no cursor when everything fit", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([row("b", "2026-11-03T17:00:00Z"), row("a", "2026-11-03T16:00:00Z")]);
    const page = await loadHistoryPage(DEFAULT_HISTORY_FILTERS, "admin", { limit: 2, now: NOW });
    expect(page.lines.map((l) => l.id)).toEqual(["b", "a"]);
    expect(page.next).toBeNull();
    expect(mocks.auditFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditFindMany.mock.calls[0][0]).toMatchObject({ take: 3, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  });

  it("completes a decision the page cuts through and starts the next page below all of its rows", async () => {
    mocks.auditFindMany
      .mockResolvedValueOnce([
        row("c", "2026-11-03T17:00:00Z"),
        row("d1-new", "2026-11-03T16:00:01Z", "d_1"),
        row("x", "2026-11-03T15:00:00Z"),
      ])
      .mockResolvedValueOnce([row("d1-old", "2026-11-03T16:00:00Z", "d_1")]);
    mocks.queryRaw.mockResolvedValueOnce([row("d1-new", "2026-11-03T16:00:01Z", "d_1"), row("d1-old", "2026-11-03T16:00:00Z", "d_1")]);
    const page = await loadHistoryPage(DEFAULT_HISTORY_FILTERS, "admin", { limit: 2, now: NOW });
    expect(page.lines.map((l) => l.id)).toEqual(["c", "d_1"]);
    expect(page.lines[1].sentence).toBe("You published 2 events.");
    expect(page.lines[1].canUndo).toBe(true);
    expect(page.next).toEqual({ at: "2026-11-03T16:00:00.000Z", id: "d1-old" });
    expect(mocks.undoability).toHaveBeenCalledWith(["d_1"]);
    expect(mocks.auditFindMany.mock.calls[1][0].where).toEqual({ id: { in: ["d1-old"] } });
  });

  it("asks only for rows older than the cursor", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([]);
    await loadHistoryPage({ ...DEFAULT_HISTORY_FILTERS, when: "all" }, "admin", {
      cursor: { at: "2026-11-03T16:00:00.000Z", id: "r9" },
      now: NOW,
    });
    expect(mocks.auditFindMany.mock.calls[0][0].where).toEqual({
      AND: [
        {},
        {},
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

describe("loadHistoryPage account lines", () => {
  it("names the person whose account changed and links them", async () => {
    mocks.auditFindMany.mockResolvedValueOnce([
      {
        ...row("a", "2026-11-03T17:00:00Z"),
        userId: "other",
        action: "UPDATE_USER",
        targetType: "USER",
        targetId: "u1",
        metadata: { previousValue: { role: "USER" }, newValue: { role: "ORGANIZER" } },
      },
    ]);
    mocks.userFindMany.mockResolvedValueOnce([{ id: "u1", name: "Jane Doe", email: "jane@example.com" }]);
    const page = await loadHistoryPage(DEFAULT_HISTORY_FILTERS, "admin", { now: NOW });
    expect(page.lines[0].sentence).toBe("Hunter changed the account of Jane Doe: role to organizer.");
    expect(page.lines[0].link).toEqual({ title: "Jane Doe", href: "/admin/users/u1" });
  });
});

describe("historyPeople", () => {
  it("lists the other admins by name, or email when they have none", async () => {
    mocks.userFindMany.mockResolvedValueOnce([
      { id: "u1", name: "Dana", email: "dana@example.com" },
      { id: "u2", name: null, email: "sam@example.com" },
    ]);
    expect(await historyPeople("me")).toEqual([
      { id: "u1", label: "Dana" },
      { id: "u2", label: "sam@example.com" },
    ]);
    expect(mocks.userFindMany.mock.calls[0][0].where).toEqual({ role: "ADMIN", id: { not: "me" } });
  });
});
