import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { buildDecisions } from "@/lib/admin/decisions";
import type { Decision, DecisionInput } from "@/lib/admin/decisions/types";
import { snapshotDecisionInput, snapshotIdByTitle, SNAPSHOT_NOW } from "@/lib/admin/__fixtures__/snapshot";
import { buildBrief, listOr, looksWrongSentence, shortName, whenSentence, liveSentence } from "./brief-model";
import { compareRows, editorHref, fixedCopy, lackSentence, notifySentence, reasonText, suggestReason, takeFromOthers } from "./decision-model";
import { changeCount, dayProblem, editsPayload, heldDaysProblem, splitIntoDailyHours, titleProblem } from "./held-edits";
import { lanesOf, linkLabel, startLabelOf, whenLines, whenShort } from "./load";
import { archiveMessage, keepMessage, laterMessage, publishMessage, rejectMessage, weekLiveSentence } from "./messages";
import {
  briefItemId,
  buildPile,
  cursorAfterDecision,
  decisionItemId,
  defaultLane,
  enterLane,
  followedDecision,
  laneFromParams,
  laneItemId,
  moveCursor,
  positionText,
  splitDecision,
  stepWeek,
  visibleDecisions,
  type PileInput,
  type PileState,
} from "./pile-model";
import type { TodoEvent, TodoLane } from "./types";

const NOV7 = "week:2026-11-07" as const;
const NOV14 = "week:2026-11-14" as const;

function withPictures(input: DecisionInput): DecisionInput {
  return {
    ...input,
    events: input.events.map((e) =>
      e.status === "PUBLISHED" && e.title !== "Yuletide Holiday Marketplace" ? { ...e, imageUrl: "/uploads/event/x.webp" } : e
    ),
  };
}

const input = withPictures(snapshotDecisionInput({ backfill: true }));
const result = buildDecisions(input);

function todoEvent(id: string, overrides: Partial<TodoEvent> = {}): TodoEvent {
  const e = input.events.find((x) => x.id === id);
  return {
    id,
    title: e?.title ?? id,
    slug: e?.slug ?? id,
    status: e?.status ?? "PENDING",
    dates: ["2026-11-07"],
    firstDate: "2026-11-07",
    startLabel: "Sat 10 am",
    when: ["Sat Nov 7, 10:00 am to 4:00 pm"],
    whenShort: "Sat 10:00 am to 4:00 pm",
    dateRange: "Sat Nov 7",
    startIso: "2026-11-07T18:00:00.000Z",
    endIso: "2026-11-08T00:00:00.000Z",
    scheduleDays: [],
    venue: { id: e?.venue.id ?? "v", name: e?.venue.name ?? "Place", address: "1 Main St", city: e?.venue.city ?? "Spokane", state: "WA", zip: "99201", neighborhood: null, archived: false },
    area: "Spokane",
    description: null,
    importerNote: false,
    imageUrl: null,
    pictureIsPage: false,
    links: [],
    tags: [],
    features: [],
    marketName: null,
    vendorApplicationState: null,
    feeModelVendor: null,
    origin: "Import of Oct 30 (47 events)",
    notifies: null,
    blocking: [],
    warnings: [{ flag: "no-picture", message: "No picture" }],
    ...overrides,
  };
}

const lanes: TodoLane[] = result.lanes.map((l) => ({
  ...l,
  liveEventIds: [],
  keptOff: 0,
  span: l.saturday ? `Fri ${l.saturday}` : null,
}));
const events: Record<string, TodoEvent> = Object.fromEntries(input.events.map((e) => [e.id, todoEvent(e.id)]));
const pileInput: PileInput = { decisions: result.decisions, lanes, events };
const baseState: PileState = { openLane: NOV7, scope: "all", area: null, hidden: new Set(), split: new Set() };

