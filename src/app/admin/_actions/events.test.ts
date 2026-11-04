import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class EventMutationError extends Error {}
  return {
    EventMutationError,
    requireAdminAction: vi.fn(async () => ({ user: { id: "admin-1" } })),
    revalidateAdmin: vi.fn(),
    newDecisionId: vi.fn(() => "d_test"),
    undoDecision: vi.fn(),
    setEventStatuses: vi.fn(),
    archiveEvents: vi.fn(),
    restoreEvents: vi.fn(),
    updateEventFields: vi.fn(),
    marketFindFirst: vi.fn(),
    venueFindFirst: vi.fn(),
    tagFindUnique: vi.fn(),
    eventFindMany: vi.fn(),
  };
});

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/undo", () => ({ newDecisionId: mocks.newDecisionId, undoDecision: mocks.undoDecision }));
vi.mock("@/lib/events/mutations", () => ({
  EventMutationError: mocks.EventMutationError,
  setEventStatuses: mocks.setEventStatuses,
  archiveEvents: mocks.archiveEvents,
  restoreEvents: mocks.restoreEvents,
  updateEventFields: mocks.updateEventFields,
}));
vi.mock("@/lib/db", () => ({
  db: {
    market: { findFirst: mocks.marketFindFirst },
    venue: { findFirst: mocks.venueFindFirst },
    tag: { findUnique: mocks.tagFindUnique },
    event: { findMany: mocks.eventFindMany },
  },
}));

import {
  addTagToEventsAction,
  archiveEventsAction,
  linkEventsToMarketAction,
  publishEventsAction,
  rejectEventsAction,
  restoreEventsAction,
  setEventsPlaceAction,
  undoEventsAction,
} from "./events";

const decision = { decisionId: "d_test", decisionKey: "events-list" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.newDecisionId.mockReturnValue("d_test");
});

describe("every action", () => {
  it("refuses anyone who is not an active admin before touching data", async () => {
    mocks.requireAdminAction.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(publishEventsAction({ ids: ["e1"] })).rejects.toThrow("Unauthorized");
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });

  it("rejects an empty selection without changing anything", async () => {
    expect(await archiveEventsAction({ ids: [] })).toMatchObject({ ok: false });
    expect(mocks.archiveEvents).not.toHaveBeenCalled();
    expect(mocks.revalidateAdmin).not.toHaveBeenCalled();
  });
});

describe("publishEventsAction", () => {
  it("publishes through setEventStatuses as one decision and refreshes the admin", async () => {
    mocks.setEventStatuses.mockResolvedValue({
      changed: ["e1", "e2"],
      alreadyThere: ["e3"],
      missing: ["e9"],
      refused: [{ id: "e4", reason: "Can't publish yet: no ZIP." }],
      notified: ["Dana"],
    });
    const result = await publishEventsAction({ ids: ["e1", "e2", "e3", "e4", "e9"] });
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1", "e2", "e3", "e4", "e9"], "PUBLISHED", "admin-1", decision);
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      decisionId: "d_test",
      changed: ["e1", "e2"],
      already: ["e3"],
      failed: [
        { id: "e4", reason: "Can't publish yet: no ZIP." },
        { id: "e9", reason: "It was archived or removed." },
      ],
      notified: ["Dana"],
    });
  });

  it("offers no undo when nothing changed", async () => {
    mocks.setEventStatuses.mockResolvedValue({ changed: [], alreadyThere: ["e1"], missing: [], refused: [], notified: [] });
    expect(await publishEventsAction({ ids: ["e1"] })).toMatchObject({ ok: true, decisionId: null });
  });

  it("returns a mutation's own message when the events changed underneath it", async () => {
    mocks.setEventStatuses.mockRejectedValue(new mocks.EventMutationError("Some of these events changed while they were being saved."));
    expect(await publishEventsAction({ ids: ["e1"] })).toEqual({
      ok: false,
      message: "Some of these events changed while they were being saved.",
    });
  });
});

describe("rejectEventsAction", () => {
  it("passes one reason for all", async () => {
    mocks.setEventStatuses.mockResolvedValue({ changed: ["e1"], alreadyThere: [], missing: [], refused: [], notified: [] });
    await rejectEventsAction({ ids: ["e1"], reason: "  Not a market or fair " });
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1"], "REJECTED", "admin-1", { ...decision, reason: "Not a market or fair" });
  });

  it("needs a reason", async () => {
    expect(await rejectEventsAction({ ids: ["e1"], reason: " " })).toEqual({ ok: false, message: "Pick a reason." });
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });
});

