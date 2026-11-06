import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  createMarketDates: vi.fn(),
  setEventStatuses: vi.fn(),
  updateEventFields: vi.fn(),
  makeMarketFromEvents: vi.fn(),
  undoDecision: vi.fn(),
  createNotification: vi.fn(),
  marketFindFirst: vi.fn(),
  marketUpdate: vi.fn(),
  marketCreate: vi.fn(),
  eventFindMany: vi.fn(),
  venueFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/markets/create-dates", () => ({ createMarketDates: mocks.createMarketDates }));
vi.mock("@/lib/notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/lib/listing-community-badges", () => ({ assertListingCommunityBadgeIds: async (ids: string[] = []) => ids }));
vi.mock("@/lib/neighborhoods", () => ({ assertNeighborhoodSlug: async (slug: string | null) => slug || null }));
vi.mock("@/lib/admin/undo", () => ({ newDecisionId: () => "d_test", undoDecision: mocks.undoDecision }));
vi.mock("@/lib/events/mutations", () => {
  class EventMutationError extends Error {}
  return { EventMutationError, setEventStatuses: mocks.setEventStatuses, updateEventFields: mocks.updateEventFields };
});
vi.mock("@/lib/markets/make-from-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/markets/make-from-events")>()),
  makeMarketFromEvents: mocks.makeMarketFromEvents,
}));
vi.mock("@/lib/db", () => {
  const client = {
    market: { findFirst: mocks.marketFindFirst, update: mocks.marketUpdate, create: mocks.marketCreate },
    event: { findMany: mocks.eventFindMany },
    venue: { findFirst: mocks.venueFindFirst },
    user: { findUnique: mocks.userFindUnique },
    auditLog: { create: mocks.auditCreate },
    $transaction: mocks.transaction,
  };
  mocks.transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? arg(client) : Promise.all(arg as Promise<unknown>[])));
  return { db: client };
});

import {
  addMarketDates,
  linkDatesToMarket,
  makeMarketAndRepeat,
  publishMarketDates,
  repeatLastSeason,
  saveMarketDetails,
  setMarketVerification,
} from "./markets";
import { emptyMarketDetails } from "@/lib/markets/details";

const listingRow = (id: string, start: string, end: string, status = "PUBLISHED") => ({
  id,
  title: "Millwood Farmers Market",
  slug: id,
  status,
  startDate: new Date(start),
  endDate: new Date(end),
  imageUrl: null,
  venueId: "v",
  marketId: "m1",
  deletedAt: null,
  venue: { name: "Millwood" },
  scheduleDays: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T18:40:00.000Z"));
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin" } });
  mocks.marketUpdate.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addMarketDates", () => {
  it("expands the pattern and creates the dates with their hours", async () => {
    mocks.createMarketDates.mockResolvedValue({ created: [{ id: "a" }, { id: "b" }, { id: "c" }], skipped: [] });
    const result = await addMarketDates({
      marketId: "m1",
      copyFromEventId: "src",
      pattern: { kind: "weekly", weekdays: [4, 5, 6], from: "2027-11-26", to: "2027-11-28" },
      hours: { startTime: "12:00", endTime: "16:00", allDay: false },
      status: "DRAFT",
    });
    expect(mocks.createMarketDates).toHaveBeenCalledWith(
      "m1",
      {
        dates: ["2027-11-26", "2027-11-27", "2027-11-28"].map((date) => ({ date, startTime: "12:00", endTime: "16:00", allDay: false })),
        copyFromEventId: "src",
        status: "DRAFT",
      },
      "admin",
      { decisionId: "d_test" }
    );
    expect(result).toMatchObject({ ok: true, message: "Created 3 draft dates.", decisionId: "d_test", publishedIds: [] });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });

  it("explains a pattern that makes no dates without writing anything", async () => {
    const result = await addMarketDates({
      marketId: "m1",
      copyFromEventId: null,
      pattern: { kind: "weekly", weekdays: [], from: "2027-11-26", to: "2027-11-28" },
      hours: { allDay: true },
      status: "DRAFT",
    });
    expect(result).toEqual({ ok: false, error: "Pick at least one day of the week." });
    expect(mocks.createMarketDates).not.toHaveBeenCalled();
  });

  it("refuses a status other than Draft or Published", async () => {
    const result = await addMarketDates({
      marketId: "m1",
      copyFromEventId: null,
      pattern: { kind: "dates", dates: ["2027-01-09"] },
      hours: { allDay: true },
      status: "CANCELLED" as unknown as "DRAFT",
    });
    expect(result).toEqual({ ok: false, error: "New dates are either Draft or Published. Nothing was created." });
    expect(mocks.createMarketDates).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not an active admin", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      addMarketDates({ marketId: "m1", copyFromEventId: null, pattern: { kind: "dates", dates: ["2027-01-09"] }, hours: { allDay: true }, status: "DRAFT" })
    ).rejects.toThrow("Unauthorized");
  });
});