describe("the pile", () => {
  it("opens on this weekend, starting with its brief", () => {
    expect(defaultLane(lanes)).toBe(NOV7);
    const { items, sections } = buildPile(pileInput, baseState);
    const open = sections.find((s) => s.open)!;
    expect(open.lane.lane).toBe(NOV7);
    expect(open.items[0]).toEqual({ id: briefItemId(NOV7), type: "brief", lane: NOV7 });
    expect(open.items.slice(1).map((i) => (i.type === "decision" ? i.decision.key : i.id))).toEqual(
      result.decisions.filter((d) => d.lane === NOV7).map((d) => d.key)
    );
    expect(items.filter((i) => i.type === "lane").map((i) => i.lane)).toEqual([
      "week:2026-11-14",
      "week:2026-11-21",
      "week:2026-11-28",
      "week:2026-12-05",
      "week:2026-12-12",
      "week:2026-12-19",
      "later",
      "gone",
    ]);
  });

  it("puts From the public last while it is empty and first once something waits", () => {
    const empty = buildPile(pileInput, baseState).sections;
    expect(empty[empty.length - 1].lane.lane).toBe("public");
    expect(empty[empty.length - 1].items).toEqual([]);
    const submission: Decision = {
      key: "submission:s1",
      kind: "submission",
      lane: "public",
      title: "Craft fair",
      rows: [{ type: "submission", id: "s1", title: "Craft fair" }],
      settles: [],
      primary: { label: "Publish", action: "publish-submission" },
    };
    const busy = buildPile({ ...pileInput, decisions: [submission, ...result.decisions] }, baseState).sections;
    expect(busy[0].lane.lane).toBe("public");
    expect(busy[0].open).toBe(true);
    expect(busy[0].items.map((i) => i.id)).toEqual([decisionItemId("submission:s1")]);
  });

  it("walks into the next lane with j, landing on its brief, and back with k onto the last decision", () => {
    const lastNov7 = result.decisions.filter((d) => d.lane === NOV7).at(-1)!;
    const down = moveCursor(pileInput, baseState, decisionItemId(lastNov7.key), 1)!;
    expect(down).toEqual({ openLane: NOV14, cursor: briefItemId(NOV14) });
    const up = moveCursor(pileInput, { ...baseState, openLane: NOV14 }, briefItemId(NOV14), -1)!;
    expect(up).toEqual({ openLane: NOV7, cursor: decisionItemId(lastNov7.key) });
    expect(moveCursor(pileInput, baseState, briefItemId(NOV7), -1)).toBeNull();
  });

  it("steps through weekends with [ and ], clearing past either end", () => {
    expect(stepWeek(lanes, NOV7, 1)).toBe(NOV14);
    expect(stepWeek(lanes, NOV7, -1)).toBeNull();
    expect(stepWeek(lanes, "later", 1)).toBeNull();
    expect(stepWeek(lanes, "gone", 1)).toBe(NOV7);
  });

  it("reads the lane from ?week= and ?lane=, ignoring unknown ones", () => {
    expect(laneFromParams("2026-11-14", null, lanes)).toBe(NOV14);
    expect(laneFromParams("later", null, lanes)).toBe("later");
    expect(laneFromParams(null, "public", lanes)).toBe("public");
    expect(laneFromParams("2030-01-05", null, lanes)).toBeNull();
    expect(laneFromParams(null, "nowhere", lanes)).toBeNull();
  });

  it("moves the cursor from a decided decision to the next one, and back to the brief at the end of the lane", () => {
    const { items } = buildPile(pileInput, baseState);
    const nov7 = result.decisions.filter((d) => d.lane === NOV7);
    expect(cursorAfterDecision(items, decisionItemId(nov7[0].key), nov7[0].key)).toBe(decisionItemId(nov7[1].key));
    const last = nov7.at(-1)!;
    expect(cursorAfterDecision(items, decisionItemId(last.key), last.key)).toBe(briefItemId(NOV7));
    expect(cursorAfterDecision(items, briefItemId(NOV7), nov7[0].key)).toBe(decisionItemId(nov7[1].key));
  });

  it("hides decided decisions and splits a batch into singles in the lanes of their dates", () => {
    const ready = result.decisions.find((d) => d.key === "ready:2026-11-07")!;
    const hidden = visibleDecisions(pileInput, { hidden: new Set([ready.key]), split: new Set() });
    expect(hidden.some((d) => d.key === ready.key)).toBe(false);
    const singles = splitDecision(ready, pileInput);
    expect(singles).toHaveLength(ready.rows.length);
    expect(singles.every((d) => d.kind === "single" && d.lane === NOV7 && d.primary.label === "Publish")).toBe(true);
    const split = visibleDecisions(pileInput, { hidden: new Set(), split: new Set([ready.key]) });
    expect(split.filter((d) => d.lane === NOV7 && d.kind === "single")).toHaveLength(ready.rows.length);
    expect(split.findIndex((d) => d.kind === "single")).toBeLessThan(split.findIndex((d) => d.lane === NOV14));
  });

  it("narrows an open weekend to one area and counts what it left out", () => {
    const spokane = Object.fromEntries(Object.entries(events).map(([id, e]) => [id, { ...e, area: id === snapshotIdByTitle("CardCon") ? ("North Idaho" as const) : e.area }]));
    const { sections } = buildPile({ ...pileInput, events: spokane }, { ...baseState, area: "North Idaho" });
    const open = sections.find((s) => s.open)!;
    expect(open.items.filter((i) => i.type === "decision").map((i) => (i.type === "decision" ? i.decision.kind : ""))).toEqual(["trade-shows"]);
    expect(open.filteredOut).toBeGreaterThan(0);
  });

  it("shows only the places and public lanes for those scopes", () => {
    expect(buildPile(pileInput, { ...baseState, scope: "places" }).sections.map((s) => s.lane.lane)).toEqual(["places"]);
    expect(buildPile(pileInput, { ...baseState, scope: "public" }).sections.map((s) => s.lane.lane)).toEqual(["public"]);
    expect(buildPile(pileInput, { ...baseState, scope: "events" }).sections.some((s) => s.lane.lane === "places")).toBe(false);
  });

  it("says where a decision sits: 1 of 8, this weekend", () => {
    const nov7 = result.decisions.filter((d) => d.lane === NOV7);
    expect(positionText(nov7[1], result.decisions, lanes)).toBe(`2 of ${nov7.length}, this weekend`);
    const nov21 = result.decisions.find((d) => d.lane === "week:2026-11-21");
    if (nov21) expect(positionText(nov21, result.decisions, lanes)).toMatch(/, the weekend of Nov 21$/);
  });

  it("lands on a lane's first row when it opens", () => {
    expect(enterLane(pileInput, baseState, NOV14, "first")).toBe(briefItemId(NOV14));
    expect(enterLane(pileInput, baseState, "gone", "first")).toBe(decisionItemId("gone"));
    expect(laneItemId("gone")).toBe("lane:gone");
  });

  it("follows a series to the decision its dates are filed under once its key is gone", () => {
    const cabin = result.decisions.find((d) => d.title.startsWith("Cabin Fever"))!;
    const ids = new Set(cabin.settles);
    expect(followedDecision(result.decisions, cabin.key, ids)).toBeUndefined();
    const linked: Decision = { ...cabin, key: "series:market:kootenai", title: "Kootenai County Farmers' Market, 3 dates", settles: ["other", ...cabin.settles] };
    const after = [...result.decisions.filter((d) => d.key !== cabin.key), linked];
    expect(followedDecision(after, cabin.key, ids)).toBe(linked);
    expect(followedDecision(after.filter((d) => d !== linked), cabin.key, ids)).toBeNull();
  });
});

