import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class EventMutationError extends Error {}
  return {
    EventMutationError,
    requireAdminAction: vi.fn(),
    revalidateAdmin: vi.fn(),
    updateEventFields: vi.fn(),
    setEventStatuses: vi.fn(),
    archiveEvents: vi.fn(),
    undoDecision: vi.fn(),
    later: vi.fn(),
    laterUntil: vi.fn(),
    bringBack: vi.fn(),
    dismissPair: vi.fn(),
    getHistory: vi.fn(),
    publishSubmission: vi.fn(),
    saveSubmissionDraft: vi.fn(),
    rejectSubmission: vi.fn(),
    eventFindMany: vi.fn(),
    submissionFindUnique: vi.fn(),
    userFindUnique: vi.fn(),
    tagCount: vi.fn(),
    featureCount: vi.fn(),
    venueOutcome: vi.fn(),
  };
});

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/undo", () => ({ newDecisionId: () => "d_test", undoDecision: mocks.undoDecision }));
vi.mock("@/lib/events/mutations", () => ({
  EventMutationError: mocks.EventMutationError,
  updateEventFields: mocks.updateEventFields,
  setEventStatuses: mocks.setEventStatuses,
  archiveEvents: mocks.archiveEvents,
}));
vi.mock("@/lib/admin/memo", () => ({
  later: mocks.later,
  laterUntil: mocks.laterUntil,
  bringBack: mocks.bringBack,
  dismissPair: mocks.dismissPair,
}));
vi.mock("@/lib/admin/history", () => ({ getHistory: mocks.getHistory }));
vi.mock("@/lib/submissions/draft", () => ({ publishSubmission: mocks.publishSubmission, saveSubmissionDraft: mocks.saveSubmissionDraft }));
vi.mock("@/lib/submission-approval", () => ({ rejectSubmission: mocks.rejectSubmission }));
vi.mock("@/lib/submissions/venue-outcome", () => ({ venueOutcome: mocks.venueOutcome }));
vi.mock("@/lib/db", () => ({
  db: {
    event: { findMany: mocks.eventFindMany },
    submission: { findUnique: mocks.submissionFindUnique },
    user: { findUnique: mocks.userFindUnique },
    tag: { count: mocks.tagCount },
    feature: { count: mocks.featureCount },
  },
}));

import {
  archiveDecisionEvents,
  bringBackDecision,
  checkSubmissionPlace,
  keepOneCopy,
  markDifferentEvents,
  publishEvents,
  publishSubmissionDecision,
  recordHistory,
  rejectEvents,
  rejectSubmissionDecision,
  saveEventEdits,
  saveSubmissionPlace,
  snoozeDecision,
  undoTodoDecision,
} from "./todo";

const REF = { decisionId: "d_test", decisionKey: "ready:2026-11-07" };
const STATUS = (changed: string[], extra: Partial<{ alreadyThere: string[]; refused: { id: string; reason: string }[]; notified: string[] }> = {}) => ({
  changed,
  alreadyThere: [],
  missing: [],
  refused: [],
  notified: [],
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin1" } });
});

