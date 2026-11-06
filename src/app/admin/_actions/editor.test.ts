import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidateAdmin: vi.fn(),
  updateEventFields: vi.fn(),
  setEventStatuses: vi.fn(),
  archiveEvents: vi.fn(),
  restoreEvents: vi.fn(),
  getSeriesFor: vi.fn(),
  eventSlugProblem: vi.fn(),
  createEvent: vi.fn(),
  rejectSubmission: vi.fn(),
  saveSubmissionDraft: vi.fn(),
  publishSubmission: vi.fn(),
  venueOutcome: vi.fn(),
  nearestActiveVenue: vi.fn(),
  findOrCreateVenue: vi.fn(),
  lookupVenue: vi.fn(),
  undoDecision: vi.fn(),
  logAudit: vi.fn(),
  eventFindFirst: vi.fn(),
  eventFindUnique: vi.fn(),
  eventUpdate: vi.fn(),
  auditCreate: vi.fn(),
  venueFindFirst: vi.fn(),
  marketFindFirst: vi.fn(),
  submissionFindUnique: vi.fn(),
  tagFindFirst: vi.fn(),
  tagCreate: vi.fn(),
  transaction: vi.fn(),
}));

const { EventMutationError } = vi.hoisted(() => ({ EventMutationError: class EventMutationError extends Error {} }));

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/undo", () => ({
  newDecisionId: () => "d_test",
  undoDecision: mocks.undoDecision,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/events/mutations", () => ({
  EventMutationError,
  updateEventFields: mocks.updateEventFields,
  setEventStatuses: mocks.setEventStatuses,
  archiveEvents: mocks.archiveEvents,
  restoreEvents: mocks.restoreEvents,
}));
vi.mock("@/lib/events/series", () => ({ getSeriesFor: mocks.getSeriesFor }));
vi.mock("@/lib/events/slug", () => ({ eventSlugProblem: mocks.eventSlugProblem }));
vi.mock("@/lib/shared/event-service", () => ({ createEvent: mocks.createEvent }));
vi.mock("@/lib/submission-approval", () => ({ rejectSubmission: mocks.rejectSubmission }));
vi.mock("@/lib/submissions/draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/submissions/draft")>()),
  saveSubmissionDraft: mocks.saveSubmissionDraft,
  publishSubmission: mocks.publishSubmission,
}));
vi.mock("@/lib/submissions/venue-outcome", () => ({ venueOutcome: mocks.venueOutcome, nearestActiveVenue: mocks.nearestActiveVenue }));
vi.mock("@/lib/venues/resolve", () => ({ findOrCreateVenue: mocks.findOrCreateVenue, lookupVenue: mocks.lookupVenue }));
vi.mock("@/lib/db", () => ({
  db: {
    event: { findFirst: mocks.eventFindFirst, findUnique: mocks.eventFindUnique, update: mocks.eventUpdate },
    auditLog: { create: mocks.auditCreate },
    venue: { findFirst: mocks.venueFindFirst },
    market: { findFirst: mocks.marketFindFirst },
    submission: { findUnique: mocks.submissionFindUnique },
    tag: { findFirst: mocks.tagFindFirst, create: mocks.tagCreate },
    $transaction: mocks.transaction,
  },
}));

import {
  archiveEventAction,
  checkPlaceAction,
  createEventAction,
  createTagAction,
  publishSubmissionAction,
  rejectEventAction,
  rejectSubmissionAction,
  saveEventAction,
  saveSubmissionAction,
  undoEditorDecisionAction,
} from "./editor";

const ACTOR = "admin-1";
const noRefusal = { changed: ["e1"], alreadyThere: [], missing: [], refused: [], notified: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: ACTOR } });
  mocks.updateEventFields.mockResolvedValue({ id: "e1", title: "Cowboy Christmas", slug: "cowboy", status: "PENDING", notified: [] });
  mocks.setEventStatuses.mockResolvedValue(noRefusal);
  mocks.eventFindUnique.mockResolvedValue({ title: "Cowboy Christmas", slug: "cowboy" });
  mocks.eventSlugProblem.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops));
  mocks.eventUpdate.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
});

