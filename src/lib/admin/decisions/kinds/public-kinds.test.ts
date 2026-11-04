import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { buildDecisions } from "../index";
import type { DecisionInput } from "../types";
import type { PublicDecisionItems } from "../../inbox/public-items";

const NOW = new Date("2026-11-03T17:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 18));

const ITEMS: PublicDecisionItems = {
  reviews: [{ id: "r1", createdAt: day(30), rating: 4, author: "Dana", target: "Kendall Yards Night Market" }],
  photos: [{ id: "p1", createdAt: day(29), uploader: "Lee", target: null }],
  reports: [
    { id: "x1", createdAt: day(20), targetType: "EVENT", target: "CardCon", reason: "spam", severity: "MEDIUM" },
    { id: "x2", createdAt: day(28), targetType: "MARKET", target: "Hillyard Market", reason: "scam_or_fraud", severity: "CRITICAL" },
  ],
  applications: [{ id: "a1", createdAt: day(27), formType: "MARKET", name: "Sam Ortiz" }],
  messages: [{ id: "m1", createdAt: day(26), name: "Kim", subject: null }],
  markets: [{ id: "k1", name: "Garland Market", requestedAt: day(25), owner: "Pat" }],
};

function input(items?: PublicDecisionItems): DecisionInput {
  return { now: NOW, events: [], submissions: [], venues: [], memos: [], publicItems: items };
}

describe("public decision kinds", () => {
  it("files every waiting item in the From the public lane, one decision each", () => {
    const { decisions } = buildDecisions(input(ITEMS));
    const byKey = new Map(decisions.map((d) => [d.key, d]));
    expect([...byKey.keys()].sort()).toEqual(
      ["application:a1", "market-verification:k1", "message:m1", "photo:p1", "report:x1", "report:x2", "review:r1"].sort()
    );
    expect(decisions.every((d) => d.lane === "public" && d.settles.length === 0)).toBe(true);

    expect(byKey.get("review:r1")).toMatchObject({
      kind: "review",
      title: "Review of Kendall Yards Night Market",
      detail: "4 of 5 stars, by Dana",
      rows: [{ type: "review", id: "r1", status: "PENDING" }],
      primary: { label: "Approve" },
    });
    expect(byKey.get("photo:p1")).toMatchObject({ title: "Photo for a listing that is gone", detail: "Sent by Lee", primary: { label: "Show photo" } });
    expect(byKey.get("report:x2")).toMatchObject({ title: "Report on Hillyard Market", detail: "Scam or fraud, critical" });
    expect(byKey.get("report:x1")?.detail).toBe("Spam");
    expect(byKey.get("application:a1")).toMatchObject({ title: "Sam Ortiz wants to list a market", detail: "Market application" });
    expect(byKey.get("message:m1")).toMatchObject({ title: "Message from Kim", detail: "From Kim", primary: { label: "Mark read" } });
    expect(byKey.get("market-verification:k1")).toMatchObject({
      kind: "market-verification",
      title: "Verify Garland Market?",
      detail: "Asked by Pat",
      rows: [{ type: "market", id: "k1" }],
    });
  });

  it("orders the lane with critical and high reports first, then oldest first across kinds", () => {
    const items: PublicDecisionItems = {
      ...ITEMS,
      reports: [...ITEMS.reports, { id: "x3", createdAt: day(29), targetType: "EVENT", target: "Fall Fair", reason: "spam", severity: "HIGH" }],
    };
    const submission = {
      id: "s1",
      title: "Harvest Market",
      createdAt: day(19),
      submitterName: "Lee",
      submitterHasAccount: false,
      dates: ["2026-11-14"],
      venueName: "Hall",
      venueCity: "Spokane",
    };
    const { decisions } = buildDecisions({ ...input(items), submissions: [submission] });
    expect(decisions.map((d) => d.key)).toEqual([
      "report:x2",
      "report:x3",
      "submission:s1",
      "report:x1",
      "market-verification:k1",
      "message:m1",
      "application:a1",
      "photo:p1",
      "review:r1",
    ]);
  });

  it("counts the items as waiting in the lane", () => {
    const { lanes } = buildDecisions(input(ITEMS));
    const lane = lanes.find((l) => l.lane === "public")!;
    expect(lane.waiting).toBe(7);
    expect(lane.decisions).toBe(7);
  });

  it("files nothing when the input carries no public items", () => {
    const { decisions, lanes } = buildDecisions(input());
    expect(decisions).toEqual([]);
    expect(lanes.find((l) => l.lane === "public")!.waiting).toBe(0);
  });

  it("sets a snoozed item aside like any decision", () => {
    const later = { kind: "later", key: "review:r1", until: new Date("2026-11-04T08:00:00Z") };
    const result = buildDecisions({ ...input(ITEMS), memos: [later] });
    expect(result.decisions.some((d) => d.key === "review:r1")).toBe(false);
    expect(result.snoozed.map((s) => s.decision.key)).toEqual(["review:r1"]);
  });
});
