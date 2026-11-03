import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => {
  const client = {
    adminMemo: { findUnique: mocks.findUnique, upsert: mocks.upsert, deleteMany: mocks.deleteMany },
    auditLog: { create: mocks.auditCreate },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { db: client };
});

import { bringBack, dismissPair, forgetPair, later, laterUntil } from "./memo";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockImplementation(async ({ create }: { create: object }) => ({ id: "memo1", ...create }));
  mocks.deleteMany.mockResolvedValue({ count: 1 });
});

describe("laterUntil", () => {
  it("is midnight Pacific tomorrow, or next Monday", () => {
    const tuesday = new Date("2026-11-03T18:40:00Z");
    expect(laterUntil("tomorrow", tuesday)).toEqual(new Date("2026-11-04T08:00:00Z"));
    expect(laterUntil("next-monday", tuesday)).toEqual(new Date("2026-11-09T08:00:00Z"));
    const monday = new Date("2026-11-09T18:00:00Z");
    expect(laterUntil("next-monday", monday)).toEqual(new Date("2026-11-16T08:00:00Z"));
  });

  it("lands on midnight on the days the clocks change", () => {
    expect(laterUntil("tomorrow", new Date("2026-10-31T18:00:00Z"))).toEqual(new Date("2026-11-01T07:00:00Z"));
    expect(laterUntil("tomorrow", new Date("2027-03-13T18:00:00Z"))).toEqual(new Date("2027-03-14T08:00:00Z"));
  });
});

describe("memos", () => {
  it("snoozes a decision by its key and audits it for undo", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const until = new Date("2026-11-04T08:00:00Z");
    await later("ready:2026-11-07", until, "admin", { decisionId: "d1", title: "Publish the 8 ready" });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind_key: { kind: "later", key: "ready:2026-11-07" } } })
    );
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      action: "SET_ADMIN_MEMO",
      targetType: "ADMIN_MEMO",
      targetId: "memo1",
      metadata: {
        previousValue: null,
        newValue: { kind: "later", key: "ready:2026-11-07", until: until.toISOString() },
        details: { decisionId: "d1", title: "Publish the 8 ready" },
      },
    });
  });

  it("stores a pair under its sorted key", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await dismissPair("not-same-event", "zeta", "alpha", "admin");
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ kind: "not-same-event", key: "alpha|zeta", until: null });
  });

  it("brings a snoozed decision back with an audit entry naming who did it", async () => {
    const until = new Date("2026-11-09T08:00:00Z");
    mocks.findUnique.mockResolvedValue({ id: "memo1", kind: "later", key: "trade-shows", until });
    await expect(bringBack("trade-shows", "admin", { title: "17 look like trade shows" })).resolves.toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: "memo1" } });
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      userId: "admin",
      action: "DELETE_ADMIN_MEMO",
      targetType: "ADMIN_MEMO",
      targetId: "memo1",
      metadata: {
        previousValue: { kind: "later", key: "trade-shows", until: until.toISOString() },
        newValue: null,
        details: { title: "17 look like trade shows" },
      },
    });
  });

  it("writes nothing when there is no memo to forget", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(forgetPair("not-same-event", "a", "b", "admin")).resolves.toBe(false);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