describe("saveEventAction", () => {
  it("refuses when not signed in as an admin", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    const result = await saveEventAction("e1", { title: "x" });
    expect(result).toEqual({ ok: false, error: "You need to be signed in as an admin to do that." });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
  });

  it("saves the changed fields under one decision and revalidates", async () => {
    const result = await saveEventAction("e1", { title: "Cowboy Christmas", websiteUrl: "kcfairgrounds.com" });
    expect(mocks.updateEventFields).toHaveBeenCalledWith(
      "e1",
      { title: "Cowboy Christmas", websiteUrl: "https://kcfairgrounds.com" },
      ACTOR,
      { decisionId: "d_test" }
    );
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, message: "Saved.", decisionId: "d_test" });
  });

  it("returns the first validation problem without writing", async () => {
    const result = await saveEventAction("e1", { websiteUrl: "not a site" });
    expect(result).toEqual({ ok: false, error: "Website must be a web address, such as example.com.", field: "websiteUrl" });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
  });

  it("leaves the web address to the slug rules in updateEventFields, and puts their refusal under the field", async () => {
    mocks.updateEventFields.mockRejectedValue(new EventMutationError('"Emerge Holiday Market" already uses /events/taken.'));
    const result = await saveEventAction("e1", { slug: "taken" });
    expect(mocks.eventSlugProblem).not.toHaveBeenCalled();
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { slug: "taken" }, ACTOR, { decisionId: "d_test" });
    expect(result).toEqual({ ok: false, error: '"Emerge Holiday Market" already uses /events/taken.', field: "slug" });
  });

  it("names the field of a value that fails validation", async () => {
    expect(await saveEventAction("e1", { details: { expectedAttendance: "lots" } })).toEqual({
      ok: false,
      error: "Expected visitors must be a whole number.",
      field: "details.expectedAttendance",
    });
    expect(await saveEventAction("e1", { facebookUrl: "not a page" })).toMatchObject({ ok: false, field: "facebookUrl" });
  });

  it("publishes through setEventStatuses after saving, and names who was told", async () => {
    mocks.setEventStatuses.mockResolvedValue({ ...noRefusal, notified: ["Dana"] });
    const result = await saveEventAction("e1", { description: "Gift market" }, { publish: true });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { description: "Gift market" }, ACTOR, { decisionId: "d_test" });
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1"], "PUBLISHED", ACTOR, { decisionId: "d_test" });
    expect(result).toMatchObject({ ok: true, published: true, notified: ["Dana"], message: "Published Cowboy Christmas and told Dana." });
  });

  it("keeps the fields saved when publishing is refused, and says why", async () => {
    mocks.setEventStatuses.mockResolvedValue({ ...noRefusal, changed: [], refused: [{ id: "e1", reason: "Can't publish yet: no ZIP." }] });
    const result = await saveEventAction("e1", {}, { publish: true });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, published: false, refused: "Can't publish yet: no ZIP." });
  });

  it("applies a held status other than publish or reject with the fields", async () => {
    await saveEventAction("e1", { status: "CANCELLED" });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { status: "CANCELLED" }, ACTOR, { decisionId: "d_test" });
  });

  it("saves vendor settings and details with the other fields, in one write under the decision", async () => {
    await saveEventAction("e1", { vendorCapacity: "40", details: { petPolicy: "ALLOWED" } });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { vendorCapacity: 40, details: { petPolicy: "ALLOWED" } }, ACTOR, { decisionId: "d_test" });
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
  });

  it("leaves vendor settings and details as they were when the field save is refused", async () => {
    mocks.updateEventFields.mockRejectedValue(new EventMutationError("That market does not exist or is archived."));
    const result = await saveEventAction("e1", { marketId: "m-archived", vendorCapacity: "40", details: { petPolicy: "ALLOWED" } });
    expect(result).toEqual({ ok: false, error: "That market does not exist or is archived.", field: "marketId" });
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });

  it("finds or adds a place typed in by hand, and audits a place it adds", async () => {
    mocks.findOrCreateVenue.mockResolvedValue({ venueId: "v9", created: true });
    const place = { name: "Pavilion", address: "574 N Howard St", city: "Spokane", state: "WA", zip: "99201" };
    await saveEventAction("e1", { venueId: "", place });
    expect(mocks.findOrCreateVenue).toHaveBeenCalledWith(place);
    expect(mocks.logAudit).toHaveBeenCalledWith(ACTOR, "CREATE_VENUE", "VENUE", "v9", expect.objectContaining({ newValue: place }));
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { venueId: "v9" }, ACTOR, { decisionId: "d_test" });
  });

  it("puts a new place the matcher refuses under the place, and a missing part under that part", async () => {
    mocks.findOrCreateVenue.mockResolvedValue({ error: 'The venue "Pavilion" exists but is archived.' });
    const place = { name: "Pavilion", address: "574 N Howard St", city: "Spokane", state: "WA", zip: "99201" };
    expect(await saveEventAction("e1", { venueId: "", place })).toEqual({ ok: false, error: 'The venue "Pavilion" exists but is archived.', field: "place" });
    expect(await saveEventAction("e1", { venueId: "", place: { ...place, zip: "" } })).toMatchObject({ ok: false, field: "place.zip" });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
  });

  it("sends the shared fields to the other dates of the series", async () => {
    mocks.getSeriesFor.mockResolvedValue({ key: "s", name: "Kendall Yards Christmas Market", eventIds: ["e1", "e2", "e3"], marketId: null, suggestMarket: true });
    const result = await saveEventAction("e1", { title: "Date title", description: "Shared" }, { applyToSeries: true });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { title: "Date title", description: "Shared" }, ACTOR, { decisionId: "d_test" });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e2", { description: "Shared" }, ACTOR, { decisionId: "d_test" });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e3", { description: "Shared" }, ACTOR, { decisionId: "d_test" });
    expect(result).toMatchObject({ ok: true, message: "Saved on all 3 dates of the series." });
  });

  it("finds the series before the save that moves the date to another market", async () => {
    const order: string[] = [];
    mocks.getSeriesFor.mockImplementation(async () => {
      order.push("series");
      return { key: "s", name: "Holiday Craft Fair", eventIds: ["e1", "e2"], marketId: null, suggestMarket: true };
    });
    mocks.updateEventFields.mockImplementation(async (id: string) => {
      order.push(`save ${id}`);
      return { title: "Holiday Craft Fair" };
    });
    await saveEventAction("e1", { marketId: "m1", description: "Shared" }, { applyToSeries: true });
    expect(order).toEqual(["series", "save e1", "save e2"]);
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e2", { marketId: "m1", description: "Shared" }, ACTOR, { decisionId: "d_test" });
  });

  it("says Saved when the series has no other date", async () => {
    mocks.getSeriesFor.mockResolvedValue(null);
    expect(await saveEventAction("e1", { description: "Shared" }, { applyToSeries: true })).toMatchObject({ ok: true, message: "Saved." });
    expect(mocks.updateEventFields).toHaveBeenCalledOnce();
  });

  it("shows the message of an EventMutationError", async () => {
    mocks.updateEventFields.mockRejectedValue(new EventMutationError("That venue does not exist or is archived."));
    expect(await saveEventAction("e1", { title: "x" })).toEqual({ ok: false, error: "That venue does not exist or is archived.", field: "venueId" });
  });
});

