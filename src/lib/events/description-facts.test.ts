import { describe, expect, it } from "vitest";
import { findFacts, namedDayDate, parseMonthDay, parseRange, sentencesOf, statedHours } from "./description-facts";

/** The zero-width space some imported descriptions carry on a line of its own. */
const ZWSP = String.fromCharCode(0x200b);

/** Descriptions from the 2026-11-03 snapshot, as the imports wrote them. */
const SNAPSHOT = {
  cowboy:
    "Western-themed holiday gift market in Buildings 1, 2, 3 and 7 at the Kootenai County Fairgrounds, hosted by the North Idaho State Fair, with free Santa photos in Building 2. Admission not published. Vendor applications open.",
  merry:
    "Silver Lake Mall's holiday market of local artisans and crafters in the former JOANN space, open Friday and Saturday 10am-7pm and Sunday 10am-6pm on four weekends from Black Friday through Dec 20. Black Friday opens at 9am.",
  rebelJunk:
    "Vintage, handmade and holiday decor market by Rebel Junk with more than 100 booths in the Jacklin Building at the Kootenai County Fairgrounds, with live music and a bar on Friday. Friday admission $10 plus fee and includes Saturday; Saturday $5 plus fee; children 12 and under free.",
  rebelJunkImport:
    "Rebel Junk Markets brings more than 100 booths of vintage dealers, boutiques, artists and makers to the Kootenai County Fairgrounds for a two-day holiday market. Ticket prices had not been announced at the time of this run; children 12 and under are free.",
  farmers:
    "Saturday farmers market run by the Spokane Farmers' Market at Coeur d'Alene Park in Browne's Addition, with produce, food and local goods. November Saturdays run 10am to 1pm; November 21 is the market's Holiday Market Saturday. Admission not published.",
  folk:
    "The Spokane Folklore Society's 31st annual Fall Folk Festival fills The Lair at Spokane Community College with music and dance stages plus a marketplace of about 40 artisan and cultural vendors selling jewelry, pottery, leather, textiles and instruments. Admission is free; donations accepted. Saturday 11am-8pm, Sunday 11am-5pm.",
  quarry:
    "Two-day holiday market run by The Scale House Market at The Quarry with more than 100 local vendors in indoor and outdoor booths, live music and kids' activities. Free admission. Vendor applications open; indoor booth $225, outdoor $150, no deadline published.",
  winterfest:
    "Community tree lighting with an outdoor plaza market of local artisans, handmade crafts and seasonal treats, organized by City of Post Falls on the City Hall campus. Free admission. Vendor applications open; 10x10 booth $50, due November 20, 2026.",
  valley:
    "City of Spokane Valley Parks & Recreation hosts its holiday vendor market at CenterPlace and the West Lawn Plaza with indoor and outdoor booths of craft, artisan and small-business goods, holiday music and beverages. Admission is free. Vendor applications open; booths are $50 per day and are reviewed weekly until spaces fill, with fees due by Dec 1.",
  postFalls:
    "Handmade gifts and seasonal decor from local vendors, organized by City of Post Falls Parks & Recreation at two locations, the Trailhead Event Center and the Black Bay Depot. Admission not published. The vendor application deadline was listed as October 18, 2026.",
  kendall:
    "Kendall Yards Night Market's Christmas Market runs inside a heated tent on Summit Parkway during the Night Market Winter Festival, with local vendors, live music, carolers and Santa. Admission is free. Vendor applications are closed.",
  skiSwap:
    "Consignment swap of new and used winter sports gear in Buildings 1 and 2 at the Kootenai County Fairgrounds, with individual sellers registering through myskiswap.com. Free admission. Additional vendors are not being accepted.",
  silverLake:
    "Silver Lake Mall's indoor community market with local artists, artisans, makers and crafters, plus food and entertainment. Admission is free. Vendor applications are accepted on a rolling basis.",
  potters:
    "The Spokane Potters' Guild sells handmade bowls and other work by its member artists at The Lair at Spokane Community College, with soup from Feast World Kitchen served in a bowl for $15. No admission charge is stated.",
  cheney:
    "Craft fair fundraiser run by the Cheney Blackhawk Booster Club at Cheney High School. Admission $2 per adult; students and children 12 and under free. A vendor application form is posted; status and deadline not published.",
  mead:
    "More than 150 vendors and thousands of customers gather for holiday shopping at our annual Mead Bandwagon Craft Fair supporting the Mead HS Band & Color Guard\n" +
    ZWSP +
    "\nLocal and regional crafters selling handmade goods\nFood vendors and concessions available\n$2 entry (kids 12 and under free)\nSupports Mead Band & Color Guard",
  snowflake:
    "St. Luke's Episcopal Church Women's Guild holds its Snowflake Faire Christmas bazaar in the parish hall with crafts and gifts, a pantry and bake table, jewelry, a treasure trove of donated household goods, raffle baskets and lunch. Proceeds support community outreach.",
  rogers: "Crafts, Gifts and Decor\nFood & Beverages\nArtisan Baked Goods\nFREE photos with Santa \nChristmas Tree Alley Raffle",
};

