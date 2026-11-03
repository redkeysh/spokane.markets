"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import {
  trackApiError,
  trackEvent,
  trackFormError,
  trackMilestoneEvent,
} from "@/lib/analytics";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Session } from "@/lib/auth";
import {
  submissionSchema,
  submissionSchemaAuthed,
  type SubmissionInput,
  type SubmissionInputAuthed,
} from "@/lib/validations";
import type { Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { AddressAutofillFields } from "@/components/address-autocomplete";
import { VenueTypeahead } from "@/components/forms/venue-typeahead";
import { useAbandonTracking } from "@/hooks/use-abandon-tracking";
import { formatDateOnlyLocal } from "@/lib/utils";
import type { PublicVenue } from "@/lib/venues/suggest";
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  mapScheduleDaysForSubmit,
  TIME_OPTIONS,
} from "@/lib/event-schedule-day";
import { Plus, Trash2 } from "lucide-react";
import { ScheduleRecurringGenerator } from "@/components/schedule-recurring-generator";

interface SubmissionFormProps {
  session: Session | null;
  markets?: { id: string; name: string }[];
  tags?: { id: string; name: string; slug: string }[];
  features?: { id: string; name: string; slug: string }[];
}

export function SubmissionForm({
  session,
  markets = [],
  tags = [],
  features = [],
}: SubmissionFormProps) {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Required field label suffix */
  const req = (label: string) => `${label} *`;

  const isAuthed = !!session?.user;

  const today = formatDateOnlyLocal(new Date());
  const defaultSchedule = [
    {
      date: today,
      allDay: false as const,
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    },
  ];

  const startTimeRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const endTimeRefs = useRef<(HTMLSelectElement | null)[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SubmissionInput | SubmissionInputAuthed>({
    resolver: zodResolver(
      isAuthed ? submissionSchemaAuthed : submissionSchema
    ) as Resolver<SubmissionInput | SubmissionInputAuthed>,
    defaultValues: {
      ...(isAuthed ? {} : { submitterName: "", submitterEmail: "" }),
      eventTitle: "",
      eventDescription: "",
      scheduleDays: defaultSchedule,
      timezone: "",
      imageUrl: "",
      venueName: "",
      venueAddress: "",
      venueCity: "",
      venueState: "",
      venueZip: "",
      marketId: "",
      tagIds: [],
      featureIds: [],
      facebookUrl: "",
      instagramUrl: "",
      websiteUrl: "",
      notes: "",
      company: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "scheduleDays",
  });

  useEffect(() => {
    startTimeRefs.current = startTimeRefs.current.slice(0, fields.length);
    endTimeRefs.current = endTimeRefs.current.slice(0, fields.length);
  }, [fields.length]);

  const watchTagIds = (useWatch({ control, name: "tagIds" }) ?? []) as string[];
  const watchFeatureIds = (useWatch({ control, name: "featureIds" }) ?? []) as string[];

  useAbandonTracking({
    eventName: "submit_event_abandon",
    isDirty,
    isComplete: success,
    params: { form_id: "submission", surface: "submit_page" },
  });

  const toggleArrayItem = (
    field: "tagIds" | "featureIds",
    current: string[],
    id: string
  ) => {
    setValue(
      field,
      current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id]
    );
  };

  /** Fills the venue fields with an existing venue's exact values, so approval matches it instead of creating a copy. */
  const pickVenue = (venue: PublicVenue) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue("venueName", venue.name, opts);
    setValue("venueAddress", venue.address, opts);
    setValue("venueCity", venue.city, opts);
    setValue("venueState", venue.state, opts);
    setValue("venueZip", venue.zip, opts);
    trackEvent("submit_event_venue_pick", { form_id: "submission" });
  };

  async function onSubmit(data: SubmissionInput | SubmissionInputAuthed) {
    setSuccess(false);
    setError(null);
    trackEvent("submit_event_start");
    const payload = isAuthed ? data : (data as SubmissionInput);
    const scheduleDays = mapScheduleDaysForSubmit(payload.scheduleDays);
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, scheduleDays }),
    });

    const json = await res.json();

    if (!res.ok) {
      trackApiError("submissions", res.status, { reason: "server" });
      const msg =
        typeof json.error === "string"
          ? json.error
          : "Submission failed. Please try again.";
      setError(msg);
      return;
    }

    trackMilestoneEvent("submit_event_success");
    setSuccess(true);
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thank you!</CardTitle>
          <CardDescription>
            Your event submission has been received. We&apos;ll review it and add
            it to the calendar if it fits our criteria. You&apos;ll hear back
            within a few business days.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event details</CardTitle>
        <CardDescription>
          Fill in the information about the event you&apos;d like to submit.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={handleSubmit(onSubmit, () => {
          trackFormError("submission", "validation");
          trackEvent("submit_event_validation_error", { form_id: "submission" });
        })}
      >
        <CardContent className="space-y-4">
          {/* Honeypot */}
          <div className="absolute -left-[9999px] opacity-0" aria-hidden>
            <Label htmlFor="company">Company</Label>
            <input id="company" type="text" tabIndex={-1} autoComplete="off" {...register("company")} />
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          {!isAuthed && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="submitterName">{req("Your name")}</Label>
                <Input
                  id="submitterName"
                  type="text"
                  placeholder="Jane Doe"
                  autoComplete="name"
                  {...register("submitterName" as keyof SubmissionInput)}
                />
                {"submitterName" in errors && errors.submitterName && (
                  <p className="text-sm text-destructive">
                    {errors.submitterName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="submitterEmail">{req("Your email")}</Label>
                <Input
                  id="submitterEmail"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...register("submitterEmail" as keyof SubmissionInput)}
                />
                {"submitterEmail" in errors && errors.submitterEmail && (
                  <p className="text-sm text-destructive">
                    {errors.submitterEmail.message}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="eventTitle">{req("Event title")}</Label>
            <Input
              id="eventTitle"
              type="text"
              placeholder="South Hill Farmers Market"
              {...register("eventTitle")}
            />
            {errors.eventTitle && (
              <p className="text-sm text-destructive">
                {errors.eventTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventDescription">Event description</Label>
            <Textarea
              id="eventDescription"
              placeholder="Brief description of the event..."
              rows={3}
              {...register("eventDescription")}
            />
            {errors.eventDescription && (
              <p className="text-sm text-destructive">
                {errors.eventDescription.message}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Label>Schedule</Label>
            <p className="text-xs text-muted-foreground">
              Add one or more days. Use 12:00 AM–11:59 PM for a full-day span on a given day. Same layout as our admin
              event form.
            </p>
            <ScheduleRecurringGenerator onGenerate={(days) => replace(days)} />
            {fields.map((field, i) => {
              const regStart = register(`scheduleDays.${i}.startTime`);
              const regEnd = register(`scheduleDays.${i}.endTime`);
              return (
                <div
                  key={field.id}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
                >
                  <input type="checkbox" className="sr-only" aria-hidden tabIndex={-1} {...register(`scheduleDays.${i}.allDay`)} />
                  <div className="min-w-[140px] space-y-2">
                    <Label>Date</Label>
                    <DatePickerInput
                      value={watch(`scheduleDays.${i}.date`) || ""}
                      onChange={(value) =>
                        setValue(`scheduleDays.${i}.date`, value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                    {errors.scheduleDays?.[i]?.date && (
                      <p className="text-sm text-destructive">{errors.scheduleDays[i]?.date?.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Select
                      {...regStart}
                      ref={(el) => {
                        regStart.ref(el);
                        startTimeRefs.current[i] = el;
                      }}
                      onChange={(e) => {
                        regStart.onChange(e);
                        queueMicrotask(() => endTimeRefs.current[i]?.focus());
                      }}
                    >
                      <option value="">Select start time</option>
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                    {errors.scheduleDays?.[i]?.startTime && (
                      <p className="text-sm text-destructive">{errors.scheduleDays[i]?.startTime?.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Select
                      {...regEnd}
                      ref={(el) => {
                        regEnd.ref(el);
                        endTimeRefs.current[i] = el;
                      }}
                      onChange={(e) => {
                        regEnd.onChange(e);
                        if (i < fields.length - 1) {
                          queueMicrotask(() => startTimeRefs.current[i + 1]?.focus());
                        }
                      }}
                    >
                      <option value="">Select end time</option>
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                    {errors.scheduleDays?.[i]?.endTime && (
                      <p className="text-sm text-destructive">{errors.scheduleDays[i]?.endTime?.message}</p>
                    )}
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(i)}
                      aria-label="Remove day"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append({
                  date: formatDateOnlyLocal(new Date()),
                  allDay: false,
                  startTime: DEFAULT_START_TIME,
                  endTime: DEFAULT_END_TIME,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another day
            </Button>
            {(errors.scheduleDays?.root?.message ?? errors.scheduleDays?.message) && (
              <p className="text-sm text-destructive">
                {errors.scheduleDays?.root?.message ?? errors.scheduleDays?.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image Link</Label>
            <Input
              id="imageUrl"
              type="url"
              placeholder="https://..."
              {...register("imageUrl")}
            />
            {errors.imageUrl && (
              <p className="text-sm text-destructive">
                {errors.imageUrl.message}
              </p>
            )}
          </div>

          {markets.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="marketId">Market (optional)</Label>
              <Select id="marketId" {...register("marketId")}>
                <option value="">None</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="venueName">{req("Venue name")}</Label>
            <p className="text-xs text-muted-foreground">
              Start typing to pick a venue we already list, which fills in its address. New venues can be typed in full.
            </p>
            <VenueTypeahead
              id="venueName"
              placeholder="e.g., Riverside Park Pavilion, Spokane County Fair & Expo Center"
              registration={register("venueName")}
              onPick={pickVenue}
            />
            {errors.venueName && (
              <p className="text-sm text-destructive">
                {errors.venueName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">{req("Venue address")}</Label>
            <p className="text-xs text-muted-foreground">
              Start typing in the street address field for suggestions. City, state, and ZIP are required.
            </p>
            <AddressAutofillFields
              streetProps={{
                id: "venueAddress",
                type: "text",
                placeholder: "Street address",
                ...register("venueAddress"),
              }}
              cityProps={{ type: "text", placeholder: "City", ...register("venueCity") }}
              stateProps={{ type: "text", placeholder: "State", ...register("venueState") }}
              zipProps={{ type: "text", placeholder: "ZIP", ...register("venueZip") }}
            />
            {errors.venueAddress && (
              <p className="text-sm text-destructive">
                {errors.venueAddress.message}
              </p>
            )}
            {errors.venueCity && (
              <p className="text-sm text-destructive">{errors.venueCity.message}</p>
            )}
            {errors.venueState && (
              <p className="text-sm text-destructive">{errors.venueState.message}</p>
            )}
            {errors.venueZip && (
              <p className="text-sm text-destructive">{errors.venueZip.message}</p>
            )}
          </div>

          {tags.length > 0 && (
            <div className="space-y-2">
              <Label>Event type (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={watchTagIds.includes(tag.id)}
                      onChange={() =>
                        toggleArrayItem("tagIds", watchTagIds, tag.id)
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {features.length > 0 && (
            <div className="space-y-2">
              <Label>Features / amenities (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {features.map((feature) => (
                  <label
                    key={feature.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={watchFeatureIds.includes(feature.id)}
                      onChange={() =>
                        toggleArrayItem("featureIds", watchFeatureIds, feature.id)
                      }
                    />
                    {feature.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="facebookUrl">Facebook Link</Label>
              <Input
                id="facebookUrl"
                type="url"
                placeholder="https://facebook.com/..."
                {...register("facebookUrl")}
              />
              {errors.facebookUrl && (
                <p className="text-sm text-destructive">
                  {errors.facebookUrl.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagramUrl">Instagram Link</Label>
              <Input
                id="instagramUrl"
                type="url"
                placeholder="https://instagram.com/..."
                {...register("instagramUrl")}
              />
              {errors.instagramUrl && (
                <p className="text-sm text-destructive">
                  {errors.instagramUrl.message}
                </p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="websiteUrl">Website Link</Label>
              <Input
                id="websiteUrl"
                type="url"
                placeholder="https://..."
                {...register("websiteUrl")}
              />
              {errors.websiteUrl && (
                <p className="text-sm text-destructive">
                  {errors.websiteUrl.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any other details we should know..."
              rows={2}
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <Button type="submit" variant="accent" className="w-full font-semibold" disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Submit event"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