describe("rejectEventAction", () => {
  it("saves the edits, then rejects with the reason", async () => {
    mocks.setEventStatuses.mockResolvedValue({ ...noRefusal, notified: ["Dana"] });
    const result = await rejectEventAction("e1", { title: "Card show", status: "REJECTED" }, "Not a market or fair");
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { title: "Card show" }, ACTOR, { decisionId: "d_test" });
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1"], "REJECTED", ACTOR, { decisionId: "d_test", reason: "Not a market or fair" });
    expect(result).toMatchObject({ ok: true, message: "Rejected Cowboy Christmas: Not a market or fair. Dana was told." });
  });

  it("needs a reason", async () => {
    expect(await rejectEventAction("e1", {}, "  ")).toEqual({ ok: false, error: "Choose a reason." });
  });
});

describe("archiveEventAction", () => {
  it("archives under a decision", async () => {
    mocks.archiveEvents.mockResolvedValue({ archived: ["e1"], missing: [] });
    const result = await archiveEventAction("e1");
    expect(mocks.archiveEvents).toHaveBeenCalledWith(["e1"], ACTOR, { decisionId: "d_test" });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test" });
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });
});

describe("createEventAction", () => {
  const base = {
    title: "Holiday Bazaar",
    slug: "",
    days: [{ date: "2026-11-07", allDay: false, startTime: "09:00", endTime: "15:00" }],
    venueId: "v1",
    tagIds: ["t1"],
    showImageInList: false,
    complianceNotes: "Called them",
  };
  const fullVenue = { name: "Trinity Lutheran Church", address: "812 N 5th St", city: "Coeur d'Alene", state: "ID", zip: "83814", deletedAt: null };

  beforeEach(() => {
    mocks.venueFindFirst.mockResolvedValue(fullVenue);
    mocks.createEvent.mockImplementation(async (_data: unknown, options: { inTransaction: (tx: unknown, e: unknown) => Promise<void> }) => {
      const tx = { event: { update: mocks.eventUpdate }, auditLog: { create: mocks.auditCreate } };
      await options.inTransaction(tx, { id: "new1", slug: "holiday-bazaar-2026-11-07" });
      return { event: { id: "new1", slug: "holiday-bazaar-2026-11-07" }, error: null };
    });
  });

  it("makes the web address from the title and first date, and saves as a draft", async () => {
    const result = await createEventAction(base);
    expect(mocks.eventSlugProblem).toHaveBeenCalledWith(null, "holiday-bazaar-2026-11-07");
    const [data, options] = mocks.createEvent.mock.calls[0];
    expect(data).toMatchObject({ title: "Holiday Bazaar", slug: "holiday-bazaar-2026-11-07", venueId: "v1", tagIds: ["t1"] });
    expect(options).toMatchObject({ status: "DRAFT" });
    expect(mocks.eventUpdate).toHaveBeenCalledWith({ where: { id: "new1" }, data: { showImageInList: false, complianceNotes: "Called them" } });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "CREATE_EVENT", targetId: "new1" }) });
    expect(result).toMatchObject({ ok: true, eventId: "new1", published: false, message: "Saved Holiday Bazaar as a draft." });
  });

  it("publishes at once when asked, but not at a place with no ZIP", async () => {
    expect(await createEventAction(base, { publish: true })).toMatchObject({ ok: true, published: true });
    mocks.venueFindFirst.mockResolvedValue({ ...fullVenue, zip: "" });
    expect(await createEventAction(base, { publish: true })).toEqual({ ok: false, error: "Can't publish yet: no ZIP.", field: "venueId" });
  });

  it("needs a place", async () => {
    expect(await createEventAction({ ...base, venueId: "" })).toEqual({ ok: false, error: "Choose a place, or add a new one.", field: "venueId" });
  });

  it("checks the market and web address before adding a new place", async () => {
    mocks.eventSlugProblem.mockResolvedValue('"Holiday Bazaar" already uses /events/holiday-bazaar-2026-11-07.');
    const place = { name: "Pavilion", address: "574 N Howard St", city: "Spokane", state: "WA", zip: "99201" };
    expect(await createEventAction({ ...base, venueId: "", place })).toMatchObject({ ok: false, field: "slug" });
    expect(mocks.findOrCreateVenue).not.toHaveBeenCalled();
  });
});

