import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    venue: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    event: { findMany: vi.fn() },
    neighborhood: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    requireAdminAction: vi.fn(),
    revalidateAdmin: vi.fn(),
    mergeVenues: vi.fn(),
    moveVenueListings: vi.fn(),
    samePlace: vi.fn(),
    dismissPair: vi.fn(),
    later: vi.fn(),
    bringBack: vi.fn(),
    undoDecision: vi.fn(),
    isUndoable: vi.fn(),
    assertNeighborhoodSlug: vi.fn(),
    geocodeAddress: vi.fn(),
    findMatchingVenue: vi.fn(),
    loadPlaceRecords: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/memo", () => ({
  samePlace: mocks.samePlace,
  dismissPair: mocks.dismissPair,
  later: mocks.later,
  bringBack: mocks.bringBack,
  laterUntil: () => new Date("2026-11-04T08:00:00Z"),
}));
vi.mock("@/lib/admin/undo", () => ({ newDecisionId: () => "d_test", isUndoable: mocks.isUndoable, undoDecision: mocks.undoDecision }));
vi.mock("@/lib/venues/merge", () => ({ mergeVenues: mocks.mergeVenues, moveVenueListings: mocks.moveVenueListings }));
vi.mock("@/lib/neighborhoods", () => ({ assertNeighborhoodSlug: mocks.assertNeighborhoodSlug }));
vi.mock("@/lib/geocode", () => ({ geocodeAddress: mocks.geocodeAddress }));
vi.mock("@/lib/venues/resolve", () => ({ findMatchingVenue: mocks.findMatchingVenue }));
vi.mock("@/lib/venues/place-data", () => ({ loadPlaceRecords: mocks.loadPlaceRecords }));
vi.mock("@/lib/venues/place-decision-data", () => ({ loadPlaceDecision: vi.fn() }));

import {
  addNeighborhoodAndSet,
  archiveUnusedPlaces,
  fixPlaceSpelling,
  mergePlaces,
  mergeSafeGroups,
  movePlaceListings,
  savePlace,
  setPlacesNeighborhood,
} from "./venues";

const record = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  address: "1 Main St",
  city: "Spokane",
  state: "WA",
  zip: "99201",
  lat: null,
  lng: null,
  neighborhood: null,
  deletedAt: null,
  uses: { events: 0, markets: 0, upcoming: 0 },
  next: null,
  ...extra,
});

/** Audit entries written through db.auditLog.create, by action. */
function audits(action?: string) {
  return mocks.db.auditLog.create.mock.calls.map((c) => c[0].data).filter((d) => !action || d.action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.db.$transaction.mockImplementation((arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mocks.db)));
  mocks.db.event.findMany.mockResolvedValue([{ slug: "an-event" }]);
  mocks.db.venue.update.mockResolvedValue({});
  mocks.db.auditLog.create.mockResolvedValue({});
  mocks.db.venue.findFirst.mockResolvedValue(null);
  mocks.assertNeighborhoodSlug.mockImplementation(async (slug: string | null) => slug || null);
  mocks.isUndoable.mockReturnValue(false);
});

describe("access", () => {
  it("answers with the error when the caller is not an active admin, and writes nothing", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    const result = await setPlacesNeighborhood({ venueIds: ["a"], slug: "downtown" });
    expect(result).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.db.venue.update).not.toHaveBeenCalled();
  });
});