describe("the weekend brief", () => {
  const nov7 = lanes.find((l) => l.lane === NOV7)!;
  const now = SNAPSHOT_NOW;

  it("leads with the time to Saturday and what is live, then one line per kind of decision", () => {
    const brief = buildBrief({ lane: nov7, lanes, decisions: result.decisions, today: "2026-11-03", now, counts: { live: 1, total: 22 } });
    expect(brief.title).toBe("This weekend, Fri 2026-11-07");
    expect(brief.lines.map((l) => l.text)).toEqual([
      "Saturday is four days away. 1 of 22 is live.",
      "Nothing is live yet in Spokane Valley, North Idaho or farther out.",
      "8 are ready to publish.",
      "5 pairs look like the same event.",
      "2 series start here: Rathdrum Craft and Farmers Market and Spokane Farmers' Market.",
      "CardCon may not be a market, and 16 more like it later in the season.",
      "Yuletide Holiday Marketplace is live on Friday with no picture.",
    ]);
    expect(brief.lines[2].action).toEqual({ kind: "publish-ready", decisionKey: "ready:2026-11-07", label: "Publish the 8 ready" });
    expect(brief.lines[3].action).toMatchObject({ kind: "goto", label: "Start with Rebel Junk" });
    expect(brief.lines[4].action).toMatchObject({ kind: "goto", decisionKey: "series:market:cmvv9iv1q001i01mmql2udwe3", label: "Open the first" });
    expect(brief.lines[5].action).toMatchObject({ kind: "goto", decisionKey: "trade-shows", label: "Review the 17" });
    expect(brief.lines[6].action).toMatchObject({ kind: "goto", label: "Add a picture" });
    expect(brief.footer).toBe("10 decisions settle the 21 waiting here.");
    expect(brief.done).toBe(false);
  });

  it("says the weekend is set when nothing is left, and offers the next weekend that waits", () => {
    const remaining = result.decisions.filter((d) => d.lane !== NOV7);
    const done = { ...nov7, waiting: 0, live: 16, keptOff: 6 };
    const brief = buildBrief({ lane: done, lanes, decisions: remaining, today: "2026-11-03", now, counts: { live: 16, total: 16 } });
    expect(brief.done).toBe(true);
    expect(brief.lines[0].text).toBe("Nov 6 to 8 is set: 16 live, 6 kept off the site.");
    expect(brief.lines[0].action).toEqual({ kind: "open-lane", lane: NOV14, label: "Next weekend, Nov 13 to 15 (14 waiting)" });
  });

  it("words the parts plainly", () => {
    expect(whenSentence("2026-11-07", "2026-11-06")).toBe("Saturday is tomorrow.");
    expect(whenSentence("2026-11-07", "2026-11-07")).toBe("Saturday is today.");
    expect(whenSentence("2026-11-07", "2026-11-08")).toBe("Sunday is today.");
    expect(liveSentence(0, 8)).toBe("None of the 8 is live yet.");
    expect(liveSentence(13, 13)).toBe("All 13 are live.");
    expect(listOr(["A", "B", "C"])).toBe("A, B or C");
    expect(shortName("Rebel Junk Holiday Market, twice")).toBe("Rebel Junk");
    expect(shortName("Fall Holistic Festival, twice")).toBe("Fall Holistic Festival");
    expect(
      looksWrongSentence({
        key: "k",
        kind: "looks-wrong",
        lane: NOV7,
        title: "Custer's Christmas Arts & Crafts Show: live, closes before it opens",
        rows: [],
        settles: [],
        primary: { label: "Fix hours", action: "fix-hours" },
        firstDate: "2026-11-20",
      })
    ).toBe("Custer's Christmas Arts & Crafts Show is live on Friday but one day closes before it opens.");
  });
});

