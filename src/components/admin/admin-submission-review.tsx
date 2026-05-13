"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { updateSubmissionDraft, updateSubmissionStatus } from "@/app/admin/actions";
import {
  formatSubmissionScheduleSummary,
  parseSubmissionScheduleRows,
} from "@/lib/submission-display";
import { getSubmissionCompletenessChecks } from "@/lib/submission-review-completeness";
import { trackEvent } from "@/lib/analytics";
import { formatDate, cn } from "@/lib/utils";
import type { ModerationStatus } from "@prisma/client";

export type AdminSubmissionReviewPayload = {
  id: string;
  eventTitle: string;
  eventDescription: string | null;
  submitterName: string;
  submitterEmail: string;
  scheduleDays: unknown;
  eventDate: string;
  eventTime: string;
  endDate: string | null;
  endTime: string | null;
  allDay: boolean;
  venueName: string;
  venueAddress: string;
  venueCity: string | null;
  venueState: string | null;
  venueZip: string | null;
  marketId: string | null;
  marketName: string | null;
  imageUrl: string | null;
  tagIds: string[];
  featureIds: string[];
  tagNames: string[];
  featureNames: string[];
  notes: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  status: ModerationStatus;
  createdAt: string;
  createdEventId: string | null;
  createdEventSlug: string | null;
  reviewNotes: string | null;
};

function statusBadgeVariant(status: ModerationStatus): "warning" | "success" | "destructive" | "secondary" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

