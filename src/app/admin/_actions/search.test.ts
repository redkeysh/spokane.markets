import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  searchAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/search")>()),
  searchAdmin: mocks.searchAdmin,
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { searchAdminAction } from "./search";

const EMPTY = { query: "", weekend: null, groups: [] };

beforeEach(() => {
  mocks.requireAdminAction.mockReset().mockResolvedValue({ user: { id: "admin" } });
  mocks.searchAdmin.mockReset().mockImplementation(async (q: string) => ({ query: q, weekend: null, groups: [] }));
});

describe("searchAdminAction", () => {
  it("checks the admin before searching", async () => {
    mocks.requireAdminAction.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(searchAdminAction("kendall")).rejects.toThrow("Unauthorized");
    expect(mocks.searchAdmin).not.toHaveBeenCalled();
  });

  it("searches the trimmed query", async () => {
    await expect(searchAdminAction("  kendall   yards ")).resolves.toEqual({
      query: "kendall yards",
      weekend: null,
      groups: [],
    });
    expect(mocks.requireAdminAction).toHaveBeenCalledTimes(1);
    expect(mocks.searchAdmin).toHaveBeenCalledWith("kendall yards");
  });

  it("cuts a long query to 100 characters", async () => {
    await searchAdminAction("a".repeat(300));
    expect(mocks.searchAdmin).toHaveBeenCalledWith("a".repeat(100));
  });

  it.each([[42], [null], [{ q: "kendall" }], ["a".repeat(401)]])("answers nothing for %j", async (input) => {
    await expect(searchAdminAction(input)).resolves.toEqual(EMPTY);
    expect(mocks.searchAdmin).not.toHaveBeenCalled();
  });
});