describe("submissions", () => {
  it("saves a draft of the edits", async () => {
    mocks.saveSubmissionDraft.mockResolvedValue({ ok: true });
    const result = await saveSubmissionAction("s1", { title: "Big Give", tagIds: ["t1"] });
    expect(mocks.saveSubmissionDraft).toHaveBeenCalledWith("s1", { eventTitle: "Big Give", tagIds: ["t1"] }, ACTOR, { decisionId: "d_test" });
    expect(result).toMatchObject({ ok: true });
  });

  const sent = { eventTitle: "Big Give", venueName: "Shriners Event Center", venueAddress: "7217 W Westbow Blvd", venueCity: "Spokane", venueState: "WA", venueZip: "99224" };

  it("puts a draft value that cannot be saved under its field, without saving", async () => {
    const place = { name: "Shriners Event Center", address: "7217 W Westbow Blvd", city: "Spokane", state: "WA", zip: "9922" };
    expect(await saveSubmissionAction("s1", { place })).toEqual({ ok: false, error: "ZIP must be 12345 or 12345-6789", field: "place.zip" });
    expect(mocks.saveSubmissionDraft).not.toHaveBeenCalled();
  });

  it("refuses to publish a place with a part missing, under that part", async () => {
    mocks.submissionFindUnique.mockResolvedValue({ ...sent, venueZip: null });
    expect(await publishSubmissionAction("s1", {})).toEqual({ ok: false, error: "Can't publish yet: no ZIP.", field: "place.zip" });
    expect(mocks.publishSubmission).not.toHaveBeenCalled();
    mocks.publishSubmission.mockResolvedValue({ ok: true, eventId: "e7", slug: "big-give", notified: [] });
    const fixed = await publishSubmissionAction("s1", { place: { name: sent.venueName, address: sent.venueAddress, city: "Spokane", state: "WA", zip: "99224" } });
    expect(fixed).toMatchObject({ ok: true });
  });

  it("publishes with the edits and names who was told", async () => {
    mocks.publishSubmission.mockResolvedValue({ ok: true, eventId: "e7", slug: "big-give", notified: ["Pat Lee"] });
    mocks.submissionFindUnique.mockResolvedValue(sent);
    const result = await publishSubmissionAction("s1", {});
    expect(mocks.publishSubmission).toHaveBeenCalledWith("s1", null, ACTOR, { decisionId: "d_test" });
    expect(result).toMatchObject({ ok: true, eventId: "e7", message: "Published Big Give and told Pat Lee." });
  });

  it("rejects with the reason in the review notes, after saving the edits", async () => {
    mocks.saveSubmissionDraft.mockResolvedValue({ ok: true });
    mocks.submissionFindUnique.mockResolvedValue({ eventTitle: "Big Give", submitterName: "Pat Lee" });
    mocks.rejectSubmission.mockResolvedValue({ ok: true });
    const result = await rejectSubmissionAction("s1", { title: "Big Give!" }, "Outside our area");
    expect(mocks.saveSubmissionDraft).toHaveBeenCalled();
    expect(mocks.rejectSubmission).toHaveBeenCalledWith("s1", ACTOR, "Outside our area", {
      auditMeta: { details: expect.objectContaining({ decisionId: "d_test", reason: "Outside our area" }) },
    });
    expect(result).toMatchObject({ ok: true, message: "Rejected Big Give: Outside our area." });
  });
});