describe("mergePlaces", () => {
  it("merges with the chosen values as one decision and refreshes the admin and the moved events' pages", async () => {
    mocks.mergeVenues.mockResolvedValue({ ok: true, keepId: "keep", eventsMoved: 3, marketsMoved: 0, eventSlugs: ["e1"], marketSlugs: [] });
    mocks.db.venue.findUnique.mockResolvedValue({ name: "Spokane Community College, The Lair" });
    const result = await mergePlaces({ keepId: "keep", mergeIds: ["a", "b"], overrides: { address: "1810 N Greene St" }, decisionKey: "place-duplicates:a|b|keep" });
    expect(mocks.mergeVenues).toHaveBeenCalledWith("keep", ["a", "b"], "admin-1", {
      overrides: { address: "1810 N Greene St" },
      decisionId: "d_test",
      decisionKey: "place-duplicates:a|b|keep",
    });
    expect(mocks.revalidateAdmin).toHaveBeenCalledWith({ eventSlugs: ["e1"], marketSlugs: [] });
    expect(result).toEqual({
      ok: true,
      decisionId: "d_test",
      undoable: true,
      id: "keep",
      message: "Merged 3 into Spokane Community College, The Lair. Moved 3 events.",
    });
    expect(mocks.samePlace).not.toHaveBeenCalled();
  });

  it("remembers a merge picked by hand as same-place pairs under the same decision", async () => {
    mocks.mergeVenues.mockResolvedValue({ ok: true, keepId: "keep", eventsMoved: 0, marketsMoved: 0, eventSlugs: [], marketSlugs: [] });
    mocks.db.venue.findUnique.mockResolvedValue({ name: "Keep" });
    await mergePlaces({ keepId: "keep", mergeIds: ["a"], byHand: true });
    expect(mocks.samePlace).toHaveBeenCalledWith("keep", "a", "admin-1", { decisionId: "d_test", decisionKey: undefined });
  });

  it("passes on a refusal and refreshes nothing", async () => {
    mocks.mergeVenues.mockResolvedValue({ ok: false, error: "The place to keep no longer exists or is archived." });
    expect(await mergePlaces({ keepId: "keep", mergeIds: ["a"] })).toEqual({ ok: false, error: "The place to keep no longer exists or is archived." });
    expect(mocks.revalidateAdmin).not.toHaveBeenCalled();
  });

  it("checks a chosen neighborhood against the list", async () => {
    mocks.assertNeighborhoodSlug.mockRejectedValue(new Error('Invalid neighborhood slug: "nowhere"'));
    expect(await mergePlaces({ keepId: "keep", mergeIds: ["a"], overrides: { neighborhood: "nowhere" } })).toEqual({ ok: false, error: 'Invalid neighborhood slug: "nowhere"' });
    expect(mocks.mergeVenues).not.toHaveBeenCalled();
  });
});

describe("mergeSafeGroups", () => {
  it("checks each group again and leaves one that is no longer safe", async () => {
    mocks.loadPlaceRecords.mockResolvedValue([
      record("riverfront", { name: "Riverfront Park", address: "507 N Howard St", uses: { events: 1, markets: 1, upcoming: 0 } }),
      record("pavilion", { name: "Spokane Pavilion at Riverfront Park", address: "507 N Howard St" }),
      record("college", { name: "College", address: "1810 N Greene St", uses: { events: 2, markets: 0, upcoming: 1 } }),
      record("lair", { name: "College, The Lair", address: "1810 N Greene St", uses: { events: 1, markets: 0, upcoming: 1 } }),
    ]);
    mocks.mergeVenues.mockResolvedValue({ ok: true, keepId: "riverfront", eventsMoved: 0, marketsMoved: 0, eventSlugs: [], marketSlugs: [] });
    const result = await mergeSafeGroups({ groups: [{ ids: ["riverfront", "pavilion"] }, { ids: ["college", "lair"] }] });
    expect(mocks.mergeVenues).toHaveBeenCalledTimes(1);
    expect(mocks.mergeVenues).toHaveBeenCalledWith("riverfront", ["pavilion"], "admin-1", { decisionId: "d_test", decisionKey: "place-duplicates:pavilion|riverfront" });
    expect(result).toMatchObject({ ok: true, message: "Merged 1 group and archived 1 empty record. Left for you: College." });
  });
});