describe("decision wording", () => {
  const a = todoEvent("a", { title: "11th Annual Rebel Junk Holiday Market", description: "Friday admission $10 plus fee.", tags: [{ id: "t1", name: "Holiday Market" }], links: [{ kind: "website", href: "https://rebeljunk.com/tickets", label: "rebeljunk.com/tickets" }] });
  const b = todoEvent("b", {
    title: "Rebel Junk Holiday Market",
    description: "Ticket prices had not been announced at the time of this run.",
    importerNote: true,
    whenShort: "Fri 5:30 pm to Sat 4:00 pm",
    tags: [{ id: "t2", name: "Craft Fair" }, { id: "t1", name: "Holiday Market" }],
    features: [{ id: "f1", name: "ADA Accessible" }],
  });

  it("compares copies field by field and marks what differs", () => {
    const rows = compareRows([a, b]);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField["came-from"].differs).toBe(false);
    expect(byField.when.differs).toBe(true);
    expect(byField.about.differs).toBe(true);
    expect(byField.tags.values).toEqual(["Holiday Market", "Craft Fair, Holiday Market"]);
    expect(byField.tags.differs).toBe(true);
    expect(byField.where).toBeUndefined();
  });

  it("suggests the fuller copy in plain words and lists what the others add", () => {
    expect(suggestReason(a, [b])).toBe("the other reads like an importer note");
    expect(suggestReason({ ...a, status: "PUBLISHED" }, [b])).toBe("it is already live");
    expect(takeFromOthers(a, [b])).toEqual(["Craft Fair", "ADA Accessible"]);
  });

  it("keeps a live copy fixed and lets the waiting ones go", () => {
    const decision: Decision = {
      key: "twins:a|b",
      kind: "twins",
      lane: NOV7,
      title: "Rebel Junk Holiday Market, twice",
      rows: [],
      settles: ["b"],
      primary: { label: "Keep the live one", action: "archive-duplicates" },
    };
    expect(fixedCopy(decision, [{ ...a, status: "PUBLISHED" }, b])?.id).toBe("a");
    expect(fixedCopy({ ...decision, settles: ["a", "b"] }, [a, b])).toBeNull();
  });

  it("says what a batch lacks and who it tells", () => {
    expect(lackSentence([a, b])).toBe("What they lack: none has a picture yet.");
    expect(lackSentence([{ ...a, warnings: [] }, { ...b, warnings: [{ flag: "no-features", message: "No features" }] }])).toBe(
      "What they lack: Rebel Junk Holiday Market has no features."
    );
    expect(lackSentence([{ ...a, warnings: [] }])).toBeNull();
    expect(notifySentence([])).toBe("Nobody is notified: none came from an organizer account.");
    expect(notifySentence(["Dana", "Lee"])).toBe("Publishing tells Dana and Lee.");
  });

  it("turns a reason key into the saved text, asking for a note on Other", () => {
    expect(reasonText("1", "")).toBe("Not a market or fair");
    expect(reasonText("5", "  ")).toBeNull();
    expect(reasonText("5", "Duplicate of the fall show")).toBe("Duplicate of the fall show");
  });

  it("opens the editor with the way back to the decision", () => {
    const decision: Decision = {
      key: "single:e1",
      kind: "single",
      lane: NOV7,
      title: "x",
      rows: [{ type: "event", id: "e1" }],
      settles: ["e1"],
      primary: { label: "Publish", action: "publish" },
    };
    expect(editorHref(decision)).toBe("/admin/events/e1?from=todo&d=single%3Ae1");
    expect(editorHref({ ...decision, rows: [{ type: "submission", id: "s1" }] })).toBe("/admin/submissions/s1?from=todo&d=single%3Ae1");
  });
});