describe("checkPlaceAction", () => {
  const place = { name: "Kendall Yards", address: "1335 W Summit Pkwy", city: "Spokane", state: "WA", zip: "99201" };

  it("offers the existing place", async () => {
    mocks.lookupVenue.mockResolvedValue({ status: "existing", venue: { id: "v1", name: "Kendall Yards", address: "1335 W Summit Pkwy", deletedAt: null } });
    expect(await checkPlaceAction(place)).toEqual({ status: "existing", venueId: "v1", name: "Kendall Yards", address: "1335 W Summit Pkwy", archived: false });
  });

  it("gives the nearest place for a new one", async () => {
    mocks.lookupVenue.mockResolvedValue({ status: "new", coords: { lat: 47.66, lng: -117.43 } });
    mocks.nearestActiveVenue.mockResolvedValue({ venueId: "v2", name: "Scale House Market", address: "x", meters: 40 });
    expect(await checkPlaceAction(place)).toMatchObject({ status: "new", nearest: { name: "Scale House Market", meters: 40 } });
  });

  it("asks for every part first", async () => {
    expect(await checkPlaceAction({ ...place, zip: "" })).toMatchObject({ status: "error" });
    expect(mocks.lookupVenue).not.toHaveBeenCalled();
  });
});

describe("createTagAction", () => {
  it("returns an existing tag with the same name", async () => {
    mocks.tagFindFirst.mockResolvedValue({ id: "t1", name: "Craft Fair", slug: "craft-fair" });
    expect(await createTagAction("craft fair")).toEqual({ ok: true, tag: { id: "t1", name: "Craft Fair", slug: "craft-fair" } });
    expect(mocks.tagCreate).not.toHaveBeenCalled();
  });

  it("adds a new tag and audits it", async () => {
    mocks.tagFindFirst.mockResolvedValue(null);
    mocks.tagCreate.mockResolvedValue({ id: "t9", name: "Bake Sale", slug: "bake-sale" });
    expect(await createTagAction("  Bake   Sale ")).toEqual({ ok: true, tag: { id: "t9", name: "Bake Sale", slug: "bake-sale" } });
    expect(mocks.tagCreate).toHaveBeenCalledWith({ data: { name: "Bake Sale", slug: "bake-sale" }, select: { id: true, name: true, slug: true } });
    expect(mocks.logAudit).toHaveBeenCalledWith(ACTOR, "CREATE_TAG", "TAG", "t9", expect.anything());
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });
});

describe("undoEditorDecisionAction", () => {
  it("passes on the undo's message, which already names who was told", async () => {
    mocks.undoDecision.mockResolvedValue({ ok: true, restored: [], refused: [], alreadyTold: ["Dana"], message: "Restored Cowboy Christmas. Dana was already told." });
    expect(await undoEditorDecisionAction("d_1")).toEqual({ ok: true, message: "Restored Cowboy Christmas. Dana was already told." });
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });
});