describe("setPlacesNeighborhood", () => {
  it("writes each changed place with its old value in the audit entry, as one decision", async () => {
    mocks.db.venue.findMany.mockResolvedValue([
      { id: "a", name: "Emerge", neighborhood: null },
      { id: "b", name: "Trinity Lutheran Church", neighborhood: "cda" },
    ]);
    mocks.db.neighborhood.findUnique.mockResolvedValue({ label: "Cda" });
    mocks.isUndoable.mockReturnValue(true);
    const result = await setPlacesNeighborhood({ venueIds: ["a", "b"], slug: "cda", decisionKey: "zip-neighborhood:83814" });
    expect(mocks.db.venue.update).toHaveBeenCalledTimes(1);
    expect(mocks.db.venue.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { neighborhood: "cda" } });
    expect(audits("UPDATE_VENUE")).toEqual([
      expect.objectContaining({
        targetType: "VENUE",
        targetId: "a",
        metadata: expect.objectContaining({
          previousValue: { neighborhood: null },
          newValue: { neighborhood: "cda" },
          details: expect.objectContaining({ decisionId: "d_test", decisionKey: "zip-neighborhood:83814", title: "Emerge" }),
        }),
      }),
    ]);
    expect(mocks.revalidateAdmin).toHaveBeenCalledWith({ eventSlugs: ["an-event"] });
    expect(result).toEqual({ ok: true, decisionId: "d_test", undoable: true, message: "Set Cda for Emerge." });
  });

  it("offers no Undo while undo cannot reverse place edits", async () => {
    mocks.db.venue.findMany.mockResolvedValue([{ id: "a", name: "Emerge", neighborhood: null }]);
    mocks.db.neighborhood.findUnique.mockResolvedValue({ label: "Cda" });
    expect(await setPlacesNeighborhood({ venueIds: ["a"], slug: "cda" })).toMatchObject({ ok: true, undoable: false });
    expect(mocks.isUndoable).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE_VENUE", targetType: "VENUE" }));
  });
});

describe("addNeighborhoodAndSet", () => {
  it("adds the neighborhood only when asked, with its own audit entry, then sets it", async () => {
    mocks.db.neighborhood.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ label: "North Idaho" });
    mocks.db.neighborhood.create.mockResolvedValue({ id: "n1", slug: "north-idaho", label: "North Idaho" });
    mocks.db.venue.findMany.mockResolvedValue([{ id: "r", name: "Rathdrum Lions Club", neighborhood: null }]);
    const result = await addNeighborhoodAndSet({ label: "North Idaho", venueIds: ["r"] });
    expect(mocks.db.neighborhood.create).toHaveBeenCalledWith({ data: { slug: "north-idaho", label: "North Idaho", isActive: true } });
    expect(audits("CREATE_NEIGHBORHOOD")).toHaveLength(1);
    expect(mocks.db.venue.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { neighborhood: "north-idaho" } });
    expect(result).toMatchObject({ ok: true, message: "Added North Idaho. Set North Idaho for Rathdrum Lions Club." });
  });

  it("writes the neighborhood and the places in one transaction under one decision", async () => {
    mocks.db.neighborhood.findUnique.mockResolvedValue({ id: "n1", slug: "post-falls", label: "Post Falls", isActive: false });
    mocks.db.neighborhood.update.mockResolvedValue({ id: "n1", slug: "post-falls", label: "Post Falls", isActive: true });
    mocks.db.venue.findMany.mockResolvedValue([
      { id: "a", name: "Post Falls City Hall", neighborhood: null },
      { id: "b", name: "Q'emiln Park", neighborhood: null },
    ]);
    mocks.isUndoable.mockReturnValue(true);
    const result = await addNeighborhoodAndSet({ label: "Post Falls", venueIds: ["a", "b"], decisionKey: "zip-neighborhood:83854" });
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof mocks.db.$transaction.mock.calls[0][0]).toBe("function");
    expect(mocks.db.neighborhood.update).toHaveBeenCalledWith({ where: { slug: "post-falls" }, data: { isActive: true } });
    expect(audits("UPDATE_NEIGHBORHOOD")).toEqual([
      expect.objectContaining({
        targetType: "NEIGHBORHOOD",
        targetId: "n1",
        metadata: expect.objectContaining({
          previousValue: { isActive: false },
          details: expect.objectContaining({ decisionId: "d_test", decisionKey: "zip-neighborhood:83854" }),
        }),
      }),
    ]);
    expect(audits("UPDATE_VENUE").map((a) => a.metadata.details.decisionId)).toEqual(["d_test", "d_test"]);
    expect(mocks.isUndoable).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE_NEIGHBORHOOD", targetType: "NEIGHBORHOOD" }));
    expect(result).toEqual({ ok: true, decisionId: "d_test", undoable: true, message: "Turned on Post Falls. Set Post Falls for 2 places." });
  });

  it("offers no Undo, and says the neighborhood stays, while undo cannot turn a neighborhood off", async () => {
    mocks.db.neighborhood.findUnique.mockResolvedValue(null);
    mocks.db.neighborhood.create.mockResolvedValue({ id: "n2", slug: "post-falls", label: "Post Falls" });
    mocks.db.venue.findMany.mockResolvedValue([{ id: "a", name: "Post Falls City Hall", neighborhood: null }]);
    mocks.isUndoable.mockImplementation((entry: { targetType: string }) => entry.targetType === "VENUE");
    const result = await addNeighborhoodAndSet({ label: "Post Falls", venueIds: ["a"] });
    expect(result).toMatchObject({
      ok: true,
      undoable: false,
      message: "Added Post Falls. Set Post Falls for Post Falls City Hall. Post Falls stays in the area filter until you turn it off in the Neighborhood list.",
    });
  });
});

