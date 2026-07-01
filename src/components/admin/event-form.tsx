"use client";

import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { eventSchema, type EventInput } from "@/lib/validations";
import { formatDateOnlyLocal, formatDateOnlyUTC, slugify, cn } from "@/lib/utils";
import {
  applyScheduleToEventPayload,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  isFullDayTimeRange,
  TIME_OPTIONS,
} from "@/lib/event-schedule-day";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Switch } from "@/components/ui/switch";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ScheduleRecurringGenerator } from "@/components/schedule-recurring-generator";
import { AddressAutofillFields } from "@/components/address-autocomplete";
import {
  EventSubmissionReviewPanel,
  type AdminEventReviewContext,
} from "@/components/admin/event-submission-review-panel";

const EVENT_STATUS_OPTIONS = [
  { value: "DRAFT" as const, label: "Draft" },
  { value: "PENDING" as const, label: "Pending Review" },
  { value: "PUBLISHED" as const, label: "Published" },
  { value: "REJECTED" as const, label: "Rejected" },
  { value: "CANCELLED" as const, label: "Cancelled" },
] as const;

type ScheduleDay = {
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
};

function toScheduleDay(start: Date, end: Date): ScheduleDay {
  const d = new Date(start);
  const date = formatDateOnlyUTC(d);
  const startMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  const endLate =
    (end.getHours() === 23 && end.getMinutes() === 59) ||
    (end.getHours() === 0 && end.getMinutes() === 0 && end > d);
  const spanFullDay = startMidnight && endLate;
  if (spanFullDay) {
    return { date, allDay: false, startTime: "00:00", endTime: "23:59" };
  }
  return {
    date,
    allDay: false,
    startTime: d.toTimeString().slice(0, 5),
    endTime: new Date(end).toTimeString().slice(0, 5),
  };
}

interface EventFormProps {
  venues: { id: string; name: string }[];
  markets: { id: string; name: string; venueId: string }[];
  tags: { id: string; name: string; slug: string }[];
  features: { id: string; name: string; slug: string }[];
  initialData?: EventInput & { id: string; scheduleDays?: ScheduleDay[] };
  /** Show JSON import panel on the right (new event only) */
  showJsonImport?: boolean;
  /** Server snapshot for the pending-submission review panel (edit page only). */
  reviewContext?: AdminEventReviewContext;
}

type JsonImportData = {
  title?: string;
  slug?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueState?: string;
  venueZip?: string;
  venueLat?: number;
  venueLng?: number;
  marketId?: string;
  imageUrl?: string;
  showImageInList?: boolean;
  imageFocalX?: number;
  imageFocalY?: number;
  status?: "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "CANCELLED";
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tagIds?: string[];
  tagSlugs?: string[];
  featureIds?: string[];
  featureSlugs?: string[];
  scheduleDays?: { date: string; allDay: boolean; startTime?: string; endTime?: string }[];
  participationMode?: string;
  vendorCapacity?: number | null;
  publicIntentListEnabled?: boolean | null;
  publicIntentNamesEnabled?: boolean | null;
  publicRosterEnabled?: boolean | null;
};

