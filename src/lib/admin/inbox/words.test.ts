import { describe, expect, it } from "vitest";
import {
  applicationMessage,
  applicationTitle,
  approvalConsequence,
  excerpt,
  leadTimeText,
  personName,
  reportReasonText,
  starsText,
  statusMessage,
  vendorTypeText,
  willingnessText,
} from "./words";

describe("inbox words", () => {
  it("counts stars", () => {
    expect(starsText(4)).toBe("4 of 5 stars");
    expect(starsText(1)).toBe("1 of 5 star");
    expect(starsText(9)).toBe("5 of 5 stars");
  });

  it("names report reasons", () => {
    expect(reportReasonText("scam_or_fraud")).toBe("Scam or fraud");
    expect(reportReasonText("wrong_hours")).toBe("Wrong hours");
    expect(reportReasonText(null)).toBe("No reason given");
  });

  it("says what an application asks for and what approving it does", () => {
    expect(applicationTitle("Dana Lee", "VENDOR")).toBe("Dana Lee wants to sell as a vendor");
    expect(applicationTitle(" ", "MARKET")).toBe("Someone wants to list a market");
    expect(approvalConsequence("MARKET", true)).toBe("Approving makes their account an organizer account.");
    expect(approvalConsequence("MARKET", false)).toBeNull();
  });

  it("reads vendor survey answers in plain words without dashes", () => {
    expect(vendorTypeText("food-beverage")).toBe("Food or drink");
    expect(leadTimeText("2-plus-months")).toBe("2 months or more");
    expect(willingnessText("10-25")).toBe("$10 to $25 a month");
    expect(willingnessText("")).toBe("Not answered");
    expect(vendorTypeText("custom")).toBe("custom");
  });

  it("cuts excerpts at a word", () => {
    expect(excerpt("a  b\n c")).toBe("a b c");
    const text = "word ".repeat(60);
    const cut = excerpt(text, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/wor…$/);
  });

  it("names people by name, else by email", () => {
    expect(personName({ name: " Dana ", email: "d@x.com" })).toBe("Dana");
    expect(personName({ name: null, email: "lee@x.com" })).toBe("lee");
    expect(personName(null, "Nobody")).toBe("Nobody");
  });

  it("reports status decisions", () => {
    expect(statusMessage("review", "APPROVED", 3, 1, 0)).toBe("Approved 3 reviews. 1 was already approved.");
    expect(statusMessage("photo", "APPROVED", 1, 0, 0)).toBe("Showing 1 photo on the site.");
    expect(statusMessage("message", "READ", 0, 2, 1)).toBe("Nothing changed. 2 were already read. 1 is gone.");
  });

  it("reports application decisions with their effects", () => {
    expect(applicationMessage("APPROVED", "Dana Lee", { role: "VENDOR", told: "Dana Lee" })).toBe(
      "Approved Dana Lee's application. Their account is now a vendor account. Dana was told."
    );
    expect(applicationMessage("NEEDS_INFO", "Dana")).toBe("Asked Dana for more information.");
  });

  it("never uses dashes as punctuation", () => {
    const all = [
      statusMessage("report", "DISMISSED", 2, 0, 0),
      applicationMessage("DUPLICATE", "Dana", { verification: "VERIFIED" }),
      willingnessText("50-plus"),
      leadTimeText("1-week"),
    ].join(" ");
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(all).not.toMatch(dashes);
  });
});