describe("fixPlaceSpelling", () => {
  it("recomputes the fixes from the stored values and applies only the chosen fields", async () => {
    mocks.db.venue.findMany.mockResolvedValue([
      { id: "s", name: "Shriners Event Center", address: "7217 W WESTBOW BLVD", city: "SPOKANE", state: "WA", zip: "99224" },
    ]);
    const result = await fixPlaceSpelling({ items: [{ venueId: "s", fields: ["city"] }] });
    expect(mocks.db.venue.update).toHaveBeenCalledWith({ where: { id: "s" }, data: { city: "Spokane" } });
    expect(audits("UPDATE_VENUE")[0].metadata).toMatchObject({ previousValue: { city: "SPOKANE" }, newValue: { city: "Spokane" } });
    expect(result).toMatchObject({ ok: true, message: "Fixed the spelling of 1 place." });
  });

  it("refuses two fixes in one batch that would land on one name and address", async () => {
    mocks.db.venue.findMany.mockResolvedValue([
      { id: "s", name: "Hall", address: "1 MAIN ST", city: "Spokane", state: "WA", zip: "99201" },
      { id: "t", name: "Hall", address: "1 Main  St", city: "Spokane", state: "WA", zip: "99201" },
    ]);
    const result = await fixPlaceSpelling({ items: [{ venueId: "s", fields: ["address"] }, { venueId: "t", fields: ["address"] }] });
    expect(result).toEqual({ ok: false, error: "Hall would then share its name and address with another place. Merge them first." });
    expect(mocks.db.venue.update).not.toHaveBeenCalled();
  });

  it("refuses a fix that would give two places one name and address", async () => {
    mocks.db.venue.findMany.mockResolvedValue([{ id: "s", name: "Hall", address: "1 MAIN ST", city: "Spokane", state: "WA", zip: "99201" }]);
    mocks.db.venue.findFirst.mockResolvedValue({ name: "Hall" });
    const result = await fixPlaceSpelling({ items: [{ venueId: "s", fields: ["address"] }] });
    expect(result.ok).toBe(false);
    expect(mocks.db.venue.update).not.toHaveBeenCalled();
  });
});

describe("archiveUnusedPlaces", () => {
  it("archives only places nothing uses and names the rest", async () => {
    mocks.db.venue.findMany.mockResolvedValue([
      { id: "empty", name: "Convention Center", _count: { events: 0, markets: 0 } },
      { id: "used", name: "Riverfront Park", _count: { events: 1, markets: 0 } },
    ]);
    const result = await archiveUnusedPlaces({ venueIds: ["empty", "used"] });
    expect(mocks.db.venue.update).toHaveBeenCalledTimes(1);
    expect(mocks.db.venue.update).toHaveBeenCalledWith({ where: { id: "empty" }, data: { deletedAt: expect.any(String) } });
    expect(audits("SOFT_DELETE_VENUE")[0].metadata).toMatchObject({ previousValue: { deletedAt: null } });
    expect(result).toMatchObject({ ok: true, message: "Archived Convention Center. Left Riverfront Park: in use." });
  });
});

