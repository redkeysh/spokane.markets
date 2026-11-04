import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  undoDecision: vi.fn(),
  revalidateAdmin: vi.fn(),
  loadHistoryPage: vi.fn(),
}));

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/undo", () => ({ undoDecision: mocks.undoDecision }));
vi.mock("@/app/admin/audit-log/history-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/admin/audit-log/history-query")>();
  return { ...actual, loadHistoryPage: mocks.loadHistoryPage };
});
vi.mock("@/lib/db", () => ({ db: {} }));

import { loadOlderHistory, undoHistoryDecision } from "./history";

const DECISION = "d_0b6c1d1e-8f43-4c55-9b6a-3d2a1c9e7f10";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin" } });
});

describe("undoHistoryDecision", () => {
  it("undoes the decision as the signed-in admin and refreshes the admin", async () => {
    mocks.undoDecision.mockResolvedValue({ ok: true, message: "Restored Emerge Holiday Market.", restored: [], refused: [], alreadyTold: [] });
    await expect(undoHistoryDecision(DECISION)).resolves.toEqual({ ok: true, message: "Restored Emerge Holiday Market." });
    expect(mocks.undoDecision).toHaveBeenCalledWith(DECISION, "admin");
    expect(mocks.revalidateAdmin).toHaveBeenCalledTimes(1);
  });

  it("passes on a refusal in the owner's words", async () => {
    mocks.undoDecision.mockResolvedValue({ ok: false, message: "This decision was already undone.", restored: [], refused: [], alreadyTold: [] });
    await expect(undoHistoryDecision(DECISION)).resolves.toEqual({ ok: false, message: "This decision was already undone." });
  });

  it("refuses ids that are not decision ids without touching anything", async () => {
    await expect(undoHistoryDecision("r123")).resolves.toEqual({ ok: false, message: "This change cannot be undone here." });
    expect(mocks.undoDecision).not.toHaveBeenCalled();
    expect(mocks.revalidateAdmin).not.toHaveBeenCalled();
  });

  it("requires an admin", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    await expect(undoHistoryDecision(DECISION)).rejects.toThrow("Unauthorized");
    expect(mocks.undoDecision).not.toHaveBeenCalled();
  });
});

describe("loadOlderHistory", () => {
  it("loads the page below the cursor with the filters of the query string", async () => {
    mocks.loadHistoryPage.mockResolvedValue({ lines: [], next: null });
    const cursor = { at: "2026-11-03T16:00:00.000Z", id: "r9" };
    await loadOlderHistory("what=merging&when=all", cursor);
    expect(mocks.loadHistoryPage).toHaveBeenCalledWith(
      { q: "", what: "merging", who: "anyone", when: "all" },
      "admin",
      { cursor }
    );
  });

  it("returns nothing for a cursor it cannot read", async () => {
    await expect(loadOlderHistory("", { at: "soon", id: "x" })).resolves.toEqual({ lines: [], next: null });
    expect(mocks.loadHistoryPage).not.toHaveBeenCalled();
  });
});
