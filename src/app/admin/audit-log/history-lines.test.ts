import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import type { HistoryAuditRow } from "@/lib/admin/history";
import { csvLine, dayLabel, groupRows, toHistoryLines } from "./history-lines";

const NOW = new Date("2026-11-03T17:41:00Z");

let seq = 0;
function row(overrides: Partial<HistoryAuditRow> & { meta?: Record<string, unknown> } = {}): HistoryAuditRow {
  seq += 1;
  const { meta, ...rest } = overrides;
  return {
    id: `r${String(seq).padStart(3, "0")}`,
    userId: "admin",
    action: "UPDATE_EVENT",
    targetType: "EVENT",
    targetId: `e${seq}`,
    createdAt: NOW,
    user: { name: "Hunter", email: "hunter@example.com" },
    metadata: (meta ?? {
      previousValue: { status: "PENDING" },
      newValue: { status: "PUBLISHED" },
      details: { title: `Event ${seq}` },
    }) as HistoryAuditRow["metadata"],
    ...rest,
  };
}

describe("groupRows", () => {
  it("gathers a decision at its newest row and keeps other rows in time order", () => {
    const d = { details: { decisionId: "d1", title: "x" }, newValue: { status: "PUBLISHED" } };
    const a = row({ createdAt: new Date("2026-11-03T17:00:00Z"), meta: d });
    const b = row({ createdAt: new Date("2026-11-03T16:00:00Z") });
    const c = row({ createdAt: new Date("2026-11-03T16:59:59Z"), meta: d });
    const groups = groupRows([b, a, c]);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[c.id, a.id], [b.id]]);
  });

  it("drops repeated rows", () => {
    const a = row();
    expect(groupRows([a, a])).toEqual([[a]]);
  });
});

describe("dayLabel", () => {
  it("says Today for the Pacific today and the weekday otherwise", () => {
    expect(dayLabel(NOW, NOW)).toBe("Today, Tuesday Nov 3");
    expect(dayLabel(new Date("2026-11-03T06:00:00Z"), NOW)).toBe("Monday Nov 2");
    expect(dayLabel(new Date("2025-12-20T20:00:00Z"), NOW)).toBe("Saturday Dec 20, 2025");
  });
});

describe("toHistoryLines", () => {
  it("links the record named in a single entry's sentence", () => {
    const r = row({
      targetId: "evt1",
      meta: { previousValue: { status: "PENDING" }, newValue: { status: "PUBLISHED" }, details: { title: "Emerge Holiday Market" } },
    });
    const [line] = toHistoryLines([[r]], "admin", new Map(), NOW);
    expect(line).toMatchObject({
      id: r.id,
      decisionId: null,
      day: "Today, Tuesday Nov 3",
      time: "9:41 am",
      timestamp: "Nov 3, 2026 at 9:41 am",
      sentence: "You published Emerge Holiday Market.",
      link: { title: "Emerge Holiday Market", href: "/admin/events/evt1" },
      records: [],
      canUndo: false,
    });
  });

  it("writes one sentence for a decision, lists its records and asks whether it can be undone", () => {
    const meta = (title: string) => ({
      previousValue: { status: "PENDING" },
      newValue: { status: "PUBLISHED" },
      details: { title, decisionId: "d_1", decisionKey: "ready:2026-11-07" },
    });
    const group = [row({ targetId: "a", meta: meta("Emerge") }), row({ targetId: "b", meta: meta("SouperBowl") })];
    const [line] = toHistoryLines([group], "admin", new Map([["d_1", true]]), NOW);
    expect(line.id).toBe("d_1");
    expect(line.sentence).toBe("You published 2 events for the weekend of Nov 7.");
    expect(line.link).toBeNull();
    expect(line.records).toEqual([
      { title: "Emerge", href: "/admin/events/a" },
      { title: "SouperBowl", href: "/admin/events/b" },
    ]);
    expect(line.canUndo).toBe(true);
  });
});

describe("csvLine", () => {
  it("quotes every value and doubles quotes", () => {
    expect(csvLine(['He said "hi"', null, "a,b"])).toBe('"He said ""hi""","","a,b"');
  });

  it("neutralizes values a spreadsheet would run as a formula", () => {
    expect(csvLine(["=SUM(A1)", "+1", "@x", "-2"])).toBe(`"'=SUM(A1)","'+1","'@x","'-2"`);
  });
});
