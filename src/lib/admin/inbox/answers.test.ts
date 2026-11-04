import { describe, expect, it } from "vitest";
import { answerLines, createMarketHref } from "./answers";

describe("answerLines", () => {
  it("lists answered fields in the form's order, then answers to removed fields", () => {
    const fields = [
      { id: "name", label: "Market name" },
      { id: "days", label: "Which days?" },
      { id: "empty", label: "Anything else" },
    ];
    const answers = { days: ["Saturday", "Sunday"], name: "Hillyard Market", empty: "  ", old: "Kept", ok: true };
    expect(answerLines(fields, answers)).toEqual([
      { label: "Market name", value: "Hillyard Market" },
      { label: "Which days?", value: "Saturday, Sunday" },
      { label: "old", value: "Kept" },
      { label: "ok", value: "Yes" },
    ]);
  });

  it("survives fields and answers that are not what they should be", () => {
    expect(answerLines(null, "nope")).toEqual([]);
    expect(answerLines([{ nope: 1 }], { a: null })).toEqual([]);
  });
});

describe("createMarketHref", () => {
  it("prefills the new market from the answers and makes the applicant the owner", () => {
    const href = createMarketHref(
      [
        { label: "Market name", value: "Hillyard Night Market" },
        { label: "Website", value: "hillyardmarket.com" },
        { label: "Phone", value: "509 555 0100" },
        { label: "When does it run?", value: "Thursdays, June to September" },
        { label: "Tell us about your market", value: "Food and makers." },
      ],
      { email: "dana@example.com", userId: "u1" }
    );
    const q = new URL(href, "http://x").searchParams;
    expect(new URL(href, "http://x").pathname).toBe("/admin/markets/new");
    expect(q.get("name")).toBe("Hillyard Night Market");
    expect(q.get("websiteUrl")).toBe("hillyardmarket.com");
    expect(q.get("contactPhone")).toBe("509 555 0100");
    expect(q.get("typicalSchedule")).toBe("Thursdays, June to September");
    expect(q.get("description")).toBe("Food and makers.");
    expect(q.get("contactEmail")).toBe("dana@example.com");
    expect(q.get("ownerId")).toBe("u1");
  });

  it("leaves out answers that only share a word with a market field", () => {
    const q = new URL(
      createMarketHref(
        [
          { label: "How did you hear about us?", value: "A friend" },
          { label: "Instagram link", value: "instagram.com/hillyard" },
          { label: "Facebook page URL", value: "facebook.com/hillyard" },
          { label: "When did you start?", value: "2019" },
        ],
        { email: "dana@example.com", userId: null }
      ),
      "http://x"
    ).searchParams;
    expect(q.has("description")).toBe(false);
    expect(q.has("websiteUrl")).toBe(false);
    expect(q.has("typicalSchedule")).toBe(false);
  });

  it("keeps an emailed answer over the applicant's address and needs no account", () => {
    const q = new URL(createMarketHref([{ label: "Contact email", value: "info@market.org" }], { email: "dana@example.com", userId: null }), "http://x")
      .searchParams;
    expect(q.get("contactEmail")).toBe("info@market.org");
    expect(q.has("ownerId")).toBe(false);
  });
});
