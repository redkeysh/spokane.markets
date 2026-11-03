import { describe, expect, it } from "vitest";
import type { VendorAppearanceRow } from "./vendor-appearances";
import { splitAppearancesByTime } from "./vendor-appearances";
import type { Event, Venue, Tag, Feature } from "@prisma/client";

function mockEvent(
  id: string,
  startDate: Date,
): VendorAppearanceRow["event"] {
  const venue = {
    id: "v1",
    name: "Venue",
    address: "1 St",
    city: "Spokane",
    state: "WA",
    zip: "99201",
    lat: 0,
    lng: 0,
    neighborhood: null,
    parkingNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } satisfies Venue;

  return {
    id,
    marketId: null,
    venueId: venue.id,
    title: `Event ${id}`,
    slug: `event-${id}`,
    description: null,
    startDate,
    endDate: startDate,
    imageUrl: null,
    showImageInList: true,
    imageFocalX: 50,
    imageFocalY: 50,
    status: "PUBLISHED",
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    participationMode: null,
    vendorCapacity: null,
    publicIntentListEnabled: null,
    publicIntentNamesEnabled: null,
    publicRosterEnabled: null,
    listingKind: null,
    organizerDisplayName: null,
    organizerPublicContact: false,
    eventType: null,
    occurrenceModel: null,
    timezone: null,
    indoorOutdoor: null,
    shortDescription: null,
    vendorCategoryPolicy: null,
    vendorApplicationState: null,
    vendorApplicationDeadline: null,
    vendorWorkflowMode: null,
    termsAttested: false,
    termsAttestedAt: null,
    specialEventPermitStatus: null,
    expectedAttendance: null,
    streetClosureImpact: null,
    streetClosureNarrative: null,
    insuranceSummary: null,
    safetyPlanSummary: null,
    sanitationPlan: null,
    cancellationPolicy: null,
    accessibilitySummary: null,
    parkingSummary: null,
    restroomAccess: null,
    petPolicy: null,
    paymentMethodsPublic: null,
    productHighlights: null,
    typicalVendorCount: null,
    feeModelVendor: null,
    boothLogistics: null,
    communicationChannels: null,
    equityInclusionNotes: null,
    verificationChecklist: null,
    verificationReviewedAt: null,
    verificationReviewedBy: null,
    complianceFlagged: false,
    complianceNotes: null,
    submittedById: null,
    duplicateOfId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    venue,
    tags: [] as Tag[],
    features: [] as Feature[],
    _count: { vendorEvents: 0 },
    scheduleDays: [],
  };
}

describe("splitAppearancesByTime", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("splits upcoming vs past and caps past", () => {
    const rows: VendorAppearanceRow[] = [
      { event: mockEvent("past1", new Date("2026-01-01T12:00:00.000Z")), kind: "intent" },
      { event: mockEvent("up1", new Date("2026-07-01T12:00:00.000Z")), kind: "vendor_linked" },
      { event: mockEvent("up2", new Date("2026-08-01T12:00:00.000Z")), kind: "intent" },
    ];
    const { upcoming, past } = splitAppearancesByTime(rows, now, { pastLimit: 5 });
    expect(upcoming.map((r) => r.event.id)).toEqual(["up1", "up2"]);
    expect(past.map((r) => r.event.id)).toEqual(["past1"]);
  });
});