export function AdminSubmissionReview({ submission }: { submission: AdminSubmissionReviewPayload }) {
  const router = useRouter();
  const pending = submission.status === "PENDING";
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, startRejectTransition] = useTransition();
  const [isApproving, startApproveTransition] = useTransition();
  const [isSavingEdits, startSaveEditsTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState({
    eventTitle: submission.eventTitle,
    eventDescription: submission.eventDescription ?? "",
    eventDate: submission.eventDate,
    eventTime: submission.eventTime,
    endDate: submission.endDate ?? "",
    endTime: submission.endTime ?? "",
    allDay: submission.allDay,
    venueName: submission.venueName,
    venueAddress: submission.venueAddress,
    venueCity: submission.venueCity ?? "",
    venueState: submission.venueState ?? "",
    venueZip: submission.venueZip ?? "",
    imageUrl: submission.imageUrl ?? "",
    facebookUrl: submission.facebookUrl ?? "",
    instagramUrl: submission.instagramUrl ?? "",
    websiteUrl: submission.websiteUrl ?? "",
    notes: submission.notes ?? "",
  });

  const scheduleSummary = formatSubmissionScheduleSummary(submission);
  const scheduleRows = parseSubmissionScheduleRows(submission);
  const showScheduleTable = scheduleRows.length > 1;

  const venueOneLiner = [submission.venueName, submission.venueCity].filter(Boolean).join(" · ");

  const completeness = getSubmissionCompletenessChecks({
    eventDescription: submission.eventDescription,
    imageUrl: submission.imageUrl,
    venueCity: submission.venueCity,
    venueState: submission.venueState,
    venueZip: submission.venueZip,
    marketId: submission.marketId,
    tagIds: submission.tagIds,
    facebookUrl: submission.facebookUrl,
    instagramUrl: submission.instagramUrl,
    websiteUrl: submission.websiteUrl,
  });

  const afterDecision = () => {
    setRejectMode(false);
    setRejectReason("");
    setActionError(null);
    router.replace("/admin/submissions?status=PENDING&page=1");
  };

  const handleConfirmReject = () => {
    const trimmed = rejectReason.trim();
    if (!trimmed) return;
    setActionError(null);
    startRejectTransition(async () => {
      try {
        const result = await updateSubmissionStatus(submission.id, "REJECTED", { reviewNotes: trimmed });
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        trackEvent("admin_submission_rejected", {
          submission_id: submission.id,
          surface: "submission_review",
        });
        afterDecision();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to reject submission.");
      }
    });
  };

  const handleApprove = () => {
    setActionError(null);
    startApproveTransition(async () => {
      try {
        const result = await updateSubmissionStatus(submission.id, "APPROVED");
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        trackEvent("admin_submission_approved", {
          submission_id: submission.id,
          surface: "submission_review",
        });
        afterDecision();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to approve submission.");
      }
    });
  };

  const handleSaveEdits = () => {
    setActionError(null);
    startSaveEditsTransition(async () => {
      const result = await updateSubmissionDraft(submission.id, {
        eventTitle: editDraft.eventTitle,
        eventDescription: editDraft.eventDescription,
        eventDate: editDraft.eventDate,
        eventTime: editDraft.eventTime,
        endDate: editDraft.endDate || null,
        endTime: editDraft.endTime || null,
        allDay: editDraft.allDay,
        venueName: editDraft.venueName,
        venueAddress: editDraft.venueAddress,
        venueCity: editDraft.venueCity || null,
        venueState: editDraft.venueState || null,
        venueZip: editDraft.venueZip || null,
        imageUrl: editDraft.imageUrl || null,
        facebookUrl: editDraft.facebookUrl || null,
        instagramUrl: editDraft.instagramUrl || null,
        websiteUrl: editDraft.websiteUrl || null,
        notes: editDraft.notes || null,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setEditMode(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "sticky top-0 z-20 border-b border-border bg-background/95 py-3 backdrop-blur",
          "supports-[backdrop-filter]:bg-background/80"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/submissions?status=PENDING">← Back</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/queues?type=submission">Queues</Link>
            </Button>
          </div>

          {pending && !rejectMode ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isApproving || isRejecting || isSavingEdits}
                onClick={() => setEditMode((current) => !current)}
              >
                {editMode ? "Close edits" : "Edit details"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isApproving || isRejecting}
                onClick={handleApprove}
              >
                {isApproving ? "Approving..." : "Approve"}
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => setRejectMode(true)}>
                Reject
              </Button>
            </div>
          ) : null}

          {pending && rejectMode ? (
            <div className="flex w-full min-w-[min(100%,20rem)] flex-col gap-2 sm:max-w-md sm:items-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setRejectMode(false)}>
                Cancel reject
              </Button>
            </div>
          ) : null}
        </div>

        {pending && rejectMode ? (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Label htmlFor="submission-reject-reason">Rejection reason (required)</Label>
            <textarea
              id="submission-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full max-w-2xl rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Briefly note why this submission cannot be published."
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isRejecting || !rejectReason.trim()}
              onClick={handleConfirmReject}
            >
              {isRejecting ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </div>
        ) : null}
        {pending && editMode ? (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="edit-title">Event title</Label>
              <input
                id="edit-title"
                value={editDraft.eventTitle}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, eventTitle: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-date">Event date</Label>
              <input
                id="edit-date"
                type="date"
                value={editDraft.eventDate}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, eventDate: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-start-time">Start time</Label>
              <input
                id="edit-start-time"
                type="time"
                value={editDraft.eventTime}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, eventTime: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-end-date">End date</Label>
              <input
                id="edit-end-date"
                type="date"
                value={editDraft.endDate}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-end-time">End time</Label>
              <input
                id="edit-end-time"
                type="time"
                value={editDraft.endTime}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, endTime: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 pt-7 text-sm">
              <input
                type="checkbox"
                checked={editDraft.allDay}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, allDay: e.target.checked }))}
              />
              All day
            </label>
            <div className="space-y-1">
              <Label htmlFor="edit-venue-name">Venue name</Label>
              <input
                id="edit-venue-name"
                value={editDraft.venueName}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, venueName: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-venue-address">Venue address</Label>
              <input
                id="edit-venue-address"
                value={editDraft.venueAddress}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, venueAddress: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-venue-city">City</Label>
              <input
                id="edit-venue-city"
                value={editDraft.venueCity}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, venueCity: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-venue-state">State</Label>
              <input
                id="edit-venue-state"
                value={editDraft.venueState}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, venueState: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-venue-zip">ZIP</Label>
              <input
                id="edit-venue-zip"
                value={editDraft.venueZip}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, venueZip: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-image-url">Image URL</Label>
              <input
                id="edit-image-url"
                value={editDraft.imageUrl}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, imageUrl: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-website-url">Website URL</Label>
              <input
                id="edit-website-url"
                value={editDraft.websiteUrl}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-facebook-url">Facebook URL</Label>
              <input
                id="edit-facebook-url"
                value={editDraft.facebookUrl}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, facebookUrl: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-instagram-url">Instagram URL</Label>
              <input
                id="edit-instagram-url"
                value={editDraft.instagramUrl}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit-description">Description</Label>
              <textarea
                id="edit-description"
                rows={4}
                value={editDraft.eventDescription}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, eventDescription: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit-notes">Submitter notes</Label>
              <textarea
                id="edit-notes"
                rows={3}
                value={editDraft.notes}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSavingEdits}
                onClick={handleSaveEdits}
              >
                {isSavingEdits ? "Saving..." : "Save edits"}
              </Button>
            </div>
          </div>
        ) : null}
        {actionError ? (
          <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </div>
        ) : null}
      </div>

      {!pending ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <p>
            Status:{" "}
            <Badge variant={statusBadgeVariant(submission.status)} className="align-middle">
              {submission.status}
            </Badge>
          </p>
          {submission.status === "APPROVED" && submission.createdEventId && submission.createdEventSlug ? (
            <p className="mt-2 flex flex-wrap gap-3 text-muted-foreground">
              <Link
                href={`/events/${submission.createdEventSlug}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                View public event
              </Link>
              <Link
                href={`/admin/events/${submission.createdEventId}/edit`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Edit in admin
              </Link>
            </p>
          ) : null}
          {submission.status === "REJECTED" && submission.reviewNotes ? (
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium text-foreground">Review notes: </span>
              <span className="whitespace-pre-wrap">{submission.reviewNotes}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-muted/30 p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submission review</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{submission.eventTitle}</h1>
          <Badge variant={statusBadgeVariant(submission.status)}>{submission.status}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Submitted {formatDate(new Date(submission.createdAt))} · {submission.submitterName} (
          <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${submission.submitterEmail}`}>
            {submission.submitterEmail}
          </a>
          )
        </p>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-1">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="shrink-0 font-medium text-foreground">When</dt>
            <dd className="text-muted-foreground">{scheduleSummary}</dd>
          </div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="shrink-0 font-medium text-foreground">Where</dt>
            <dd className="text-muted-foreground">{venueOneLiner || submission.venueAddress}</dd>
          </div>
        </dl>
      </div>

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Completeness</h2>
        <p className="mt-1 text-xs text-muted-foreground">Informational only — use your judgment for thin listings.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {completeness.map((item) => (
            <li
              key={item.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
                item.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                  : "border-muted-foreground/30 bg-muted/50 text-muted-foreground"
              )}
            >
              {item.ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <X className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6 lg:space-y-6">
          {submission.imageUrl ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Hero image</h2>
              <div className="relative mt-3 aspect-[2/1] w-full max-w-lg overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview; arbitrary URLs */}
                <img src={submission.imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
              <p className="mt-2">
                <a
                  href={submission.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Open full image
                </a>
              </p>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-sm font-semibold text-foreground">Schedule</h2>
            {showScheduleTable ? (
              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[16rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((row, i) => (
                      <tr key={`${row.date}-${i}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.date}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.timeLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{scheduleSummary}</p>
            )}
          </section>

          {(submission.facebookUrl || submission.instagramUrl || submission.websiteUrl) && (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Links</h2>
              <ul className="mt-2 list-inside list-disc text-sm text-primary">
                {submission.facebookUrl ? (
                  <li>
                    <a href={submission.facebookUrl} target="_blank" rel="noreferrer" className="hover:underline">
                      Facebook
                    </a>
                  </li>
                ) : null}
                {submission.instagramUrl ? (
                  <li>
                    <a href={submission.instagramUrl} target="_blank" rel="noreferrer" className="hover:underline">
                      Instagram
                    </a>
                  </li>
                ) : null}
                {submission.websiteUrl ? (
                  <li>
                    <a href={submission.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline">
                      Website
                    </a>
                  </li>
                ) : null}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {submission.eventDescription ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{submission.eventDescription}</p>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-background p-4">
            <h2 className="text-sm font-semibold text-foreground">Location</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{submission.venueName}</span>
              <br />
              {submission.venueAddress}
              <br />
              {[submission.venueCity, submission.venueState, submission.venueZip].filter(Boolean).join(", ")}
            </p>
          </section>

          {submission.marketName ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Market</h2>
              <p className="mt-2 text-sm text-muted-foreground">{submission.marketName}</p>
            </section>
          ) : null}

          {submission.tagNames.length > 0 ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Tags</h2>
              <p className="mt-2 text-sm text-muted-foreground">{submission.tagNames.join(", ")}</p>
            </section>
          ) : null}

          {submission.featureNames.length > 0 ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Features</h2>
              <p className="mt-2 text-sm text-muted-foreground">{submission.featureNames.join(", ")}</p>
            </section>
          ) : null}

          {submission.notes ? (
            <section className="rounded-lg border border-border bg-background p-4">
              <h2 className="text-sm font-semibold text-foreground">Submitter notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{submission.notes}</p>
            </section>
          ) : null}
        </div>
      </div>

    </div>
  );
}