describe("repeatLastSeason", () => {
  it("creates last season's dates a year on, each copying the listing it repeats", async () => {
    mocks.eventFindMany.mockResolvedValue([listingRow("millwood", "2026-05-27T22:00:00Z", "2026-10-15T02:00:00Z", "PENDING")]);
    mocks.createMarketDates.mockResolvedValue({ created: [{ id: "x" }], skipped: [] });
    const result = await repeatLastSeason({ marketId: "m1", status: "PUBLISHED", dates: ["2027-05-26", "2027-06-02"] });
    const input = mocks.createMarketDates.mock.calls[0][1];
    expect(input.status).toBe("PUBLISHED");
    expect(input.dates).toEqual([
      { date: "2027-05-26", startTime: "15:00", endTime: "19:00", allDay: false, sourceEventId: "millwood" },
      { date: "2027-06-02", startTime: "15:00", endTime: "19:00", allDay: false, sourceEventId: "millwood" },
    ]);
    expect(result).toMatchObject({ ok: true, publishedIds: ["x"] });
  });
});

describe("publishMarketDates", () => {
  it("publishes only this market's dates, as one undoable decision", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1", name: "Kendall Yards Night Market", slug: "kendall-yards-night-market" });
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]).mockResolvedValueOnce([]);
    mocks.setEventStatuses.mockResolvedValue({ changed: ["a", "b"], alreadyThere: [], missing: [], refused: [], notified: [] });
    const result = await publishMarketDates({ marketId: "m1", eventIds: ["a", "b", "elsewhere"] });
    expect(mocks.marketFindFirst.mock.calls[0][0].where).toEqual({ id: "m1", deletedAt: null });
    expect(mocks.eventFindMany.mock.calls[0][0].where).toEqual({ id: { in: ["a", "b", "elsewhere"] }, marketId: "m1", deletedAt: null });
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["a", "b"], "PUBLISHED", "admin", { decisionId: "d_test" });
    expect(result).toEqual({ ok: true, message: "Published 2.", decisionId: "d_test", publishedIds: ["a", "b"] });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/markets/kendall-yards-night-market");
  });

  it("reports dates left waiting because their place cannot be published", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1", name: "M", slug: "m" });
    mocks.eventFindMany.mockResolvedValueOnce([{ id: "a" }]).mockResolvedValueOnce([]);
    mocks.setEventStatuses.mockResolvedValue({ changed: [], alreadyThere: [], missing: [], refused: [{ id: "a", reason: "Can't publish yet: no ZIP." }], notified: [] });
    expect(await publishMarketDates({ marketId: "m1", eventIds: ["a"] })).toEqual({
      ok: false,
      error: "Published 0. 1 was left waiting: Can't publish yet: no ZIP.",
    });
  });
});