describe("held edits", () => {
  const cowboy = todoEvent("c", {
    dates: ["2026-12-12", "2026-12-13"],
    startIso: "2026-12-12T18:00:00.000Z",
    endIso: "2026-12-14T00:00:00.000Z",
  });

  it("proposes the same daily hours for a stretch that opens before it closes", () => {
    expect(splitIntoDailyHours(cowboy)).toEqual([
      { date: "2026-12-12", allDay: false, startTime: "10:00", endTime: "16:00" },
      { date: "2026-12-13", allDay: false, startTime: "10:00", endTime: "16:00" },
    ]);
  });

  it("proposes a first evening and a last day for a stretch that runs overnight", () => {
    const rebel = todoEvent("r", { dates: ["2026-11-06", "2026-11-07"], startIso: "2026-11-07T02:00:00.000Z", endIso: "2026-11-08T00:00:00.000Z" });
    expect(splitIntoDailyHours(rebel)).toEqual([
      { date: "2026-11-06", allDay: false, startTime: "18:00", endTime: "21:00" },
      { date: "2026-11-07", allDay: false, startTime: "10:00", endTime: "16:00" },
    ]);
  });

  it("counts and sends only what changed", () => {
    const days = splitIntoDailyHours(cowboy);
    expect(changeCount(cowboy, {})).toBe(0);
    expect(changeCount(cowboy, { scheduleDays: days, imageUrl: "https://x.test/a.jpg" })).toBe(2);
    expect(editsPayload(cowboy, { imageUrl: "  " })).toBeNull();
    expect(editsPayload(cowboy, { scheduleDays: [{ ...days[0], allDay: true }] })).toEqual({
      scheduleDays: [{ date: "2026-12-12", allDay: true }],
    });
  });

  it("holds a new title, place, tags and features, and counts each field once", () => {
    const tagged = todoEvent("c", {
      title: "Cowboy Christmas",
      tags: [
        { id: "t1", name: "Craft Fair" },
        { id: "t2", name: "Holiday Market" },
      ],
      features: [{ id: "f1", name: "Indoor" }],
    });
    expect(changeCount(tagged, { title: " Cowboy Christmas ", venueId: tagged.venue.id, tagIds: ["t2", "t1"], featureIds: ["f1"] })).toBe(0);
    expect(editsPayload(tagged, { title: " North Idaho's Cowboy Christmas ", venueId: "v2", tagIds: ["t1"], featureIds: ["f1", "f2"] })).toEqual({
      title: "North Idaho's Cowboy Christmas",
      venueId: "v2",
      tagIds: ["t1"],
      featureIds: ["f1", "f2"],
    });
    expect(changeCount(tagged, { tagIds: [], featureIds: [] })).toBe(2);
    expect(titleProblem("  ")).toBe("The title cannot be empty.");
    expect(titleProblem(undefined)).toBeNull();
  });

  it("refuses hours that close before they open and flags a midnight start", () => {
    expect(dayProblem({ date: "2026-11-20", allDay: false, startTime: "10:00", endTime: "08:00" })).toBe("Closes before it opens.");
    expect(dayProblem({ date: "2026-12-06", allDay: false, startTime: "00:00", endTime: "16:00" })).toBe("Opens at 12:00 am.");
    expect(heldDaysProblem([{ date: "2026-12-06", allDay: false, startTime: "00:00", endTime: "16:00" }], SNAPSHOT_NOW)).toBeNull();
    expect(heldDaysProblem([{ date: "2026-11-20", allDay: false, startTime: "10:00", endTime: "08:00" }], SNAPSHOT_NOW)).toBe(
      "Fri Nov 20: Closes before it opens."
    );
  });
});