describe("publishEvents", () => {
  it("saves held edits of the decision's rows, then publishes them all as one decision", async () => {
    mocks.setEventStatuses.mockResolvedValue(STATUS(["e1", "e2"], { notified: ["Dana"] }));
    const edits = { scheduleDays: [{ date: "2026-12-12", allDay: false, startTime: "10:00", endTime: "16:00" }] };
    const result = await publishEvents({ decisionKey: REF.decisionKey, eventIds: ["e1", "e2"], edits: { e1: edits, other: { imageUrl: null } } });

    expect(mocks.updateEventFields).toHaveBeenCalledTimes(1);
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", edits, "admin1", REF);
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1", "e2"], "PUBLISHED", "admin1", REF);
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, decisionId: "d_test", changed: ["e1", "e2"], alreadyThere: [], refused: [], notified: ["Dana"] });
  });

  it("refuses hours that close before they open without writing anything", async () => {
    const result = await publishEvents({
      decisionKey: "single:e1",
      eventIds: ["e1"],
      edits: { e1: { scheduleDays: [{ date: "2026-11-20", allDay: false, startTime: "10:00", endTime: "08:00" }] } },
    });
    expect(result).toEqual({ ok: false, error: "A day closes before it opens." });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });

  it("returns no decision to undo when nothing changed", async () => {
    mocks.setEventStatuses.mockResolvedValue(STATUS([], { alreadyThere: ["e1"] }));
    const result = await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"] });
    expect(result).toMatchObject({ ok: true, decisionId: null, alreadyThere: ["e1"] });
  });

  it("says so when the session is not an admin, and changes nothing", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    const result = await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"] });
    expect(result).toEqual({ ok: false, error: "Sign in as an admin to do this." });
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });

  it("passes a mutation error's message through", async () => {
    mocks.updateEventFields.mockRejectedValue(new mocks.EventMutationError("Event not found or archived."));
    const result = await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"], edits: { e1: { imageUrl: "https://x.test/a.jpg" } } });
    expect(result).toEqual({ ok: false, error: "Event not found or archived." });
    expect(mocks.undoDecision).not.toHaveBeenCalled();
  });

  it("saves a new title, place, tags and features with the publish", async () => {
    mocks.tagCount.mockResolvedValue(2);
    mocks.featureCount.mockResolvedValue(1);
    mocks.setEventStatuses.mockResolvedValue(STATUS(["e1"]));
    const edits = { title: "  North Idaho's Cowboy Christmas ", venueId: "v2", tagIds: ["t1", "t2"], featureIds: ["f1"] };
    const result = await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"], edits: { e1: edits } });
    expect(mocks.updateEventFields).toHaveBeenCalledWith(
      "e1",
      { title: "North Idaho's Cowboy Christmas", venueId: "v2", tagIds: ["t1", "t2"], featureIds: ["f1"] },
      "admin1",
      { decisionId: "d_test", decisionKey: "single:e1" }
    );
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", changed: ["e1"] });
  });

  it("refuses an empty title and tags that no longer exist without writing anything", async () => {
    expect(await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"], edits: { e1: { title: "   " } } })).toEqual({
      ok: false,
      error: "The title cannot be empty.",
    });
    mocks.tagCount.mockResolvedValue(1);
    expect(await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"], edits: { e1: { tagIds: ["t1", "gone"] } } })).toEqual({
      ok: false,
      error: "A chosen tag no longer exists. Reload and choose again.",
    });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });

  it("undoes the saved edits when the publish itself fails", async () => {
    mocks.setEventStatuses.mockRejectedValue(new Error("connection reset"));
    const result = await publishEvents({ decisionKey: "single:e1", eventIds: ["e1"], edits: { e1: { imageUrl: "https://x.test/a.jpg" } } });
    expect(mocks.updateEventFields).toHaveBeenCalledTimes(1);
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin1");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Something went wrong. Try again." });
  });

  it("undoes the first row's edits when saving the second row's edits fails", async () => {
    mocks.updateEventFields.mockResolvedValueOnce({}).mockRejectedValueOnce(new mocks.EventMutationError("That venue does not exist or is archived."));
    const result = await publishEvents({
      decisionKey: "ready:2026-11-07",
      eventIds: ["e1", "e2"],
      edits: { e1: { imageUrl: "https://x.test/a.jpg" }, e2: { venueId: "gone" } },
    });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin1");
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "That venue does not exist or is archived." });
  });
});

describe("rejectEvents and archiveDecisionEvents", () => {
  it("rejects every row with one reason", async () => {
    mocks.setEventStatuses.mockResolvedValue(STATUS(["e1", "e2"]));
    const result = await rejectEvents({ decisionKey: "trade-shows", eventIds: ["e1", "e2"], reason: "Not a market or fair" });
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1", "e2"], "REJECTED", "admin1", {
      decisionId: "d_test",
      decisionKey: "trade-shows",
      reason: "Not a market or fair",
    });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", changed: ["e1", "e2"] });
  });

  it("undoes the saved edits when the reject fails", async () => {
    mocks.setEventStatuses.mockRejectedValue(new mocks.EventMutationError("Event not found or archived."));
    const result = await rejectEvents({
      decisionKey: "single:e1",
      eventIds: ["e1"],
      reason: "Already happened",
      edits: { e1: { title: "Cowboy Christmas" } },
    });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin1");
    expect(result).toEqual({ ok: false, error: "Event not found or archived." });
  });

  it("asks for a reason", async () => {
    const result = await rejectEvents({ decisionKey: "trade-shows", eventIds: ["e1"], reason: "  " });
    expect(result).toEqual({ ok: false, error: "Choose a reason." });
  });

  it("archives rows that already happened", async () => {
    mocks.archiveEvents.mockResolvedValue({ archived: ["a", "b", "c"], missing: [] });
    const result = await archiveDecisionEvents({ decisionKey: "gone", eventIds: ["a", "b", "c"] });
    expect(mocks.archiveEvents).toHaveBeenCalledWith(["a", "b", "c"], "admin1", { decisionId: "d_test", decisionKey: "gone" });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", archived: ["a", "b", "c"] });
  });
});