describe("linkDatesToMarket and making markets", () => {
  const cabinFever = (id: string, marketId: string | null = null) => ({ id, title: "Cabin Fever Indoor Market", marketId });

  it("links each listing in one decision", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1", name: "Kootenai County Farmers' Market", slug: "k" });
    mocks.eventFindMany.mockResolvedValue([cabinFever("a"), cabinFever("b")]);
    const result = await linkDatesToMarket({ marketId: "m1", eventIds: ["a", "b", "a"] });
    expect(mocks.eventFindMany.mock.calls[0][0].where).toEqual({ id: { in: ["a", "b"] }, deletedAt: null });
    expect(mocks.updateEventFields.mock.calls).toEqual([
      ["a", { marketId: "m1" }, "admin", { decisionId: "d_test" }],
      ["b", { marketId: "m1" }, "admin", { decisionId: "d_test" }],
    ]);
    expect(result).toMatchObject({ ok: true, message: "Linked 2 dates to Kootenai County Farmers' Market.", decisionId: "d_test" });
  });

  it("links nothing when one date is gone or belongs to another market", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1", name: "K", slug: "k" });
    mocks.eventFindMany.mockResolvedValueOnce([cabinFever("a")]);
    expect(await linkDatesToMarket({ marketId: "m1", eventIds: ["a", "b"] })).toEqual({
      ok: false,
      error: "One of those dates was archived or no longer exists. Nothing was linked.",
    });
    mocks.eventFindMany.mockResolvedValueOnce([cabinFever("a"), cabinFever("b", "m2")]);
    expect(await linkDatesToMarket({ marketId: "m1", eventIds: ["a", "b"] })).toEqual({
      ok: false,
      error: "Cabin Fever Indoor Market already belongs to another market. Nothing was linked.",
    });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
  });

  it("keeps Undo when only some dates could be linked", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1", name: "K", slug: "k" });
    mocks.eventFindMany.mockResolvedValue([cabinFever("a"), cabinFever("b")]);
    const { EventMutationError } = await import("@/lib/events/mutations");
    mocks.updateEventFields.mockResolvedValueOnce({}).mockRejectedValueOnce(new EventMutationError("That date was changed by someone else."));
    expect(await linkDatesToMarket({ marketId: "m1", eventIds: ["a", "b"] })).toEqual({
      ok: true,
      message: "Linked 1 of 2 to K. That date was changed by someone else.",
      decisionId: "d_test",
    });
  });

  it("makes no market when the new dates' status is not Draft or Published", async () => {
    const result = await makeMarketAndRepeat({ eventIds: ["millwood"], name: "Millwood Farmers Market", venueId: "v", typicalSchedule: null, status: "PENDING" as unknown as "DRAFT" });
    expect(result.ok).toBe(false);
    expect(mocks.makeMarketFromEvents).not.toHaveBeenCalled();
  });

  it("makes the market, then adds next season's dates to it", async () => {
    mocks.makeMarketFromEvents.mockResolvedValue({ marketId: "new", slug: "millwood-farmers-market", linked: ["millwood"] });
    mocks.eventFindMany.mockResolvedValue([listingRow("millwood", "2026-05-27T22:00:00Z", "2026-10-15T02:00:00Z", "PENDING")]);
    mocks.createMarketDates.mockResolvedValue({ created: Array.from({ length: 21 }, (_, i) => ({ id: `n${i}` })), skipped: [] });
    const result = await makeMarketAndRepeat({ eventIds: ["millwood"], name: "Millwood Farmers Market", venueId: "v", typicalSchedule: "Wednesdays", status: "DRAFT" });
    expect(mocks.makeMarketFromEvents).toHaveBeenCalledWith(["millwood"], { name: "Millwood Farmers Market", venueId: "v", typicalSchedule: "Wednesdays" }, "admin", { decisionId: "d_test" });
    expect(mocks.createMarketDates.mock.calls[0][0]).toBe("new");
    expect(mocks.createMarketDates.mock.calls[0][1].dates).toHaveLength(21);
    expect(result).toMatchObject({
      ok: true,
      marketId: "new",
      message: "Made the market Millwood Farmers Market and linked 1 date. Created 21 draft dates for next season.",
    });
  });
});

