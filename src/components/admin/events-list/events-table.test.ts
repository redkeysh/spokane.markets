import { describe, expect, it } from "vitest";
import type { EventListRow } from "@/lib/admin/events-query";
import { csvCell, eventsCsv } from "./events-table";

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Kootenai County Fairgrounds, Coeur d'Alene")).toBe('"Kootenai County Fairgrounds, Coeur d\'Alene"');
    expect(csvCell('10th Annual Jacked Up Big Show "BIG GIVE"')).toBe('"10th Annual Jacked Up Big Show ""BIG GIVE"""');
    expect(csvCell("plain")).toBe("plain");
  });

  it("keeps spreadsheets from running a cell as a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@sum")).toBe("'@sum");
  });
});

describe("eventsCsv", () => {
  it("writes a header and one line per event with its ISO start date and its page on the site", () => {
    const row = {
      id: "e1",
      title: "CardCon",
      slug: "cardcon-2026-11-07",
      mark: "DRAFT",
      placeLine: "Kootenai County Fairgrounds, Coeur d'Alene",
      marketName: null,
      firstDate: "2026-11-07",
      startLabel: "Sat Nov 7, 10 am",
      updatedLabel: "Nov 3, 2026 at 9:41 am",
    } as EventListRow;
    const lines = eventsCsv([row], "https://spokane.markets").split("\r\n");
    expect(lines[0]).toBe("Title,Start date,Start,Place,Market,Status,Updated,Page on the site,Id");
    expect(lines[1]).toBe(
      `CardCon,2026-11-07,"Sat Nov 7, 10 am","Kootenai County Fairgrounds, Coeur d'Alene",,Draft,"Nov 3, 2026 at 9:41 am",https://spokane.markets/events/cardcon-2026-11-07,e1`
    );
  });
});
