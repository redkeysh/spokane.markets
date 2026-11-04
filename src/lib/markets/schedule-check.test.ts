import { describe, expect, it } from "vitest";
import { checkTypicalSchedule, namedDays } from "./schedule-check";

const days = (text: string) => [...(namedDays(text)?.weekdays ?? [])].sort();

describe("namedDays", () => {
  it("reads the ways owners write their days", () => {
    expect(days("Every Saturday, May to October")).toEqual([5]);
    expect(days("Fridays to Sundays, 12:00 to 4:00 pm")).toEqual([4, 5, 6]);
    expect(days("Fri-Sun 10am-4pm")).toEqual([4, 5, 6]);
    expect(days("Wednesdays and Saturdays")).toEqual([2, 5]);
    expect(days("Weekends in December")).toEqual([5, 6]);
    expect(days("Daily")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days("Saturday through Monday")).toEqual([0, 5, 6]);
    expect(namedDays("Second Saturday of the month")?.nth).toBe(2);
    expect(namedDays("Last Sunday of the month")?.nth).toBe(-1);
  });

  it("finds nothing to check in text without days", () => {
    expect(namedDays("May to October")).toBeNull();
    expect(namedDays("")).toBeNull();
    expect(namedDays(null)).toBeNull();
  });
});

describe("checkTypicalSchedule", () => {
  it("says so when the dates fall on other days than the schedule names", () => {
    const check = checkTypicalSchedule("Every Saturday", ["2026-11-27", "2026-11-28", "2026-11-29", "2026-12-11", "2026-12-12", "2026-12-13"]);
    expect(check?.message).toBe('The typical schedule says "Every Saturday", but 4 of its 6 dates fall on Fridays and Sundays.');
    expect(check?.offDates).toEqual(["2026-11-27", "2026-11-29", "2026-12-11", "2026-12-13"]);
  });

  it("says so when every date is off", () => {
    expect(checkTypicalSchedule("Saturdays", ["2026-11-27"])?.message).toBe('The typical schedule says "Saturdays", but its date falls on Fridays.');
  });

  it("checks the week of the month", () => {
    expect(checkTypicalSchedule("Second Saturday of the month", ["2026-11-14", "2027-01-09", "2027-02-13"])).toBeNull();
    expect(checkTypicalSchedule("Second Saturday of the month", ["2026-11-14", "2027-01-16"])?.message).toBe(
      'The typical schedule says "Second Saturday of the month", but 1 date is not the second Saturday of its month.'
    );
  });

  it("is quiet when everything fits or there is nothing to compare", () => {
    expect(checkTypicalSchedule("Fridays to Sundays", ["2026-11-27", "2026-11-28", "2026-11-29"])).toBeNull();
    expect(checkTypicalSchedule("Every Saturday", [])).toBeNull();
    expect(checkTypicalSchedule(null, ["2026-11-27"])).toBeNull();
  });
});
