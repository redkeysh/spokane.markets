import { z } from "zod";
import { imageUrlSchema, neighborhoodSlugSchema } from "./common";
import { eventScheduleDaySchema } from "./event";

const submissionSchemaBase = z.object({
  submitterName: z.string().min(1, "Name is required"),
  submitterEmail: z.string().email("Valid email is required"),
  eventTitle: z.string().min(1, "Event title is required"),
  eventDescription: z.string().optional(),
  /** One or more days (same model as admin event form). */
  scheduleDays: z.array(eventScheduleDaySchema).min(1, "Add at least one day"),
  timezone: z.string().optional().or(z.literal("")),
  imageUrl: imageUrlSchema.optional().or(z.literal("")),
  venueName: z.string().min(1, "Venue name is required"),
  venueAddress: z.string().min(1, "Venue address is required"),
  venueCity: z.string().min(1, "City is required"),
  venueState: z.string().min(1, "State is required"),
  venueZip: z
    .string()
    .min(5, "ZIP must be at least 5 characters")
    .max(20, "ZIP is too long"),
  marketId: z.string().optional().or(z.literal("")),
  tagIds: z.array(z.string()).optional().default([]),
  featureIds: z.array(z.string()).optional().default([]),
  facebookUrl: z.string().url().optional().or(z.literal("")),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  /** Honeypot */
  company: z.string().max(0).optional(),
});

export const submissionSchema = submissionSchemaBase;

/** Schema for authenticated submissions (submitter from session) */
export const submissionSchemaAuthed = submissionSchemaBase.omit({
  submitterName: true,
  submitterEmail: true,
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type SubmissionInputAuthed = z.infer<typeof submissionSchemaAuthed>;

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  subject: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
  /** Honeypot */
  company: z.string().max(0).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const subscriberSchema = z.object({
  email: z.string().email("Valid email is required"),
  areas: z.array(neighborhoodSlugSchema).optional(),
  /** Honeypot */
  company: z.string().max(0).optional(),
});

export type SubscriberInput = z.infer<typeof subscriberSchema>;

export const reviewSchema = z.object({
  eventId: z.string().optional(),
  marketId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(2000, "Review must be 2000 characters or less").optional(),
  parkingRating: z.number().int().min(1).max(5).optional(),
  varietyRating: z.number().int().min(1).max(5).optional(),
  valueRating: z.number().int().min(1).max(5).optional(),
  crowdingRating: z.number().int().min(1).max(5).optional(),
  weatherPlanRating: z.number().int().min(1).max(5).optional(),
  accessibilityRating: z.number().int().min(1).max(5).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const reportSchema = z.object({
  targetType: z.enum(["EVENT", "MARKET", "VENDOR", "REVIEW"]),
  targetId: z.string().min(1, "Target ID is required"),
  reason: z
    .enum(["spam", "scam_or_fraud", "inappropriate", "duplicate_listing", "other"])
    .optional(),
  notes: z.string().max(500).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

const promotionSchemaBase = z.object({
  eventId: z.string().optional().or(z.literal("")),
  vendorProfileId: z.string().optional().or(z.literal("")),
  type: z.enum(["SPONSORED", "PARTNERSHIP", "FEATURED"]),
  sponsorName: z.string().optional().nullable(),
  imageUrl: imageUrlSchema,
  linkUrl: z.string().url().optional().or(z.literal("")),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  sortOrder: z.number().int().min(0).optional(),
});

export const promotionSchema = promotionSchemaBase.superRefine((data, ctx) => {
  const hasEvent = !!data.eventId?.trim();
  const hasVendor = !!data.vendorProfileId?.trim();

  if (hasEvent === hasVendor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["eventId"],
      message: "Select exactly one promotion target (event or vendor).",
    });
  }

  if (data.startDate && data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after the start date.",
    });
  }
});
export type PromotionInput = z.infer<typeof promotionSchema>;

export const promotionPatchSchema = promotionSchemaBase.partial().superRefine((data, ctx) => {
  const hasEvent = data.eventId !== undefined ? !!data.eventId?.trim() : undefined;
  const hasVendor = data.vendorProfileId !== undefined ? !!data.vendorProfileId?.trim() : undefined;

  if (hasEvent !== undefined && hasVendor !== undefined && hasEvent === hasVendor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["eventId"],
      message: "Select exactly one promotion target (event or vendor).",
    });
  }

  if (data.startDate && data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after the start date.",
    });
  }
});
export type PromotionPatchInput = z.infer<typeof promotionPatchSchema>;
