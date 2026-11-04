import { describe, expect, it } from "vitest";
import { EMPTY_VENDOR, fieldErrorsOf, vendorEditorSchema, vendorWriteData, verificationChecklist } from "./admin-input";

describe("vendorEditorSchema", () => {
  it("accepts an empty profile with a name", () => {
    expect(vendorEditorSchema.safeParse({ ...EMPTY_VENDOR, businessName: "Sunshine Farm" }).success).toBe(true);
  });

  it("words its errors for the owner", () => {
    const result = vendorEditorSchema.safeParse({ ...EMPTY_VENDOR, businessName: " ", slug: "Bad Slug", contactEmail: "dana@" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsOf(result.error)).toEqual({
      businessName: "Add the business name.",
      slug: "Use lowercase letters, numbers and hyphens only.",
      contactEmail: "This email address looks incomplete.",
    });
  });

  it("accepts a bare domain as the website", () => {
    expect(vendorEditorSchema.safeParse({ ...EMPTY_VENDOR, businessName: "A", websiteUrl: "sunshinefarm.com" }).success).toBe(true);
  });
});

describe("vendorWriteData", () => {
  it("writes null for cleared fields so they clear on the site", () => {
    const data = vendorWriteData({ ...EMPTY_VENDOR, businessName: " Sunshine Farm ", description: "  ", contactPhone: "" });
    expect(data.businessName).toBe("Sunshine Farm");
    expect(data.description).toBeNull();
    expect(data.contactPhone).toBeNull();
    expect(data.websiteUrl).toBeNull();
    expect(data.galleryUrls).toEqual([]);
  });

  it("adds https to a bare website and keeps handles for social links", () => {
    const data = vendorWriteData({
      ...EMPTY_VENDOR,
      businessName: "A",
      websiteUrl: "www.sunshinefarm.com",
      facebookUrl: "https://www.facebook.com/sunshinefarm/",
      instagramUrl: "@sunshine.farm",
    });
    expect(data.websiteUrl).toBe("https://www.sunshinefarm.com");
    expect(data.facebookUrl).toBe("sunshinefarm");
    expect(data.instagramUrl).toBe("@sunshine.farm");
  });

  it("keeps the verification and visibility choices", () => {
    const data = vendorWriteData({ ...EMPTY_VENDOR, businessName: "A", verificationStatus: "VERIFIED", contactVisible: true });
    expect(data).toMatchObject({ verificationStatus: "VERIFIED", contactVisible: true, socialLinksVisible: false });
  });
});

describe("verificationChecklist", () => {
  it("lists every rule with whether it is met", () => {
    const checks = verificationChecklist(
      { profileCompletionPercent: 60, unmetRequirements: [{ code: "PROFILE_COMPLETION_BELOW_MINIMUM" }, { code: "MISSING_IMAGE_URL" }] },
      { claimed: true }
    );
    expect(checks).toHaveLength(8);
    expect(checks.find((c) => c.label === "Profile picture")?.met).toBe(false);
    expect(checks.find((c) => c.label === "Description")?.met).toBe(true);
    expect(checks.find((c) => c.label.startsWith("The profile is at least"))).toMatchObject({ met: false, detail: "Now 60%." });
  });

  it("explains the email rule when nobody claimed the profile", () => {
    const [email] = verificationChecklist({ profileCompletionPercent: 100, unmetRequirements: [] }, { claimed: false });
    expect(email).toEqual({ label: "The owner confirmed their account email", met: false, detail: "Nobody has claimed this profile yet." });
  });
});