describe("movePlaceListings", () => {
  it("moves the listings as one decision and refreshes their pages", async () => {
    mocks.moveVenueListings.mockResolvedValue({ ok: true, eventsMoved: 2, marketsMoved: 0, eventSlugs: ["a", "b"], marketSlugs: [] });
    mocks.db.venue.findUnique.mockResolvedValue({ name: "Coeur d'Alene Downtown" });
    const result = await movePlaceListings({ fromId: "old", toId: "new" });
    expect(mocks.moveVenueListings).toHaveBeenCalledWith("old", "new", "admin-1", { decisionId: "d_test", decisionKey: undefined });
    expect(mocks.revalidateAdmin).toHaveBeenCalledWith({ eventSlugs: ["a", "b"], marketSlugs: [] });
    expect(result).toMatchObject({ ok: true, undoable: true, message: "Moved 2 events to Coeur d'Alene Downtown." });
  });
});

describe("savePlace", () => {
  const input = {
    name: "Kendall Yards",
    address: "1335 W Summit Pkwy",
    city: "Spokane",
    state: "WA",
    zip: "99201",
    lat: null,
    lng: null,
    neighborhood: null,
    parkingNotes: null,
  };

  it("runs the place matcher before adding: an existing place is offered instead", async () => {
    mocks.findMatchingVenue.mockResolvedValue({ id: "ky", name: "Kendall Yards", address: "1335 W Summit Pkwy", city: "Spokane", deletedAt: null });
    const result = await savePlace(input);
    expect(result).toEqual({
      ok: false,
      error: "Kendall Yards already exists at 1335 W Summit Pkwy.",
      match: { id: "ky", name: "Kendall Yards", address: "1335 W Summit Pkwy", city: "Spokane", archived: false, exact: true },
    });
    expect(mocks.db.venue.create).not.toHaveBeenCalled();
  });

  it("asks before adding a place that only looks like an existing one, and adds it when told to", async () => {
    mocks.findMatchingVenue.mockResolvedValue(null);
    mocks.db.venue.findMany.mockResolvedValue([{ id: "ky", name: "Kendall Yards (Summit Parkway)", address: "1335 W Summit Pkwy", city: "Spokane", zip: "99201", lat: null, lng: null }]);
    const asked = await savePlace(input);
    expect(asked).toMatchObject({ ok: false, match: { id: "ky", exact: false } });

    mocks.geocodeAddress.mockResolvedValue({ lat: 47.6625, lng: -117.4352 });
    mocks.db.venue.create.mockResolvedValue({ id: "new", name: "Kendall Yards", address: "1335 W Summit Pkwy" });
    const added = await savePlace({ ...input, createAnyway: true });
    expect(mocks.db.venue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Kendall Yards", lat: 47.6625, lng: -117.4352, neighborhood: null }),
    });
    expect(audits("CREATE_VENUE")).toHaveLength(1);
    expect(added).toMatchObject({ ok: true, id: "new" });
  });

  it("never invents a location for an address no geocoder can place", async () => {
    mocks.findMatchingVenue.mockResolvedValue(null);
    mocks.db.venue.findMany.mockResolvedValue([]);
    mocks.geocodeAddress.mockResolvedValue(null);
    const result = await savePlace({ ...input, name: "Somewhere New" });
    expect(result).toMatchObject({ ok: false, field: "address" });
    expect(mocks.db.venue.create).not.toHaveBeenCalled();
  });

  it("saves only changed fields of an existing place and records their old values", async () => {
    mocks.db.venue.findUnique.mockResolvedValue({ id: "ky", ...input, lat: 47.6625, lng: -117.4352, neighborhood: null, parkingNotes: null });
    const result = await savePlace({ ...input, id: "ky", lat: 47.6625, lng: -117.4352, parkingNotes: "Street parking on Summit" });
    expect(mocks.db.venue.update).toHaveBeenCalledWith({ where: { id: "ky" }, data: { parkingNotes: "Street parking on Summit" } });
    expect(audits("UPDATE_VENUE")[0].metadata).toMatchObject({ previousValue: { parkingNotes: null }, newValue: { parkingNotes: "Street parking on Summit" } });
    expect(result).toMatchObject({ ok: true, id: "ky", message: "Saved Kendall Yards." });
  });

  it("rejects a ZIP that is not five digits", async () => {
    expect(await savePlace({ ...input, zip: "9920" })).toMatchObject({ ok: false, field: "zip" });
  });
});