describe("keepOneCopy", () => {
  const input = { decisionKey: "twins:a|b", keepId: "a", archiveIds: ["b"], publish: true, takeFromOthers: true };
  const ref = { decisionId: "d_test", decisionKey: "twins:a|b" };

  it("takes the other copy's tags and features, publishes the kept one and archives the other as its duplicate", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "a", tags: [{ id: "t1" }], features: [] },
      { id: "b", tags: [{ id: "t1" }, { id: "t2" }], features: [{ id: "f1" }] },
    ]);
    mocks.setEventStatuses.mockResolvedValue(STATUS(["a"]));
    mocks.archiveEvents.mockResolvedValue({ archived: ["b"], missing: [] });

    const result = await keepOneCopy(input);

    expect(mocks.updateEventFields).toHaveBeenCalledWith("a", { tagIds: ["t1", "t2"], featureIds: ["f1"] }, "admin1", ref);
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["a"], "PUBLISHED", "admin1", ref);
    expect(mocks.archiveEvents).toHaveBeenCalledWith(["b"], "admin1", { ...ref, duplicateOfId: "a" });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", changed: ["a"], archived: ["b"] });
  });

  it("keeps the live one without publishing or taking anything", async () => {
    mocks.archiveEvents.mockResolvedValue({ archived: ["b"], missing: [] });
    const result = await keepOneCopy({ ...input, publish: false, takeFromOthers: false });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, changed: [], archived: ["b"] });
  });

  it("undoes the tag merge and archives nothing when the kept copy cannot be published", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "a", tags: [], features: [] },
      { id: "b", tags: [{ id: "t2" }], features: [] },
    ]);
    mocks.setEventStatuses.mockResolvedValue(STATUS([], { refused: [{ id: "a", reason: "Can't publish yet: no ZIP." }] }));
    const result = await keepOneCopy(input);
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin1");
    expect(mocks.archiveEvents).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Nothing was changed. Can't publish yet: no ZIP." });
  });

  it("undoes the publish when archiving the other copy fails", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "a", tags: [], features: [] },
      { id: "b", tags: [], features: [] },
    ]);
    mocks.setEventStatuses.mockResolvedValue(STATUS(["a"]));
    mocks.archiveEvents.mockRejectedValue(new mocks.EventMutationError("The event to keep does not exist or is archived."));
    const result = await keepOneCopy(input);
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin1");
    expect(result).toEqual({ ok: false, error: "The event to keep does not exist or is archived." });
  });

  it("refuses to keep and archive the same copy", async () => {
    const result = await keepOneCopy({ ...input, archiveIds: ["a"] });
    expect(result).toEqual({ ok: false, error: "The event to keep cannot also be archived." });
    expect(mocks.archiveEvents).not.toHaveBeenCalled();
  });
});

describe("memos", () => {
  it("remembers every pair of a group as different events", async () => {
    const result = await markDifferentEvents({ decisionKey: "twins:a|b|c", eventIds: ["a", "b", "c"], title: "X, 3 times" });
    expect(mocks.dismissPair.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
    expect(mocks.dismissPair).toHaveBeenCalledWith("not-same-event", "a", "b", "admin1", {
      decisionId: "d_test",
      decisionKey: "twins:a|b|c",
      title: "X, 3 times",
    });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test" });
  });

  it("sets a decision aside until the chosen day", async () => {
    const until = new Date("2026-11-09T08:00:00.000Z");
    mocks.laterUntil.mockReturnValue(until);
    const result = await snoozeDecision({ decisionKey: "trade-shows", until: "next-monday", title: "17 look like trade shows" });
    expect(mocks.laterUntil).toHaveBeenCalledWith("next-monday");
    expect(mocks.later).toHaveBeenCalledWith("trade-shows", until, "admin1", {
      decisionId: "d_test",
      decisionKey: "trade-shows",
      title: "17 look like trade shows",
    });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test" });
  });

  it("brings a decision back, or says it already is", async () => {
    mocks.bringBack.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await bringBackDecision({ decisionKey: "trade-shows" })).toMatchObject({ ok: true });
    expect(await bringBackDecision({ decisionKey: "trade-shows" })).toEqual({ ok: false, error: "It is already back in the pile." });
  });
});

describe("undo, edits and history", () => {
  it("undoes a decision and reports the result", async () => {
    mocks.undoDecision.mockResolvedValue({ ok: true, message: "Restored 8.", restored: [], refused: [], alreadyTold: [] });
    expect(await undoTodoDecision({ decisionId: "d_1" })).toEqual({ ok: true, message: "Restored 8." });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_1", "admin1");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("saves held edits without deciding", async () => {
    const result = await saveEventEdits({ decisionKey: "looks-wrong:e1", eventId: "e1", edits: { imageUrl: "https://x.test/a.jpg" } });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { imageUrl: "https://x.test/a.jpg" }, "admin1", {
      decisionId: "d_test",
      decisionKey: "looks-wrong:e1",
    });
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, decisionId: "d_test" });
  });

  it("refuses a picture link that is not a web address", async () => {
    const result = await saveEventEdits({ decisionKey: "k", eventId: "e1", edits: { imageUrl: "picture.jpg" } });
    expect(result).toEqual({ ok: false, error: "A picture link starts with https://." });
  });

  it("reads a record's history as sentences", async () => {
    mocks.getHistory.mockResolvedValue([{ id: "h1", time: "9:41 am", timestamp: "Nov 3, 2026 at 9:41 am", sentence: "You published it.", extra: 1 }]);
    expect(await recordHistory({ targetType: "EVENT", targetId: "e1" })).toEqual([
      { id: "h1", time: "9:41 am", timestamp: "Nov 3, 2026 at 9:41 am", sentence: "You published it." },
    ]);
    expect(mocks.getHistory).toHaveBeenCalledWith({ targetType: "EVENT", targetId: "e1", limit: 6, viewerId: "admin1" });
  });
});