describe("archive and restore", () => {
  it("archives through archiveEvents", async () => {
    mocks.archiveEvents.mockResolvedValue({ archived: ["e1"], missing: ["e2"] });
    expect(await archiveEventsAction({ ids: ["e1", "e2"] })).toMatchObject({ ok: true, changed: ["e1"], already: ["e2"] });
    expect(mocks.archiveEvents).toHaveBeenCalledWith(["e1", "e2"], "admin-1", decision);
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("restores through restoreEvents", async () => {
    mocks.restoreEvents.mockResolvedValue({ restored: ["e1"] });
    expect(await restoreEventsAction({ ids: ["e1", "e2"] })).toMatchObject({ ok: true, changed: ["e1"], already: ["e2"], decisionId: "d_test" });
    expect(mocks.restoreEvents).toHaveBeenCalledWith(["e1", "e2"], "admin-1", decision);
  });
});

describe("field changes", () => {
  const events = [
    { id: "e1", marketId: null, venueId: "v1", tags: [{ id: "t1" }] },
    { id: "e2", marketId: "m1", venueId: "v2", tags: [{ id: "t2" }] },
  ];

  it("links each event that is not in the market yet, under one decision", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1" });
    mocks.eventFindMany.mockResolvedValue(events);
    const result = await linkEventsToMarketAction({ ids: ["e1", "e2", "e3"], marketId: "m1" });
    expect(mocks.updateEventFields).toHaveBeenCalledTimes(1);
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { marketId: "m1" }, "admin-1", decision);
    expect(result).toMatchObject({
      ok: true,
      changed: ["e1"],
      already: ["e2"],
      failed: [{ id: "e3", reason: "It was archived or removed." }],
    });
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("unlinks with a null market without looking one up", async () => {
    mocks.eventFindMany.mockResolvedValue(events);
    await linkEventsToMarketAction({ ids: ["e1", "e2"], marketId: null });
    expect(mocks.marketFindFirst).not.toHaveBeenCalled();
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e2", { marketId: null }, "admin-1", decision);
  });

  it("refuses an archived market", async () => {
    mocks.marketFindFirst.mockResolvedValue(null);
    expect(await linkEventsToMarketAction({ ids: ["e1"], marketId: "gone" })).toEqual({
      ok: false,
      message: "That market does not exist or is archived.",
    });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
  });

  it("moves events to an active place and reports the ones that could not move", async () => {
    mocks.venueFindFirst.mockResolvedValue({ id: "v2" });
    mocks.eventFindMany.mockResolvedValue(events);
    mocks.updateEventFields.mockRejectedValueOnce(new mocks.EventMutationError("Event not found or archived."));
    const result = await setEventsPlaceAction({ ids: ["e1", "e2"], venueId: "v2" });
    expect(result).toMatchObject({ ok: true, changed: [], already: ["e2"], failed: [{ id: "e1", reason: "Event not found or archived." }], decisionId: null });
  });

  it("refuses an archived place", async () => {
    mocks.venueFindFirst.mockResolvedValue(null);
    expect(await setEventsPlaceAction({ ids: ["e1"], venueId: "v9" })).toMatchObject({ ok: false });
  });

  it("adds a tag and keeps the tags each event has", async () => {
    mocks.tagFindUnique.mockResolvedValue({ id: "t2" });
    mocks.eventFindMany.mockResolvedValue(events);
    const result = await addTagToEventsAction({ ids: ["e1", "e2"], tagId: "t2" });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { tagIds: ["t1", "t2"] }, "admin-1", decision);
    expect(result).toMatchObject({ ok: true, changed: ["e1"], already: ["e2"] });
  });

  it("refuses a tag that does not exist", async () => {
    mocks.tagFindUnique.mockResolvedValue(null);
    expect(await addTagToEventsAction({ ids: ["e1"], tagId: "t9" })).toEqual({ ok: false, message: "That tag does not exist." });
  });

  it("reports an unexpected failure on one event and keeps the decision for the ones saved", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tagFindUnique.mockResolvedValue({ id: "t3" });
    mocks.eventFindMany.mockResolvedValue(events);
    mocks.updateEventFields.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("connection lost"));
    const result = await addTagToEventsAction({ ids: ["e1", "e2"], tagId: "t3" });
    expect(result).toEqual({
      ok: true,
      decisionId: "d_test",
      changed: ["e1"],
      already: [],
      failed: [{ id: "e2", reason: "It could not be saved. Try again." }],
      notified: [],
    });
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("undoEventsAction", () => {
  it("undoes the decision as the admin and refreshes", async () => {
    mocks.undoDecision.mockResolvedValue({ ok: true, message: "Restored 3.", restored: [], refused: [], alreadyTold: [] });
    expect(await undoEventsAction({ decisionId: "d_test" })).toEqual({ ok: true, message: "Restored 3." });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin-1");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("does nothing without a decision id", async () => {
    expect(await undoEventsAction({ decisionId: "" })).toEqual({ ok: false, message: "There is nothing to undo." });
    expect(mocks.undoDecision).not.toHaveBeenCalled();
  });
});