describe("setMarketVerification", () => {
  const market = { id: "m1", name: "Kendall Yards Night Market", slug: "kyn", ownerId: "owner", verificationStatus: "UNVERIFIED", memberships: [{ userId: "manager" }] };

  it("verifies with an audit entry and tells the owner and managers", async () => {
    mocks.marketFindFirst.mockResolvedValue(market);
    mocks.createNotification.mockResolvedValue({});
    const result = await setMarketVerification({ marketId: "m1", status: "VERIFIED" });
    expect(mocks.marketUpdate.mock.calls[0][0].data).toMatchObject({ verificationStatus: "VERIFIED", verificationReviewedBy: "admin" });
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      action: "UPDATE_MARKET",
      targetId: "m1",
      metadata: { previousValue: { verificationStatus: "UNVERIFIED" }, newValue: { verificationStatus: "VERIFIED" } },
    });
    expect(mocks.createNotification.mock.calls.map((c) => c[0].userId)).toEqual(["owner", "manager"]);
    expect(result).toEqual({ ok: true, message: "Kendall Yards Night Market is now verified. 2 people were told." });
  });

  it("tells nobody when verification is taken away", async () => {
    mocks.marketFindFirst.mockResolvedValue({ ...market, verificationStatus: "VERIFIED" });
    const result = await setMarketVerification({ marketId: "m1", status: "UNVERIFIED" });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, message: "Kendall Yards Night Market is now not verified." });
  });
});

describe("saveMarketDetails", () => {
  const values = emptyMarketDetails({ name: "Kendall Yards Night Market", slug: "kendall-yards-night-market", venueId: "v" });

  it("returns field errors instead of saving bad input", async () => {
    const result = await saveMarketDetails({ id: "m1", values: { ...values, contactEmail: "not an email" } });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.contactEmail).toBeTruthy();
    expect(mocks.marketUpdate).not.toHaveBeenCalled();
  });

  it("saves the changed fields with an audit entry naming only them", async () => {
    mocks.venueFindFirst.mockResolvedValue({ id: "v" });
    mocks.marketFindFirst.mockResolvedValue({
      ...values,
      id: "m1",
      baseArea: null,
      typicalSchedule: null,
      description: null,
      contactEmail: null,
      contactPhone: null,
      ownerId: null,
      imageUrl: null,
      websiteUrl: null,
      facebookUrl: null,
      instagramUrl: null,
      complianceNotes: null,
      listingCommunityBadges: [],
    });
    const result = await saveMarketDetails({ id: "m1", values: { ...values, typicalSchedule: "Wednesdays, 5:00 to 8:30 pm", websiteUrl: "kendallyards.com" } });
    expect(mocks.marketUpdate.mock.calls[0][0].data).toMatchObject({ typicalSchedule: "Wednesdays, 5:00 to 8:30 pm", websiteUrl: "https://kendallyards.com" });
    expect(mocks.auditCreate.mock.calls[0][0].data.metadata).toMatchObject({
      previousValue: { typicalSchedule: "", websiteUrl: "" },
      newValue: { typicalSchedule: "Wednesdays, 5:00 to 8:30 pm", websiteUrl: "https://kendallyards.com" },
    });
    expect(result).toEqual({ ok: true, message: "Saved 2 changes to Kendall Yards Night Market.", marketId: "m1" });
  });

  it("creates a market and returns its id", async () => {
    mocks.venueFindFirst.mockResolvedValue({ id: "v" });
    mocks.marketCreate.mockResolvedValue({ id: "new", name: "Kendall Yards Night Market", slug: "kendall-yards-night-market" });
    const result = await saveMarketDetails({ id: null, values });
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({ action: "CREATE_MARKET", targetId: "new" });
    expect(result).toEqual({ ok: true, message: "Published Kendall Yards Night Market. Its page is on the site.", marketId: "new" });
  });

  it("refuses an archived home place", async () => {
    mocks.venueFindFirst.mockResolvedValue(null);
    const result = await saveMarketDetails({ id: null, values });
    expect(result).toMatchObject({ ok: false, fieldErrors: { venueId: "Pick a place that is not archived." } });
  });
});