const kinds = (description: string) => findFacts(description).map((f) => f.kind);

describe("findFacts on the snapshot's descriptions", () => {
  it("reads North Idaho's Cowboy Christmas as the decision pane shows it", () => {
    expect(findFacts(SNAPSHOT.cowboy)).toEqual([
      { kind: "vendor-applications", state: "open", text: "Vendor applications open" },
      { kind: "importer-note", sentence: "Admission not published." },
    ]);
  });

  it("finds free admission however it is worded", () => {
    for (const description of [SNAPSHOT.kendall, SNAPSHOT.skiSwap, SNAPSHOT.silverLake, SNAPSHOT.folk, SNAPSHOT.quarry]) {
      expect(kinds(description)).toContain("free-admission");
    }
    expect(findFacts(SNAPSHOT.kendall)[0]).toEqual({ kind: "free-admission", text: "Admission is free" });
    expect(findFacts("Admission and parking are free.")[0]).toEqual({ kind: "free-admission", text: "Admission and parking are free" });
    expect(findFacts("Free and open to all ages.")[0]).toMatchObject({ kind: "free-admission" });
  });

  it("does not read free photos, free children or an unstated charge as free admission", () => {
    expect(kinds(SNAPSHOT.rogers)).toEqual([]);
    expect(kinds(SNAPSHOT.rebelJunk)).not.toContain("free-admission");
    expect(kinds(SNAPSHOT.potters)).not.toContain("free-admission");
    expect(kinds(SNAPSHOT.snowflake)).toEqual([]);
  });

  it("does not read free admission for some, or beside an admission price, as free for everyone", () => {
    expect(kinds("Free admission for kids under 12; adults $5.")).not.toContain("free-admission");
    expect(kinds("Admission is free for seniors.")).not.toContain("free-admission");
    expect(kinds("Free admission, $3 parking.")).not.toContain("free-admission");
    expect(findFacts("Free admission for kids under 12; adults $5. Free admission on Sunday.")[0]).toEqual({ kind: "free-admission", text: "Free admission" });
    expect(kinds("Free admission; vendor booths $40.")).toContain("free-admission");
    expect(kinds("Free admission for all ages.")).toContain("free-admission");
  });

  it("reads admission prices, leaving bowls and booths out", () => {
    const prices = (d: string) => findFacts(d).filter((f) => f.kind === "admission-price").map((f) => (f.kind === "admission-price" ? f.text : ""));
    expect(prices(SNAPSHOT.rebelJunk)).toEqual(["Friday admission $10 plus fee and includes Saturday; Saturday $5 plus fee; children 12 and under free"]);
    expect(prices(SNAPSHOT.cheney)).toEqual(["$2 per adult; students and children 12 and under free"]);
    expect(prices(SNAPSHOT.mead)).toEqual(["$2 entry (kids 12 and under free)"]);
    expect(prices("Admission: $2 (Children 5 & under free)")).toEqual(["$2 (Children 5 & under free)"]);
    expect(prices(SNAPSHOT.potters)).toEqual([]);
    expect(prices(SNAPSHOT.quarry)).toEqual([]);
  });

  it("reads whether vendor applications are open or closed", () => {
    const vendor = (d: string) => findFacts(d).find((f) => f.kind === "vendor-applications");
    expect(vendor(SNAPSHOT.kendall)).toEqual({ kind: "vendor-applications", state: "closed", text: "Vendor applications are closed" });
    expect(vendor(SNAPSHOT.skiSwap)).toMatchObject({ state: "closed" });
    expect(vendor(SNAPSHOT.silverLake)).toMatchObject({ state: "open" });
    expect(vendor("Vendor and artist alley applications open.")).toMatchObject({ state: "open" });
    expect(vendor(SNAPSHOT.cheney)).toBeUndefined();
  });

  it("reads no longer accepting vendors as closed", () => {
    const vendor = (d: string) => findFacts(d).find((f) => f.kind === "vendor-applications");
    expect(vendor("We are no longer accepting vendors.")).toEqual({ kind: "vendor-applications", state: "closed", text: "No longer accepting vendors" });
    expect(vendor("Sorry, no longer accepting vendor applications for 2026.")).toMatchObject({ state: "closed" });
    expect(vendor("We are not currently accepting new vendors.")).toMatchObject({ state: "closed" });
    expect(vendor("We stopped accepting applications in October.")).toMatchObject({ state: "closed" });
    expect(vendor("Vendor applications are no longer being accepted.")).toMatchObject({ state: "closed" });
    expect(vendor("Now accepting vendors for the spring season.")).toMatchObject({ state: "open" });
  });

  it("reads the booth fee and the deadline", () => {
    expect(findFacts(SNAPSHOT.quarry).find((f) => f.kind === "booth-fee")).toEqual({ kind: "booth-fee", text: "indoor booth $225, outdoor $150" });
    expect(findFacts(SNAPSHOT.winterfest).filter((f) => f.kind === "booth-fee" || f.kind === "application-deadline")).toEqual([
      { kind: "booth-fee", text: "10x10 booth $50" },
      { kind: "application-deadline", date: "2026-11-20", text: "November 20, 2026" },
    ]);
    expect(findFacts(SNAPSHOT.valley).find((f) => f.kind === "booth-fee")).toEqual({ kind: "booth-fee", text: "$50 per day" });
    expect(findFacts(SNAPSHOT.valley).find((f) => f.kind === "application-deadline")).toEqual({ kind: "application-deadline", date: null, text: "Dec 1" });
    expect(findFacts(SNAPSHOT.valley, { year: 2026 }).find((f) => f.kind === "application-deadline")).toMatchObject({ date: "2026-12-01" });
    expect(findFacts(SNAPSHOT.postFalls).find((f) => f.kind === "application-deadline")).toEqual({
      kind: "application-deadline",
      date: "2026-10-18",
      text: "October 18, 2026",
    });
  });

  it("finds the sentences an import left behind, whole, so removing one leaves clean text", () => {
    const notes = (d: string) => findFacts(d).flatMap((f) => (f.kind === "importer-note" ? [f.sentence] : []));
    expect(notes(SNAPSHOT.farmers)).toEqual(["Admission not published."]);
    expect(notes(SNAPSHOT.rebelJunkImport)).toEqual(["Ticket prices had not been announced at the time of this run; children 12 and under are free."]);
    expect(notes(SNAPSHOT.potters)).toEqual(["No admission charge is stated."]);
    expect(notes("Holistic products. Admission not published for this date.")).toEqual(["Admission not published for this date."]);
    expect(notes(SNAPSHOT.cheney)).toEqual([]);
  });

  it("reads weekday hours", () => {
    expect(statedHours(SNAPSHOT.folk)).toEqual([
      { date: null, weekday: "Saturday", startTime: "11:00", endTime: "20:00" },
      { date: null, weekday: "Sunday", startTime: "11:00", endTime: "17:00" },
    ]);
    expect(statedHours(SNAPSHOT.farmers)).toEqual([{ date: null, weekday: "Saturday", startTime: "10:00", endTime: "13:00" }]);
    expect(findFacts(SNAPSHOT.folk).find((f) => f.kind === "hours")).toMatchObject({ text: "Saturday 11am-8pm; Sunday 11am-5pm" });
  });

  it("reads A Very Merry Market's hours, with Black Friday's earlier opening when the year is known", () => {
    expect(statedHours(SNAPSHOT.merry)).toEqual([
      { date: null, weekday: "Friday", startTime: "10:00", endTime: "19:00" },
      { date: null, weekday: "Saturday", startTime: "10:00", endTime: "19:00" },
      { date: null, weekday: "Sunday", startTime: "10:00", endTime: "18:00" },
    ]);
    expect(statedHours(SNAPSHOT.merry, { year: 2026 })).toEqual([
      { date: "2026-11-27", weekday: "Friday", startTime: "09:00", endTime: "19:00" },
      { date: null, weekday: "Friday", startTime: "10:00", endTime: "19:00" },
      { date: null, weekday: "Saturday", startTime: "10:00", endTime: "19:00" },
      { date: null, weekday: "Sunday", startTime: "10:00", endTime: "18:00" },
    ]);
  });

  it("finds nothing in an empty description, and nothing in the Cowboy Christmas text that it does not state", () => {
    expect(findFacts(null)).toEqual([]);
    expect(findFacts("   ")).toEqual([]);
    expect(kinds(SNAPSHOT.cowboy)).not.toContain("hours");
    expect(kinds(SNAPSHOT.cowboy)).not.toContain("free-admission");
  });
});

