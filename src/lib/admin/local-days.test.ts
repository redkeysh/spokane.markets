import { describe, expect, it } from "vitest";
import { addDays, weekdayIndex } from "./format";
import { LOCAL_DAYS, LOCAL_DAYS_CHECKED_THROUGH, localDayName, localDayNames, localDaysFor, localDaysNeedCheck } from "./local-days";

describe("local days", () => {
  it("names the 2026 weeks the spec names", () => {
    expect(localDayName("2026-11-28")).toBe("Small Business Saturday");
    expect(localDayNames("2026-11-28")).toEqual(["Small Business Saturday", "Thanksgiving weekend"]);
    expect(localDayName("2026-12-19")).toBe("Saturday before Christmas");
    expect(localDayName("2026-11-07")).toBeNull();
  });

  it("computes each rule for 2026 and 2027", () => {
    const byYear = (year: number) => Object.fromEntries(localDaysFor(year).map((d) => [d.name, d.saturday]));
    expect(byYear(2026)).toEqual({
      "Bloomsday weekend": "2026-05-02",
      "Lilac parade Saturday": "2026-05-16",
      "Hoopfest weekend": "2026-06-27",
      "Labor Day weekend": "2026-09-05",
      "Small Business Saturday": "2026-11-28",
      "Thanksgiving weekend": "2026-11-28",
      "Saturday before Christmas": "2026-12-19",
    });
    expect(byYear(2027)).toEqual({
      "Bloomsday weekend": "2027-05-01",
      "Lilac parade Saturday": "2027-05-15",
      "Hoopfest weekend": "2027-06-26",
      "Labor Day weekend": "2027-09-04",
      "Small Business Saturday": "2027-11-27",
      "Thanksgiving weekend": "2027-11-27",
      "Saturday before Christmas": "2027-12-18",
    });
  });

  it("always lands on a Saturday, its named day in the stated month, for years ahead", () => {
    const months: Record<string, string> = {
      "Small Business Saturday": "11",
      "Thanksgiving weekend": "11",
      "Saturday before Christmas": "12",
      "Bloomsday weekend": "05",
      "Lilac parade Saturday": "05",
      "Hoopfest weekend": "06",
      "Labor Day weekend": "09",
    };
    for (let year = 2026; year <= 2040; year++) {
      for (const day of LOCAL_DAYS) {
        const saturday = day.saturdayFor(year);
        expect(weekdayIndex(saturday), `${day.name} ${year}`).toBe(5);
        const named = day.name === "Bloomsday weekend" ? addDays(saturday, 1) : day.name === "Labor Day weekend" ? addDays(saturday, 2) : saturday;
        expect(named.slice(5, 7), `${day.name} ${year}`).toBe(months[day.name]);
      }
    }
  });

  it("asks for the yearly review once the next year is past the reviewed one", () => {
    expect(localDaysNeedCheck(`${LOCAL_DAYS_CHECKED_THROUGH - 1}-11-03`)).toBe(false);
    expect(localDaysNeedCheck(`${LOCAL_DAYS_CHECKED_THROUGH}-11-03`)).toBe(true);
  });
});
