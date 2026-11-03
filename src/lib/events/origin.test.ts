import { describe, expect, it } from "vitest";
import { eventOrigin, importCohorts } from "./origin";

const run = (prefix: string, start: string, count: number, stepMs = 20) =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, createdAt: new Date(new Date(start).getTime() + i * stepMs) }));

describe("importCohorts", () => {
  const rows = [
    ...run("a", "2026-10-30T17:45:10Z", 47),
    ...run("b", "2026-11-03T06:22:11Z", 50),
    ...run("h", "2026-04-01T17:00:00Z", 3, 3_600_000),
  ];
  const cohorts = importCohorts(rows);

  it("finds the two imports and labels them by their Pacific date", () => {
    expect(cohorts.get("a0")).toMatchObject({ label: "Import of Oct 30", count: 47 });
    expect(cohorts.get("b49")).toMatchObject({ label: "Import of Nov 2", count: 50 });
    expect(cohorts.has("h0")).toBe(false);
  });

  it("keeps an import that crosses a minute boundary together", () => {
    const crossing = importCohorts(run("c", "2026-10-30T17:45:59.500Z", 12, 100));
    expect(crossing.get("c11")?.count).toBe(12);
  });

  it("adds the time when two imports share a date", () => {
    const two = importCohorts([...run("x", "2026-10-30T17:00:00Z", 10), ...run("y", "2026-10-30T20:00:00Z", 10)]);
    expect(two.get("x0")?.label).toBe("Import of Oct 30 at 10:00 am");
    expect(two.get("y0")?.label).toBe("Import of Oct 30 at 1:00 pm");
  });
});

describe("eventOrigin", () => {
  const cohorts = importCohorts(run("a", "2026-10-30T17:45:10Z", 47));
  const row = { id: "a3", createdAt: new Date("2026-10-30T17:45:10Z"), fromSubmission: false, submittedByRole: null };

  it("prefers a submission, then an organizer account, then an import", () => {
    expect(eventOrigin({ ...row, fromSubmission: true }, cohorts).label).toBe("Sent from the site");
    expect(eventOrigin({ ...row, submittedByRole: "ORGANIZER" }, cohorts).label).toBe("Organizer account");
    expect(eventOrigin(row, cohorts)).toMatchObject({ kind: "import", label: "Import of Oct 30 (47 events)", source: "Import of Oct 30" });
    expect(eventOrigin({ ...row, id: "z" }, cohorts)).toMatchObject({ kind: "hand", label: "Added by hand" });
  });
});
