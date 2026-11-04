import { describe, expect, it } from "vitest";
import { nextDateOnSite, nextDateSentence, nextDateText, publicNextDateWhere, summarizeNextDate, waitingAhead, type NextDateEvent } from "./next-date";

const NOW = new Date("2026-11-03T18:40:00.000Z");

const ev = (id: string, status: string, start: string, deletedAt: Date | null = null): NextDateEvent => ({
  id,
  title: id,
  status,
  startDate: new Date(start),
  deletedAt,
});

describe("next date on the site", () => {
  it("uses the public market page's rule: Published, not archived, starting now or later", () => {
    expect(publicNextDateWhere(NOW)).toEqual({ status: "PUBLISHED", startDate: { gte: NOW }, deletedAt: null });
    const events = [
      ev("archived", "PUBLISHED", "2026-11-10T18:00:00Z", new Date()),
      ev("pending", "PENDING", "2026-11-07T18:00:00Z"),
      ev("later", "PUBLISHED", "2026-11-21T18:00:00Z"),
      ev("sooner", "PUBLISHED", "2026-11-14T18:00:00Z"),
    ];
    expect(nextDateOnSite(events, NOW)?.id).toBe("sooner");
  });

  it("drops a listing once its first day has started, as the public page does", () => {
    expect(nextDateOnSite([ev("season", "PUBLISHED", "2026-11-01T17:00:00Z")], NOW)).toBeNull();
  });

  it("reads 'none, 6 waiting' when only waiting dates are ahead, and names what publishing would show", () => {
    const events = ["2026-11-27", "2026-11-28", "2026-11-29", "2026-12-11", "2026-12-12", "2026-12-13"].map((d, i) =>
      ev(`k${i}`, "PENDING", `${d}T20:00:00Z`)
    );
    const summary = summarizeNextDate(events, NOW);
    expect(summary.kind).toBe("waiting");
    expect(nextDateText(summary, NOW)).toBe("none, 6 waiting");
    expect(nextDateSentence(summary, NOW)).toBe('On the site, "Next date" shows nothing. Publishing the waiting dates makes it Fri Nov 27.');
    expect(waitingAhead(events, NOW)).toHaveLength(6);
  });

  it("reads the last date when nothing is ahead", () => {
    const summary = summarizeNextDate([ev("fair", "PUBLISHED", "2026-09-26T17:00:00Z")], NOW);
    expect(nextDateText(summary, NOW)).toBe("last Sep 26, 2026");
    expect(nextDateText(summarizeNextDate([], NOW), NOW)).toBe("none");
    expect(nextDateSentence(summarizeNextDate([], NOW), NOW)).toContain("no dates yet");
  });

  it("names the live date", () => {
    const summary = summarizeNextDate([ev("a", "PUBLISHED", "2026-11-14T18:00:00Z"), ev("b", "DRAFT", "2026-11-21T18:00:00Z")], NOW);
    expect(summary).toMatchObject({ kind: "live", waiting: 1 });
    expect(nextDateText(summary, NOW)).toBe("Sat Nov 14");
    expect(nextDateSentence(summary, NOW)).toBe('On the site, "Next date" shows Sat Nov 14.');
  });
});