export function EventForm({
  venues,
  markets,
  tags,
  features,
  initialData,
  showJsonImport,
  reviewContext,
}: EventFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonImportText, setJsonImportText] = useState("");
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const today = formatDateOnlyLocal(new Date());
  const defaultSchedule =
    initialData?.scheduleDays?.length
      ? initialData.scheduleDays
      : initialData?.startDate && initialData?.endDate
        ? [toScheduleDay(new Date(initialData.startDate), new Date(initialData.endDate))]
        : [
            {
              date: today,
              allDay: false,
              startTime: DEFAULT_START_TIME,
              endTime: DEFAULT_END_TIME,
            },
          ];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    getValues,
    formState: { errors, isDirty },
  } = useForm<EventInput>({
    resolver: zodResolver(eventSchema) as Resolver<EventInput>,
    defaultValues: initialData
      ? {
          ...initialData,
          complianceNotes: initialData.complianceNotes ?? "",
          scheduleDays: defaultSchedule,
        }
      : {
          title: "",
          slug: "",
          description: "",
          startDate: `${today}T00:00:00`,
          endDate: `${today}T23:59:00`,
          timezone: "",
          venueId: "",
          venueName: "",
          venueAddress: "",
          venueCity: "Spokane",
          venueState: "WA",
          venueZip: "",
          venueLat: undefined,
          venueLng: undefined,
          marketId: "",
          imageUrl: "",
          showImageInList: true,
          imageFocalX: 50,
          imageFocalY: 50,
          status: "DRAFT",
          websiteUrl: "",
          facebookUrl: "",
          instagramUrl: "",
          tagIds: [],
          featureIds: [],
          complianceNotes: "",
          scheduleDays: defaultSchedule,
        },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "scheduleDays",
  });

  const watchTitle = watch("title");
  const watchMarketId = watch("marketId");
  const watchVenueId = watch("venueId");
  const useInlineAddress = !watchVenueId;
  const watchImageUrl = watch("imageUrl");
  const watchShowImageInList = watch("showImageInList") ?? true;
  const watchTagIds = watch("tagIds") ?? [];
  const watchFeatureIds = watch("featureIds") ?? [];
  const watchStatus = watch("status");

  useEffect(() => {
    if (watchMarketId && !watchVenueId) {
      const market = markets.find((m) => m.id === watchMarketId);
      if (market?.venueId) setValue("venueId", market.venueId);
    }
  }, [watchMarketId, watchVenueId, markets, setValue]);

  useEffect(() => {
    if (watchStatus !== "PENDING") setReviewOpen(false);
  }, [watchStatus]);

  const watchScheduleDays = watch("scheduleDays");
  useEffect(() => {
    const days = watchScheduleDays ?? [];
    if (days.length) {
      const first = days[0];
      const last = days[days.length - 1];
      if (!first?.date || !last?.date) return;
      // Explicit times are required; only sync legacy datetime fields when schedule is complete.
      if (!first.startTime || !last.endTime) return;
      const firstStart = isFullDayTimeRange(first.startTime, first.endTime)
        ? "00:00"
        : first.startTime;
      const lastEnd = isFullDayTimeRange(last.startTime, last.endTime)
        ? "23:59"
        : last.endTime;
      const nextStartDate = `${first.date}T${firstStart}:00`;
      const nextEndDate = `${last.date}T${lastEnd}:00`;
      if (getValues("startDate") !== nextStartDate) {
        setValue("startDate", nextStartDate, { shouldDirty: false, shouldValidate: false });
      }
      if (getValues("endDate") !== nextEndDate) {
        setValue("endDate", nextEndDate, { shouldDirty: false, shouldValidate: false });
      }
    }
  }, [watchScheduleDays, setValue, getValues]);

  const autoSlug = () => {
    setValue("slug", slugify(watchTitle));
  };

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

  const handleJsonImport = () => {
    setJsonImportError(null);
    try {
      const data = JSON.parse(jsonImportText) as JsonImportData;
      if (typeof data !== "object" || data === null) {
        throw new Error("Invalid JSON: expected an object");
      }
      if (data.title != null) setValue("title", String(data.title));
      if (data.slug != null) setValue("slug", String(data.slug));
      if (data.description != null) setValue("description", String(data.description));
      if (data.startDate != null) setValue("startDate", String(data.startDate));
      if (data.endDate != null) setValue("endDate", String(data.endDate));
      if (data.timezone != null) setValue("timezone", String(data.timezone));
      if (data.venueId != null) setValue("venueId", String(data.venueId));
      if (data.venueName != null) setValue("venueName", String(data.venueName));
      if (data.venueAddress != null) setValue("venueAddress", String(data.venueAddress));
      if (data.venueCity != null) setValue("venueCity", String(data.venueCity));
      if (data.venueState != null) setValue("venueState", String(data.venueState));
      if (data.venueZip != null) setValue("venueZip", String(data.venueZip));
      if (data.venueLat != null) setValue("venueLat", data.venueLat);
      if (data.venueLng != null) setValue("venueLng", data.venueLng);
      if (data.marketId != null) setValue("marketId", String(data.marketId));
      if (data.imageUrl != null) setValue("imageUrl", String(data.imageUrl));
      if (data.showImageInList != null) setValue("showImageInList", !!data.showImageInList);
      if (data.imageFocalX != null) setValue("imageFocalX", Number(data.imageFocalX));
      if (data.imageFocalY != null) setValue("imageFocalY", Number(data.imageFocalY));
      if (data.status != null) setValue("status", data.status);
      if (data.websiteUrl != null) setValue("websiteUrl", String(data.websiteUrl));
      if (data.facebookUrl != null) setValue("facebookUrl", String(data.facebookUrl));
      if (data.instagramUrl != null) setValue("instagramUrl", String(data.instagramUrl));
      if (data.tagIds != null && Array.isArray(data.tagIds)) {
        setValue("tagIds", data.tagIds.map(String));
      } else if (data.tagSlugs != null && Array.isArray(data.tagSlugs)) {
        const ids = data.tagSlugs
          .map((s) => tags.find((t) => t.slug === s)?.id)
          .filter((id): id is string => !!id);
        setValue("tagIds", ids);
      }
      if (data.featureIds != null && Array.isArray(data.featureIds)) {
        setValue("featureIds", data.featureIds.map(String));
      } else if (data.featureSlugs != null && Array.isArray(data.featureSlugs)) {
        const ids = data.featureSlugs
          .map((s) => features.find((f) => f.slug === s)?.id)
          .filter((id): id is string => !!id);
        setValue("featureIds", ids);
      }
      if (data.scheduleDays != null && Array.isArray(data.scheduleDays) && data.scheduleDays.length > 0) {
        replace(
          data.scheduleDays.map((d) => ({
            date: d.date,
            allDay: false,
            startTime: d.allDay ? "00:00" : d.startTime,
            endTime: d.allDay ? "23:59" : d.endTime,
          }))
        );
      }
      if (data.participationMode != null && data.participationMode !== "") {
        setValue(
          "participationMode",
          data.participationMode as "OPEN" | "REQUEST_TO_JOIN" | "INVITE_ONLY" | "CAPACITY_LIMITED"
        );
      } else if (data.participationMode === "") {
        setValue("participationMode", undefined);
      }
      if (data.vendorCapacity != null) setValue("vendorCapacity", data.vendorCapacity);
      if (data.publicIntentListEnabled != null) setValue("publicIntentListEnabled", data.publicIntentListEnabled);
      if (data.publicIntentNamesEnabled != null) setValue("publicIntentNamesEnabled", data.publicIntentNamesEnabled);
      if (data.publicRosterEnabled != null) setValue("publicRosterEnabled", data.publicRosterEnabled);
    } catch (e) {
      setJsonImportError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const persistEvent = async (data: EventInput, redirect: boolean) => {
    const prepared = applyScheduleToEventPayload(data);
    const url = initialData ? `/api/admin/events/${initialData.id}` : "/api/admin/events";
    const method = initialData ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prepared),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error?.message || "Failed to save event");
    }

    toast.success(initialData ? "Event updated." : "Event created.");
    if (redirect) {
      router.push("/admin/events");
    }
    router.refresh();
  };

  const onSubmit = async (data: EventInput) => {
    setSubmitting(true);
    setError(null);
    setReviewSuccess(null);
    try {
      await persistEvent(data, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const saveFromReview = async (data: EventInput, redirect: boolean, successMessage?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await persistEvent(data, redirect);
      if (!redirect) {
        setReviewSuccess(successMessage ?? "Saved.");
        setReviewOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const appendRejectionNote = async (reason: string) => {
    if (!reviewContext || !initialData) return;
    if (reviewContext.moderationNotesApiEnabled) {
      const res = await fetch("/api/admin/listings/moderation-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: reviewContext.eventId,
          note: `Rejection reason: ${reason}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? "Failed to record rejection note");
      }
    } else {
      const prev = getValues("complianceNotes")?.trim() ?? "";
      setValue(
        "complianceNotes",
        prev ? `${prev}\n\nRejection reason: ${reason}` : `Rejection reason: ${reason}`,
        { shouldDirty: true }
      );
    }
  };

  const isPending = watchStatus === "PENDING";
  const hideMainTitleDescSchedule = reviewOpen && isPending;

  const scheduleSection = (
    <>
      <div className="space-y-4">
        <Label>Schedule</Label>
        <p className="text-xs text-muted-foreground">
          Add one or more days. Start and end times are required for each day (use 12:00 AM-11:59 PM for a full-day span).
        </p>
        <ScheduleRecurringGenerator onGenerate={(days) => replace(days)} />
        {errors.scheduleDays?.message && (
          <p className="text-sm text-destructive">{String(errors.scheduleDays.message)}</p>
        )}
        {fields.map((field, i) => {
          const regStart = register(`scheduleDays.${i}.startTime`);
          const regEnd = register(`scheduleDays.${i}.endTime`);
          const dayError = errors.scheduleDays?.[i];
          const dateError = dayError?.date?.message;
          const startError = dayError?.startTime?.message;
          const endError = dayError?.endTime?.message;
          return (
            <div
              key={field.id}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-end gap-3">
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
                </div>
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Select
                    {...regStart}
                    onChange={(e) => {
                      regStart.onChange(e);
                    }}
                  >
                    <option value="">Select start time</option>
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  <Select
                    {...regEnd}
                    onChange={(e) => {
                      regEnd.onChange(e);
                    }}
                  >
                    <option value="">Select end time</option>
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
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
              {(dateError || startError || endError) && (
                <div className="mt-3 space-y-1">
                  {dateError && <p className="text-sm text-destructive">{String(dateError)}</p>}
                  {startError && <p className="text-sm text-destructive">{String(startError)}</p>}
                  {endError && <p className="text-sm text-destructive">{String(endError)}</p>}
                </div>
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
      </div>
    </>
  );

  const titleDescBlock = (
    <>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...register("title")} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={4} {...register("description")} />
      </div>
    </>
  );

  const actionButtons = (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : initialData ? "Update Event" : "Create Event"}
      </Button>
      <Button type="button" variant="outline" onClick={() => router.back()}>
        Cancel
      </Button>
    </div>
  );

  const leftColumnSections = (
    <>
      {!hideMainTitleDescSchedule && titleDescBlock}

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <div className="flex gap-2">
          <Input id="slug" {...register("slug")} className="flex-1" />
          <Button type="button" variant="outline" onClick={autoSlug}>
            Auto
          </Button>
        </div>
        {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
      </div>

      {!hideMainTitleDescSchedule && scheduleSection}

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
        <p className="text-xs text-muted-foreground">Selecting a market will default the venue below.</p>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <Label>Location</Label>
        <p className="text-xs text-muted-foreground">Select a venue or enter an address. Either is required.</p>
        <div className="space-y-2">
          <Label htmlFor="venueId" className="text-sm font-normal">
            Venue (optional)
          </Label>
          <Select
            id="venueId"
            {...register("venueId", {
              onChange: (e) => {
                if (e.target.value) {
                  setValue("venueName", "");
                  setValue("venueAddress", "");
                  setValue("venueCity", "Spokane");
                  setValue("venueState", "WA");
                  setValue("venueZip", "");
                  setValue("venueLat", undefined);
                  setValue("venueLng", undefined);
                }
              },
            })}
          >
            <option value="">Or enter address below...</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </div>
        {useInlineAddress && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <p className="text-sm font-medium text-muted-foreground">Enter address</p>
            <div className="space-y-2">
              <Label htmlFor="venueName">Location name</Label>
              <Input
                id="venueName"
                placeholder="e.g. Riverside Park Pavilion"
                {...register("venueName", {
                  onChange: () => setValue("venueId", ""),
                })}
              />
              {errors.venueName && <p className="text-sm text-destructive">{errors.venueName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Address details (editable)</Label>
              <p className="text-xs text-muted-foreground">Start typing in the street address field for suggestions.</p>
              <AddressAutofillFields
                onRetrieve={(addr) => {
                  setValue("venueId", "");
                  setValue("venueLat", addr.lat);
                  setValue("venueLng", addr.lng);
                }}
                streetProps={{
                  id: "venueAddress",
                  ...register("venueAddress", { onChange: () => setValue("venueId", "") }),
                }}
                cityProps={register("venueCity")}
                stateProps={register("venueState")}
                zipProps={register("venueZip")}
              />
              {errors.venueAddress && (
                <p className="text-sm text-destructive">{errors.venueAddress.message}</p>
              )}
              {(errors.venueCity || errors.venueState || errors.venueZip) && (
                <p className="text-sm text-destructive">
                  {errors.venueCity?.message || errors.venueState?.message || errors.venueZip?.message}
                </p>
              )}
            </div>
          </div>
        )}
        {errors.venueId && <p className="text-sm text-destructive">{errors.venueId.message}</p>}
      </div>
    </>
  );

  const rightColumnSections = (
    <>
      {!showJsonImport && <div className="hidden lg:block">{actionButtons}</div>}

      <ImageUploadWithUrl
        value={watchImageUrl ?? ""}
        onChange={(url) => setValue("imageUrl", url)}
        uploadType="event"
        label="Event image"
        aspectRatio="banner"
      />
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="showImageInList">Display Event Banner</Label>
            <p className="text-xs text-muted-foreground">When on, the event image appears on event listing cards.</p>
          </div>
          <Switch
            id="showImageInList"
            checked={watchShowImageInList}
            onCheckedChange={(checked) => setValue("showImageInList", checked, { shouldDirty: true })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Event status">
          {EVENT_STATUS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm",
                "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
              )}
            >
              <input type="radio" className="sr-only" value={opt.value} {...register("status")} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {initialData && watchStatus !== "PENDING" && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer p-4 font-medium">Internal notes (admin)</summary>
          <div className="space-y-2 border-t border-border p-4">
            <Label htmlFor="complianceNotes-main">Compliance / internal notes</Label>
            <Textarea
              id="complianceNotes-main"
              rows={3}
              {...register("complianceNotes")}
              placeholder="Not shown on the public site."
            />
          </div>
        </details>
      )}

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer p-4 font-medium">Vendor participation (override market)</summary>
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            Override the market&apos;s vendor participation settings for this event. Leave as default to use market
            settings.
          </p>
          <div className="space-y-2">
            <Label htmlFor="participationMode">Participation mode</Label>
            <Select id="participationMode" {...register("participationMode")}>
              <option value="">Use market default</option>
              <option value="OPEN">Mark as attending</option>
              <option value="REQUEST_TO_JOIN">Request to join</option>
              <option value="INVITE_ONLY">Invite only / Juried</option>
              <option value="CAPACITY_LIMITED">Request to join (capacity limited)</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eventVendorCapacity">Vendor capacity</Label>
            <Input
              id="eventVendorCapacity"
              type="number"
              min={0}
              placeholder="Use market default"
              {...register("vendorCapacity", {
                setValueAs: (v) =>
                  v === "" || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v),
              })}
            />
          </div>
          <div className="space-y-2">
            <Label>Display options</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("publicIntentListEnabled")} />
                <span className="text-sm">Show self-reported list</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("publicIntentNamesEnabled")} />
                <span className="text-sm">Show names</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register("publicRosterEnabled")} />
                <span className="text-sm">Show official roster</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Uncheck to use market default. Leave checked to override.</p>
          </div>
        </div>
      </details>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="websiteUrl">Website URL</Label>
          <Input id="websiteUrl" type="url" {...register("websiteUrl")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="facebookUrl">Facebook URL</Label>
          <Input id="facebookUrl" type="url" {...register("facebookUrl")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instagramUrl">Instagram URL</Label>
          <Input id="instagramUrl" type="url" {...register("instagramUrl")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
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
                onChange={() => toggleArrayItem("tagIds", watchTagIds, tag.id)}
              />
              {tag.name}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Features</Label>
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
                onChange={() => toggleArrayItem("featureIds", watchFeatureIds, feature.id)}
              />
              {feature.name}
            </label>
          ))}
        </div>
      </div>

      <div className="lg:hidden">{actionButtons}</div>
      <div className="hidden lg:block">{actionButtons}</div>
    </>
  );

  const formContent = (
    <form
      onSubmit={handleSubmit(onSubmit, (formErrors) => {
        if (formErrors.scheduleDays) {
          setError("Please fix schedule row errors, then submit again.");
          return;
        }
        setError("Please fix the errors below.");
      })}
      className="space-y-6"
    >
      {reviewSuccess && (
        <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {reviewSuccess}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {initialData && reviewContext && isPending && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => setReviewOpen(true)}>
            Review submission
          </Button>
        </div>
      )}

      {showJsonImport ? (
        <div className="space-y-6">
          {leftColumnSections}
          {rightColumnSections}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
          <div className="min-w-0 space-y-6">{leftColumnSections}</div>
          <div className="min-w-0 space-y-6 lg:sticky lg:top-6">{rightColumnSections}</div>
        </div>
      )}
    </form>
  );

  const reviewPanel =
    initialData && reviewContext && isPending ? (
      <EventSubmissionReviewPanel
        open={reviewOpen}
        onOpenChange={(o) => {
          if (!o && isDirty) {
            const ok = window.confirm("Discard unsaved changes in the review panel?");
            if (!ok) return;
          }
          setReviewOpen(o);
          if (!o) setReviewSuccess(null);
        }}
        reviewContext={reviewContext}
        tags={tags}
        features={features}
        watch={watch}
        submitting={submitting}
        editableFields={
          <>
            {titleDescBlock}
            {scheduleSection}
            <div className="space-y-2">
              <Label htmlFor="complianceNotes-review">Internal reviewer notes</Label>
              <p className="text-xs text-muted-foreground">
                Not public-facing.{" "}
                {reviewContext.moderationNotesApiEnabled
                  ? "Listing moderation notes API is enabled; rejection reasons are also logged as moderation notes."
                  : "Stored on the event as compliance notes until moderation notes are enabled."}
              </p>
              <Textarea
                id="complianceNotes-review"
                rows={4}
                {...register("complianceNotes")}
                placeholder="Notes for admins only."
              />
            </div>
          </>
        }
        onCancel={() => {
          if (isDirty) {
            const ok = window.confirm("Discard unsaved changes in the review panel?");
            if (!ok) return;
          }
          setReviewOpen(false);
          setReviewSuccess(null);
        }}
        onSaveEditsOnly={() =>
          void handleSubmit(async (data) => {
            await saveFromReview(data, false);
          })()
        }
        onApprove={() =>
          void handleSubmit(async (data) => {
            await saveFromReview({ ...data, status: "PUBLISHED" }, false, "Event published.");
          })()
        }
        onReject={async (reason) => {
          setSubmitting(true);
          setError(null);
          try {
            await appendRejectionNote(reason);
            const parsed = eventSchema.safeParse({ ...getValues(), status: "REJECTED" as const });
            if (!parsed.success) {
              setError("Please fix the errors below before rejecting.");
              return;
            }
            await persistEvent(parsed.data, false);
            setReviewSuccess("Event rejected.");
            setReviewOpen(false);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to reject event");
          } finally {
            setSubmitting(false);
          }
        }}
      />
    ) : null;

  if (showJsonImport) {
    return (
      <>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">{formContent}</div>
          <div className="lg:sticky lg:top-6">
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <Label className="text-base font-medium">Import from JSON</Label>
              <p className="text-xs text-muted-foreground">
                Paste JSON below to populate all form fields. Use tagSlugs and featureSlugs (or tagIds/featureIds).
              </p>
              <Textarea
                value={jsonImportText}
                onChange={(e) => {
                  setJsonImportText(e.target.value);
                  setJsonImportError(null);
                }}
                placeholder='{"title": "My Event", ...}'
                rows={16}
                className="font-mono text-xs"
              />
              {jsonImportError && <p className="text-sm text-destructive">{jsonImportError}</p>}
              <Button type="button" variant="secondary" onClick={handleJsonImport}>
                Import
              </Button>
            </div>
          </div>
        </div>
        {reviewPanel}
      </>
    );
  }

  return (
    <>
      {formContent}
      {reviewPanel}
    </>
  );
}
