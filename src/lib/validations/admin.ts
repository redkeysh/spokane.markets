import { z } from "zod";
import { neighborhoodSlugSchema } from "./common";

export const tagSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
});
export type TagInput = z.infer<typeof tagSchema>;

export const featureSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  icon: z.string().optional().or(z.literal("")),
});
export type FeatureInput = z.infer<typeof featureSchema>;

export const neighborhoodSchema = z.object({
  label: z.string().min(1, "Label is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers, and hyphens only"
    ),
  isActive: z.boolean().optional().default(true),
});
export type NeighborhoodInput = z.infer<typeof neighborhoodSchema>;

export const venueSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(5, "ZIP code is required"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  neighborhood: neighborhoodSlugSchema.optional().or(z.literal("")),
  parkingNotes: z
    .string()
    .max(1000, "Parking notes must be 1000 characters or fewer")
    .optional(),
});

export type VenueInput = z.infer<typeof venueSchema>;

export const listingEvidenceCreateSchema = z
  .object({
    marketId: z.string().optional(),
    eventId: z.string().optional(),
    type: z.enum([
      "SPECIAL_EVENT_PERMIT",
      "INSURANCE_COI",
      "HEALTH_PERMIT",
      "NONPROFIT_DETERMINATION",
      "OTHER",
    ]),
    title: z.string().max(500).optional().or(z.literal("")),
    fileUrl: z.string().url(),
    visibility: z.enum(["ADMIN_ONLY", "ORGANIZER_AND_ADMIN"]).optional(),
    notes: z.string().max(10000).optional().or(z.literal("")),
  })
  .refine(
    (d) => Boolean(d.marketId) !== Boolean(d.eventId),
    "Provide exactly one of marketId or eventId"
  );
export type ListingEvidenceCreateInput = z.infer<typeof listingEvidenceCreateSchema>;

export const listingModerationNoteCreateSchema = z
  .object({
    marketId: z.string().optional(),
    eventId: z.string().optional(),
    note: z.string().min(1).max(20000),
    visibility: z.enum(["ADMIN_ONLY", "ORGANIZER_VISIBLE"]).optional(),
  })
  .refine(
    (d) => Boolean(d.marketId) !== Boolean(d.eventId),
    "Provide exactly one of marketId or eventId"
  );
export type ListingModerationNoteCreateInput = z.infer<typeof listingModerationNoteCreateSchema>;