describe("day and hour phrases", () => {
  it("reads ranges of days, daily hours, dated hours and times after the days", () => {
    expect(statedHours("Open Fri-Sun 9am-4pm.").map((d) => d.weekday)).toEqual(["Friday", "Saturday", "Sunday"]);
    expect(statedHours("Open Thursday through Saturday, 10 a.m. to 4 p.m.").map((d) => [d.weekday, d.startTime, d.endTime])).toEqual([
      ["Thursday", "10:00", "16:00"],
      ["Friday", "10:00", "16:00"],
      ["Saturday", "10:00", "16:00"],
    ]);
    expect(statedHours("Open daily 10am-5pm.")).toHaveLength(7);
    expect(statedHours("Join us December 5 & 6, 9am-3pm.", { year: 2026 })).toEqual([
      { date: "2026-12-05", weekday: "Saturday", startTime: "09:00", endTime: "15:00" },
      { date: "2026-12-06", weekday: "Sunday", startTime: "09:00", endTime: "15:00" },
    ]);
    expect(statedHours("Join us December 5 & 6, 9am-3pm.")).toEqual([]);
    expect(statedHours("Hours are 10am-4pm Saturday and Sunday.").map((d) => d.weekday)).toEqual(["Saturday", "Sunday"]);
  });

  it("leaves vendor setup, load-in and teardown times out of the public's hours", () => {
    expect(statedHours("Vendor setup Friday 4pm-8pm. Market Saturday 9am-3pm.")).toEqual([
      { date: null, weekday: "Saturday", startTime: "09:00", endTime: "15:00" },
    ]);
    expect(statedHours("Load-in Friday 3pm-7pm; show hours Saturday 10am-5pm.").map((d) => d.weekday)).toEqual(["Saturday"]);
    expect(statedHours("Open Saturday 9am-3pm, vendor check-in 7am-8:30am.").map((d) => [d.weekday, d.startTime])).toEqual([["Saturday", "09:00"]]);
    expect(statedHours("Friday 4pm-8pm for vendor setup, Saturday 9am-3pm.").map((d) => d.weekday)).toEqual(["Saturday"]);
    expect(statedHours("Saturday 9am-3pm with setup from 7am.").map((d) => d.weekday)).toEqual(["Saturday"]);
    expect(statedHours("Vendor setup December 4, 3pm-7pm. Market December 5, 9am-3pm.", { year: 2026 })).toEqual([
      { date: "2026-12-05", weekday: "Saturday", startTime: "09:00", endTime: "15:00" },
    ]);
  });

  it("skips times it cannot read with confidence", () => {
    expect(statedHours("Ages 5-12 welcome on Saturday.")).toEqual([]);
    expect(statedHours("Hours 9am-3pm.")).toEqual([]);
    expect(statedHours("Saturday 10-4.")).toEqual([]);
    expect(statedHours("Friday 8pm-2am.")).toEqual([]);
  });

  it("reads clock times plainly", () => {
    expect(parseRange("10am", "7pm")).toEqual({ startTime: "10:00", endTime: "19:00" });
    expect(parseRange("10", "4pm")).toEqual({ startTime: "10:00", endTime: "16:00" });
    expect(parseRange("1", "5pm")).toEqual({ startTime: "13:00", endTime: "17:00" });
    expect(parseRange("9 a.m.", "noon")).toEqual({ startTime: "09:00", endTime: "12:00" });
    expect(parseRange("10:30am", "4")).toEqual({ startTime: "10:30", endTime: "16:00" });
    expect(parseRange("10:00", "16:00")).toEqual({ startTime: "10:00", endTime: "16:00" });
  });

  it("knows the named days and dates", () => {
    expect(namedDayDate("Black Friday", 2026)).toBe("2026-11-27");
    expect(namedDayDate("Small Business Saturday", 2026)).toBe("2026-11-28");
    expect(namedDayDate("Thanksgiving", 2027)).toBe("2027-11-25");
    expect(parseMonthDay("Nov. 20th", 2026)).toBe("2026-11-20");
    expect(parseMonthDay("February 30, 2027")).toBeNull();
  });

  it("splits sentences without breaking on abbreviations", () => {
    expect(sentencesOf("St. Luke's holds a bazaar. Admission not published.")).toEqual(["St. Luke's holds a bazaar.", "Admission not published."]);
    expect(sentencesOf(`Opens 10 a.m. Saturday.\n${ZWSP}\nSecond line`)).toEqual(["Opens 10 a.m. Saturday.", "Second line"]);
  });
});
