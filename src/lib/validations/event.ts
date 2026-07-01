import { z } from "zod";
import { imageUrlSchema, participationModeEnum } from "./common";
import { organizerOnboardingFieldsSchema } from "./organizer-onboarding";

/** Shared by event forms and public submission `scheduleDays`. */
export const eventScheduleDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    allDay: z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm").optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm").optional(),
  })
  .refine((d) => d.allDay || (d.startTime && d.endTime), {
    message: "Start and end time required when not all day",
    path: ["startTime"],
  });

export const eventSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    slug: z.string().min(1, "Slug is required"),
    description: z.string().optional(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    timezone: z.string().optional().nullable(),
    venueId: z.string().optional().or(z.literal("")),
    venueName: z.string().optional().or(z.literal("")),
    venueAddress: z.string().optional().or(z.literal("")),
    venueCity: z.string().optional().or(z.literal("")),
    venueState: z.string().optional().or(z.literal("")),
    venueZip: z.string().optional().or(z.literal("")),
    venueLat: z.number().min(-90).max(90).optional(),
    venueLng: z.number().min(-180).max(180).optional(),
    marketId: z.string().optional(),
    imageUrl: imageUrlSchema,
    showImageInList: z.boolean().optional(),
    imageFocalX: z.number().int().min(0).max(100).optional(),
    imageFocalY: z.number().int().min(0).max(100).optional(),
    status: z.enum(["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "CANCELLED"]),
    websiteUrl: z.string().url().optional().or(z.literal("")),
    facebookUrl: z.string().url().optional().or(z.literal("")),
    instagramUrl: z.string().url().optional().or(z.literal("")),
    tagIds: z.array(z.string()).optional(),
    featureIds: z.array(z.string()).optional(),
    scheduleDays: z.array(eventScheduleDaySchema).optional(),
    participationMode: z
      .union([participationModeEnum, z.literal("")])
      .optional()
      .nullable()
      .transform((v) => (v === "" ? undefined : v)),
    vendorCapacity: z.number().int().min(0).nullable().optional(),
    publicIntentListEnabled: z.boolean().optional().nullable(),
    publicIntentNamesEnabled: z.boolean().optional().nullable(),
    publicRosterEnabled: z.boolean().optional().nullable(),
    complianceFlagged: z.boolean().optional(),
    complianceNotes: z.string().max(10000).optional().or(z.literal("")),
  })
  .merge(organizerOnboardingFieldsSchema)
  .refine(
    (data) => {
      const hasVenue = !!data.venueId?.trim();
      const hasInline =
        !!data.venueName?.trim() &&
        !!data.venueAddress?.trim() &&
        !!data.venueCity?.trim() &&
        !!data.venueState?.trim() &&
        !!data.venueZip?.trim() &&
        data.venueZip.length >= 5;
      return hasVenue || hasInline;
    },
    { message: "Select a venue or enter an address", path: ["venueId"] }
  )
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
      return end.getTime() >= start.getTime();
    },
    { message: "End date must be on or after the start date", path: ["endDate"] }
  );

export type EventInput = z.infer<typeof eventSchema>;

export const attendanceSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["GOING", "INTERESTED"]),
});
export type AttendanceInput = z.infer<typeof attendanceSchema>;

export const organizerEventSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    slug: z.string().min(1, "Slug is required"),
    description: z.string().optional(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    timezone: z.string().optional().nullable(),
    venueId: z.string().optional().or(z.literal("")),
    venueName: z.string().optional().or(z.literal("")),
    venueAddress: z.string().optional().or(z.literal("")),
    venueCity: z.string().optional().or(z.literal("")),
    venueState: z.string().optional().or(z.literal("")),
    venueZip: z.string().optional().or(z.literal("")),
    venueLat: z.number().min(-90).max(90).optional(),
    venueLng: z.number().min(-180).max(180).optional(),
    marketId: z.string().optional(),
    imageUrl: imageUrlSchema,
    showImageInList: z.boolean().optional(),
    imageFocalX: z.number().int().min(0).max(100).optional(),
    imageFocalY: z.number().int().min(0).max(100).optional(),
    websiteUrl: z.string().url().optional().or(z.literal("")),
    facebookUrl: z.string().url().optional().or(z.literal("")),
    instagramUrl: z.string().url().optional().or(z.literal("")),
    tagIds: z.array(z.string()).optional(),
    featureIds: z.array(z.string()).optional(),
    scheduleDays: z.array(eventScheduleDaySchema).optional(),
  })
  .merge(organizerOnboardingFieldsSchema)
  .refine(
    (data) => {
      const hasVenue = !!data.venueId?.trim();
      const hasInline =
        !!data.venueName?.trim() &&
        !!data.venueAddress?.trim() &&
        !!data.venueCity?.trim() &&
        !!data.venueState?.trim() &&
        !!data.venueZip?.trim() &&
        data.venueZip.length >= 5;
      return hasVenue || hasInline;
    },
    { message: "Select a venue or enter an address", path: ["venueId"] }
  )
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
      return end.getTime() >= start.getTime();
    },
    { message: "End date must be on or after the start date", path: ["endDate"] }
  );
export type OrganizerEventInput = z.infer<typeof organizerEventSchema>;