describe("submissions", () => {
  it("publishes a submission with the place fixes held in the pane", async () => {
    mocks.publishSubmission.mockResolvedValue({ ok: true, eventId: "ev1", slug: "x", notified: ["Dana"] });
    const result = await publishSubmissionDecision({ decisionKey: "submission:s1", submissionId: "s1", draft: { venueZip: "99201" } });
    expect(mocks.publishSubmission).toHaveBeenCalledWith("s1", { venueZip: "99201" }, "admin1", {
      decisionId: "d_test",
      decisionKey: "submission:s1",
    });
    expect(result).toMatchObject({ ok: true, changed: ["s1"], notified: ["Dana"] });
  });

  it("reports why approval failed", async () => {
    mocks.publishSubmission.mockResolvedValue({ ok: false, error: "This submission was already reviewed." });
    expect(await publishSubmissionDecision({ decisionKey: "submission:s1", submissionId: "s1" })).toEqual({
      ok: false,
      error: "This submission was already reviewed.",
    });
  });

  it("rejects with a reason, ties the audit entry to the decision and names who is told", async () => {
    mocks.submissionFindUnique.mockResolvedValue({ eventTitle: " Craft fair ", submitterName: "Dana Ruiz", submitterEmail: "dana@example.com" });
    mocks.userFindUnique.mockResolvedValue({ id: "u1" });
    mocks.rejectSubmission.mockResolvedValue({ ok: true });
    const result = await rejectSubmissionDecision({ decisionKey: "submission:s1", submissionId: "s1", reason: "Outside our area" });
    const [id, actor, reason, options] = mocks.rejectSubmission.mock.calls[0];
    expect([id, actor, reason]).toEqual(["s1", "admin1", "Outside our area"]);
    expect(options.auditMeta.details).toMatchObject({
      decisionId: "d_test",
      decisionKey: "submission:s1",
      title: "Craft fair",
      reason: "Outside our area",
      notified: ["Dana Ruiz"],
    });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", notified: ["Dana Ruiz"] });
  });

  it("saves place fixes without publishing", async () => {
    mocks.saveSubmissionDraft.mockResolvedValue({ ok: true });
    const result = await saveSubmissionPlace({ decisionKey: "submission:s1", submissionId: "s1", draft: { venueZip: "99201" } });
    expect(mocks.saveSubmissionDraft).toHaveBeenCalledWith("s1", { venueZip: "99201" }, "admin1", {
      decisionId: "d_test",
      decisionKey: "submission:s1",
    });
    expect(mocks.publishSubmission).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, decisionId: "d_test" });
  });
});

describe("checkSubmissionPlace", () => {
  const row = { venueName: "Hall", venueAddress: "1 Main St", venueCity: "Spokane", venueState: "WA", venueZip: "99201" };

  it("finds the place on the map and words what approving does with it", async () => {
    mocks.submissionFindUnique.mockResolvedValue(row);
    mocks.venueOutcome.mockResolvedValue({ outcome: "new", lat: 47.6, lng: -117.4, note: "", nearest: null });
    expect(await checkSubmissionPlace({ submissionId: "s1" })).toEqual({ outcome: "new", text: "Adds a new place at this address." });
    expect(mocks.venueOutcome).toHaveBeenCalledWith(row);
  });

  it("says the place could not be checked when the lookup fails", async () => {
    mocks.submissionFindUnique.mockResolvedValue(row);
    mocks.venueOutcome.mockRejectedValue(new Error("timeout"));
    expect(await checkSubmissionPlace({ submissionId: "s1" })).toEqual({
      outcome: "unknown",
      text: "Hall, 1 Main St. The place could not be checked just now.",
    });
  });

  it("returns nothing for a submission that is gone", async () => {
    mocks.submissionFindUnique.mockResolvedValue(null);
    expect(await checkSubmissionPlace({ submissionId: "s1" })).toBeNull();
    expect(mocks.venueOutcome).not.toHaveBeenCalled();
  });
});