describe("what the server sends the panes", () => {
  it("words days and stretches", () => {
    const stretch = { startDate: new Date("2026-12-12T18:00:00.000Z"), endDate: new Date("2026-12-14T00:00:00.000Z"), scheduleDays: [] };
    expect(whenLines(stretch, SNAPSHOT_NOW)).toEqual(["Sat Dec 12 10:00 am to Sun Dec 13 4:00 pm, as one stretch"]);
    expect(whenShort(stretch)).toBe("Sat 10:00 am to Sun 4:00 pm");
    const days = {
      ...stretch,
      scheduleDays: [
        { date: "2026-12-13", startTime: "10:00", endTime: "16:00", allDay: false },
        { date: "2026-12-12", startTime: "10:00", endTime: "16:00", allDay: false },
      ],
    };
    expect(whenLines(days, SNAPSHOT_NOW)).toEqual(["Sat Dec 12, 10:00 am to 4:00 pm", "Sun Dec 13, 10:00 am to 4:00 pm"]);
    expect(startLabelOf(days, "2026-12-13")).toBe("Sun 10 am");
    expect(linkLabel("https://www.rebeljunk.com/tickets/")).toBe("rebeljunk.com/tickets");
  });

  it("files dates into rail lanes the way the lane summaries do", () => {
    const saturdays = lanes.map((l) => l.saturday).filter((s): s is string => !!s);
    expect(lanesOf(["2026-11-06", "2026-11-14"], saturdays, false)).toEqual([NOV7, NOV14]);
    expect(lanesOf(["2027-01-09"], saturdays, false)).toEqual(["later"]);
    expect(lanesOf(["2026-10-31"], saturdays, true)).toEqual(["gone"]);
  });
});

describe("result messages", () => {
  const titleOf = (id: string) => ({ e1: "Emerge Holiday Market", e2: "CardCon" })[id] ?? id;

  it("reports publishes, what was already live, what could not go live and who was told", () => {
    expect(publishMessage({ changed: ["a", "b"], alreadyThere: ["c"], refused: [], notified: ["Dana Ruiz"] }, titleOf)).toBe(
      "Published 2. 1 was already live. Told Dana."
    );
    expect(
      publishMessage({ changed: [], alreadyThere: [], refused: [{ id: "e1", reason: "Can't publish yet: no ZIP." }], notified: [] }, titleOf)
    ).toBe("Nothing was published. Emerge Holiday Market stays off the site. Can't publish yet: no ZIP.");
  });

  it("reports rejections, archives, kept copies and Later", () => {
    expect(rejectMessage({ changed: ["e2"], alreadyThere: [], refused: [], notified: [] }, titleOf, "Not a market or fair")).toBe(
      "Kept CardCon off the site."
    );
    expect(rejectMessage({ changed: ["a", "b"], alreadyThere: [], refused: [], notified: [] }, titleOf, "Not a market or fair")).toBe(
      "Rejected 2: Not a market or fair."
    );
    expect(archiveMessage(["a", "b", "c"], titleOf)).toBe("Archived 3.");
    expect(keepMessage("Rebel Junk Holiday Market", true, 1, [])).toBe("Kept Rebel Junk Holiday Market and published it. Archived its twin.");
    expect(laterMessage("tomorrow", "2026-11-03")).toBe("Set aside until tomorrow.");
    expect(laterMessage("next-monday", "2026-11-03")).toBe("Set aside until Monday, Nov 9.");
  });

  it("says how full the week is once the stalls fill", () => {
    const week = {
      key: "2026-11-07",
      saturday: "2026-11-07",
      label: "Nov 7",
      name: "This Saturday",
      live: 1,
      pending: 12,
      draft: 9,
      stalls: [
        { id: "a", title: "A", status: "PENDING" as const, startLabel: "Sat", kind: "event" as const },
        { id: "b", title: "B", status: "PUBLISHED" as const, startLabel: "Sat", kind: "event" as const },
      ],
    };
    expect(weekLiveSentence(week, ["a", "b", "z"])).toBe("Nov 7 is now 2 of 22 live.");
    expect(weekLiveSentence(undefined, ["a"])).toBe("");
  });
});
