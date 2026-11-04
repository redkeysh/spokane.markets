"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MenuItem } from "@/components/admin/kit/menu";
import { EVENT_STATUS_OPTIONS, StatusMenu } from "@/components/admin/kit/status-menu";
import type { MarkStatus } from "@/components/admin/kit/status-mark";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useMounted } from "@/components/admin/kit/layer";
import { Screen } from "@/components/admin/kit/pane";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useLeaveGuard } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useRail, useRailSelection } from "@/components/admin/shell/rail-context";
import { useShell, type LeaveTarget } from "@/components/admin/shell/shell-context";
import { useMediaQuery } from "@/components/admin/shell/use-media";
import { formatTimestamp } from "@/lib/admin/format";
import {
  archiveEventAction,
  createEventAction,
  publishSubmissionAction,
  rejectEventAction,
  rejectSubmissionAction,
  restoreEventAction,
  saveEventAction,
  saveSubmissionAction,
  undoEditorDecisionAction,
  type EditorActionResult,
} from "@/app/admin/_actions/editor";
import type { EditorPayload } from "./payload";
import { ActionBar, type BarButton } from "./action-bar";
import { keepPickerKeys } from "./controls";
import { EditorShell } from "./editor-shell";
import { EditorFormProvider, type EditorForm } from "./form-context";
import { JsonPasteDialog } from "./json-paste-dialog";
import {
  DETAIL_KEYS,
  MODE_FIELDS,
  blockingProblem,
  changedFields,
  clearErrors,
  pickChanges,
  railWeekKey,
  savedAgo,
  sectionOf,
  statusSentence as heldStatusSentence,
  unsavedLabel,
  weekendOf,
  type EditorErrorField,
  type EditorErrors,
  type EditorField,
  type EditorValues,
  type EventStatusValue,
} from "./model";
import { RecordHeader } from "./record-header";
import { RejectDialog } from "./reject-dialog";
import { SectionLinks, goToSection, type SectionLink } from "./section-links";
import { SeriesBanner } from "./series-banner";
import { ListingSection } from "./sections/listing";
import { LinksSection } from "./sections/links";
import { MoreDetailsSection } from "./sections/more-details";
import { PictureSection } from "./sections/picture";
import { TagsFeaturesSection } from "./sections/tags-features";
import { VendorsSection } from "./sections/vendors";
import { WhenSection } from "./sections/when";
import { WhereSection } from "./sections/where";
import { Also } from "./side/also";
import { CameFrom } from "./side/came-from";
import { HistoryMini } from "./side/history-mini";
import { Notes } from "./side/notes";
import { ReadinessPanel } from "./side/readiness";
import { Twins } from "./side/twins";
import { WhatTheySent } from "./side/what-they-sent";
import type { EditorProps, TagOption } from "./types";

type Busy = null | "save" | "publish" | "reject" | "archive" | "restore";

/**
 * Opens a section (collapsed ones too) and puts focus on its first invalid control, or on its
 * heading when it has none.
 */
function showProblem(section: string) {
  goToSection(section);
  window.requestAnimationFrame(() => {
    const control = document.getElementById(section)?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!control) return;
    control.scrollIntoView({ block: "center" });
    control.focus({ preventScroll: true });
  });
}

const EVENT_SECTIONS: SectionLink[] = [
  { id: "listing", label: "Listing" },
  { id: "when", label: "When" },
  { id: "where", label: "Where" },
  { id: "picture", label: "Picture" },
  { id: "tags-and-features", label: "Tags and features" },
  { id: "links", label: "Links" },
  { id: "vendors", label: "Vendors" },
  { id: "more-details", label: "More details" },
];

const SUBMISSION_SECTIONS = EVENT_SECTIONS.slice(0, 6);

/** Every field of a mode, for creating a record from scratch. */
function allFields(mode: "new"): EditorField[] {
  return MODE_FIELDS[mode].flatMap((key): EditorField[] => (key === "details" ? DETAIL_KEYS.map((d) => `details.${d}` as const) : [key]));
}

export function EventEditor({ record, initial, options: serverOptions, context }: EditorProps) {
  const mode = record.mode;
  const router = useRouter();
  const announce = useAnnounce();
  const shell = useShell();
  const { rail, markLive } = useRail();
  const mounted = useMounted();
  const phone = useMediaQuery("(max-width: 767px)", false);

  const [saved, setSaved] = React.useState(initial);
  const [values, setValues] = React.useState(initial);
  const [seenVersion, setSeenVersion] = React.useState(record.updatedAt);
  if (record.updatedAt !== seenVersion) {
    setSeenVersion(record.updatedAt);
    if (changedFields(saved, values, mode).length === 0) setValues(initial);
    setSaved(initial);
  }

  const [extraTags, setExtraTags] = React.useState<TagOption[]>([]);
  const options = React.useMemo(
    () => (extraTags.length ? { ...serverOptions, tags: [...serverOptions.tags, ...extraTags].sort((a, b) => a.name.localeCompare(b.name)) } : serverOptions),
    [serverOptions, extraTags]
  );

  const [busy, setBusy] = React.useState<Busy>(null);
  const [message, setMessage] = React.useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [errors, setErrors] = React.useState<EditorErrors>({});
  const [problem, setProblem] = React.useState<{ section: string } | null>(null);
  const [leaveTo, setLeaveTo] = React.useState<{ target: LeaveTarget; returnTo: Element | null } | null>(null);
  const [applyToAll, setApplyToAll] = React.useState(context.applyToAll);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [localSavedAt, setLocalSavedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const changed = changedFields(saved, values, mode);
  const dirty = changed.length > 0;
  const submission = context.submission;
  const readOnly = record.archived || (mode === "submission" && submission?.status !== "PENDING");
  const nav = context.nav;
  const position = context.position;
  const live = mode === "event" && record.status === "PUBLISHED" && !record.archived;
  const placeIds = React.useMemo(() => new Set(options.places.filter((p) => !p.archived).map((p) => p.id)), [options.places]);

  const saturday = weekendOf(values.days, values.days.length ? null : context.stretch, context.today);
  useRailSelection(railWeekKey(saturday, rail.weeks.map((w) => w.key)));

  const update = React.useCallback((patch: Partial<EditorValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setMessage(null);
    setErrors((e) => clearErrors(e, Object.keys(patch)));
  }, []);

  React.useEffect(() => {
    if (problem) showProblem(problem.section);
  }, [problem]);

  const go = React.useCallback(
    (href: string) => {
      setLeaveTo(null);
      router.push(href);
    },
    [router]
  );

  const leave = (target: LeaveTarget) => {
    setLeaveTo(null);
    shell.leave(target);
  };

  /** Asks in the action bar before leaving; Stay puts focus back where it was. */
  const askToLeave = React.useCallback((target: LeaveTarget) => {
    const active = document.activeElement;
    setLeaveTo({ target, returnTo: active && !active.closest("[data-editor-action-bar]") ? active : null });
  }, []);

  const stay = () => {
    const back = leaveTo?.returnTo ?? null;
    setLeaveTo(null);
    window.requestAnimationFrame(() => {
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) {
        back.focus();
        return;
      }
      const bar = document.querySelector("[data-editor-action-bar]");
      const fallback = [...(bar?.querySelectorAll<HTMLElement>("[data-editor-cancel], button[aria-haspopup]") ?? [])].find((el) => el.offsetParent !== null);
      fallback?.focus();
    });
  };

  const payload = (snapshot: EditorValues): EditorPayload => {
    if (mode === "new") {
      const all = pickChanges(snapshot, allFields("new"));
      if (snapshot.venueId) delete all.place;
      return all as EditorPayload;
    }
    const picked = pickChanges(snapshot, changedFields(saved, snapshot, mode));
    if (mode === "event") {
      if (snapshot.venueId) delete picked.place;
      else if ("place" in picked || "venueId" in picked) {
        picked.place = snapshot.place;
        picked.venueId = "";
      }
    }
    return picked as EditorPayload;
  };

  const fail = (text: string, field?: EditorErrorField) => {
    setMessage({ kind: "error", text });
    announce(text);
    if (!field) return;
    setErrors((e) => ({ ...e, [field]: text }));
    const section = sectionOf(field);
    if (section) setProblem({ section });
  };

  const undo = React.useCallback(
    async (decisionId: string) => {
      const result = await undoEditorDecisionAction(decisionId);
      toast(result.message);
      announce(result.message);
      router.refresh();
    },
    [announce, router]
  );

  const afterSaved = (snapshot: EditorValues) => {
    setSaved(snapshot);
    setLocalSavedAt(() => Date.now());
  };

  /** Saves (and with "publish", publishes) the held edits. Resolves to the result, or null when nothing ran. */
  const commit = async (kind: "save" | "publish"): Promise<EditorActionResult | null> => {
    if (readOnly || busy) return null;
    const blocked = blockingProblem(values, {
      mode,
      hasStretch: !!context.stretch,
      placeIds,
      changed: mode === "new" || kind === "publish" ? undefined : new Set<string>(changed),
    });
    if (blocked) {
      fail(blocked.text, blocked.field);
      return null;
    }
    const snapshot = values;
    setBusy(kind);
    setMessage(null);
    try {
      let result: EditorActionResult;
      if (mode === "new") result = await createEventAction(payload(snapshot), { publish: kind === "publish" });
      else if (mode === "event")
        result = await saveEventAction(record.id!, payload(snapshot), { publish: kind === "publish" && !live, applyToSeries: applyToAll && !!context.series });
      else result = kind === "publish" ? await publishSubmissionAction(record.id!, payload(snapshot)) : await saveSubmissionAction(record.id!, payload(snapshot));
      if (!result.ok) {
        fail(result.error, result.field);
        return null;
      }
      afterSaved(snapshot);
      return result;
    } catch {
      fail("The connection dropped before the save finished. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = async (then?: LeaveTarget) => {
    if (!dirty && mode !== "new") {
      if (then) leave(then);
      else announce("No changes to save.");
      return;
    }
    const result = await commit("save");
    if (!result?.ok) {
      if (then) setLeaveTo(null);
      return;
    }
    announce(result.message);
    if (mode === "new" && result.eventId) {
      toast(result.message);
      if (then?.kind === "back") leave(then);
      else router.replace(then?.kind === "href" ? then.href : `/admin/events/${result.eventId}${nav.carry}`);
      return;
    }
    if (then) leave(then);
    else if (nav.from === "todo") go(nav.backHref);
    else router.refresh();
  };

  const publish = async () => {
    const result = await commit("publish");
    if (!result?.ok) return;
    if (result.refused) {
      fail(`Saved, but not published: ${result.refused}`);
      router.refresh();
      return;
    }
    announce(result.message);
    if (result.decisionId && mode !== "new") toastWithUndo(result.message, () => void undo(result.decisionId!));
    else toast(result.message);
    if (mode === "event" && record.id) markLive([record.id]);
    if (mode === "new" && result.eventId) {
      router.replace(`/admin/events/${result.eventId}${nav.carry}`);
      return;
    }
    if (nav.from === "todo") go(nav.backHref);
    else if (mode === "event" && position?.nextId) go(`/admin/events/${position.nextId}${nav.carry}`);
    else router.refresh();
  };

  const reject = async (reason: string) => {
    if (!record.id || busy) return;
    const snapshot = values;
    setBusy("reject");
    try {
      const body = payload(snapshot);
      const result =
        mode === "submission" ? await rejectSubmissionAction(record.id, body, reason) : await rejectEventAction(record.id, { ...body, status: undefined }, reason);
      if (!result.ok) {
        setRejectOpen(false);
        fail(result.error, result.field);
        return;
      }
      afterSaved({ ...snapshot, status: "REJECTED" });
      setRejectOpen(false);
      announce(result.message);
      if (result.decisionId) toastWithUndo(result.message, () => void undo(result.decisionId!));
      if (nav.from === "todo") go(nav.backHref);
      else if (mode === "event" && position?.nextId) go(`/admin/events/${position.nextId}${nav.carry}`);
      else router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    if (!record.id || busy) return;
    setBusy("archive");
    try {
      const result = await archiveEventAction(record.id);
      setArchiveOpen(false);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      announce(result.message);
      if (result.decisionId) toastWithUndo(result.message, () => void undo(result.decisionId!));
      setSaved(values);
      go(nav.backHref);
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!record.id || busy) return;
    setBusy("restore");
    try {
      const result = await restoreEventAction(record.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      announce(result.message);
      toast(result.message);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const requestLeave = React.useCallback(
    (href: string) => {
      if (dirty && !readOnly) askToLeave({ kind: "href", href });
      else go(href);
    },
    [dirty, readOnly, go, askToLeave]
  );

  const saveAndOpen = (id: string | null | undefined) => {
    if (!id) return;
    const href = `/admin/events/${id}${nav.carry}`;
    if (dirty && !readOnly) void save({ kind: "href", href });
    else go(href);
  };

  // While edits are held, every way out of the editor asks in the action bar first.
  useLeaveGuard(dirty && !readOnly, askToLeave, nav.backHref);

  const primaryAction = () => {
    if (readOnly) return;
    if (live) void save();
    else void publish();
  };

  useShortcuts(
    {
      "mod+s": () => void save(),
      "mod+enter": primaryAction,
      escape: (e) => {
        if (e.target instanceof HTMLSelectElement) return;
        if (leaveTo) stay();
        else requestLeave(nav.backHref);
      },
      "alt+arrowdown": () => saveAndOpen(position?.nextId),
      "alt+arrowup": () => saveAndOpen(position?.previousId),
    },
    { enabled: !rejectOpen && !archiveOpen && !jsonOpen }
  );

  const title = values.title.trim() || (mode === "new" ? "New event" : "Untitled event");
  const tells = context.notifies;

  let statusSentence: string;
  let headerStatus: MarkStatus | null = null;
  const savedStatus: EventStatusValue = record.status ?? "DRAFT";
  let statusNote: string | null = null;
  if (record.archived) {
    statusSentence = "Archived: out of every list";
    headerStatus = "ARCHIVED";
  } else if (mode === "submission") {
    if (submission?.status === "PENDING") {
      statusSentence = "Sent from the site: waiting for your review";
      headerStatus = "WAITING";
      statusNote = "Sent from the site";
    } else if (submission?.status === "APPROVED") {
      statusSentence = "Published from the site";
      headerStatus = submission.createdEvent?.status === "PUBLISHED" ? "PUBLISHED" : "APPROVED";
    } else {
      statusSentence = "Rejected: not on the site";
      headerStatus = "REJECTED";
    }
  } else if (mode === "new") {
    statusSentence = values.status === "PENDING" ? "Not saved yet. Saves as pending" : "Not saved yet. Saves as a draft";
    statusNote = "Not saved yet";
  } else {
    statusSentence = heldStatusSentence(savedStatus, values.status);
    headerStatus = savedStatus as MarkStatus;
  }

  const updatedAt = Math.max(localSavedAt ?? 0, record.updatedAt ? Date.parse(record.updatedAt) : 0);
  const stateText = dirty
    ? unsavedLabel(changed.length)
    : mode === "new"
      ? null
      : updatedAt && mounted && now
        ? (savedAgo(updatedAt, now) ?? `Saved ${formatTimestamp(new Date(updatedAt))}`)
        : null;

  // Publishing goes through the Publish button only, which names who is told.
  const statusOptions =
    mode === "new"
      ? EVENT_STATUS_OPTIONS.filter((o) => o.value === "DRAFT" || o.value === "PENDING")
      : live
        ? EVENT_STATUS_OPTIONS
        : EVENT_STATUS_OPTIONS.filter((o) => o.value !== "PUBLISHED");
  const statusControl =
    !readOnly && mode !== "submission" ? (
      <StatusMenu
        value={values.status}
        options={statusOptions}
        onChange={(value: EventStatusValue) => {
          if (value === "REJECTED") setRejectOpen(true);
          else update({ status: value });
        }}
      />
    ) : null;

  const more: MenuItem[] = [];
  if (phone) more.push({ label: "Cancel", description: "Back without saving.", onSelect: () => requestLeave(nav.backHref) });
  if (mode === "event" && !record.archived && record.id) {
    if (values.status !== "REJECTED") more.push({ label: "Reject", description: "Not a fit. The organizer is told, if there is one.", onSelect: () => setRejectOpen(true), danger: true });
    if (values.status !== "CANCELLED") more.push({ label: "Mark cancelled", description: "Not happening. Hidden from the site.", onSelect: () => update({ status: "CANCELLED" }) });
    if (values.status === "PUBLISHED") more.push({ label: "Unpublish (move to draft)", description: "Off the site until you publish again.", onSelect: () => update({ status: "DRAFT" }) });
    else if (values.status !== "DRAFT") more.push({ label: "Move back to draft", description: "Hidden while you prepare it.", onSelect: () => update({ status: "DRAFT" }) });
    more.push({ label: "Archive", description: "Out of every list. Can be restored.", onSelect: () => setArchiveOpen(true), danger: true });
    more.push({ label: "Copy as next date", href: `/admin/events/new?copy=${encodeURIComponent(record.id)}` });
    if (live) {
      more.push({ label: "Feature on the homepage", href: `/admin/promotions/new?eventId=${encodeURIComponent(record.id)}` });
      more.push({ label: "View on site", href: `/events/${record.slug}`, external: true });
    }
    more.push({ label: "Make a graphic", href: `/admin/marketing/asset-studio/new?eventId=${encodeURIComponent(record.id)}` });
  }
  if (mode === "new") more.push({ label: "Paste from JSON", description: "Fill the form from an import.", onSelect: () => setJsonOpen(true) });
  if (mode === "submission" && submission?.status === "PENDING") {
    more.push({ label: "Reject", description: "Not a fit. The person who sent it is told.", onSelect: () => setRejectOpen(true), danger: true });
  }
  if (mode === "submission" && submission?.createdEvent) more.push({ label: "Open the event", href: `/admin/events/${submission.createdEvent.id}` });

  const publishLabel = tells.length > 0 ? `Publish and tell ${tells[0]}` : "Publish";
  let primary: BarButton | null = null;
  let secondary: BarButton | null = null;
  if (record.archived) {
    primary = { label: "Restore", variant: "ink", onClick: () => void restore(), busy: busy === "restore", busyLabel: "Restoring" };
  } else if (readOnly) {
    primary = submission?.createdEvent ? { label: "Open the event", variant: "ink", onClick: () => go(`/admin/events/${submission.createdEvent!.id}`) } : null;
  } else if (live) {
    primary = { label: "Save", variant: "ink", keys: "Ctrl+S", onClick: () => void save(), busy: busy === "save", busyLabel: "Saving" };
  } else {
    secondary = { label: "Save", keys: "Ctrl+S", onClick: () => void save(), busy: busy === "save", busyLabel: "Saving", disabled: busy === "publish" };
    primary = { label: publishLabel, variant: "publish", keys: "Ctrl+Enter", onClick: () => void publish(), busy: busy === "publish", busyLabel: "Publishing", disabled: busy === "save" };
  }

  const form: EditorForm = {
    mode,
    record,
    values,
    saved,
    update,
    options,
    context,
    errors,
    readOnly,
  };

  const banner = record.archived ? (
    <p className="mt-4 border-l-2 border-seam-strong pl-4 text-sm text-basalt">Archived. It is out of every list and can be restored.</p>
  ) : mode === "submission" && submission && submission.status !== "PENDING" ? (
    <p className="mt-4 border-l-2 border-seam-strong pl-4 text-sm text-basalt">
      {submission.status === "APPROVED" ? "Published from the site" : "Rejected"}
      {submission.reviewNotes ? `: ${submission.reviewNotes}` : "."}{" "}
      {submission.createdEvent && (
        <Link href={`/admin/events/${submission.createdEvent.id}`} className="rounded-sm font-medium text-lilac underline-offset-4 hover:underline">
          Open {submission.createdEvent.title}
        </Link>
      )}
    </p>
  ) : context.copiedFrom ? (
    <p className="mt-4 border-l-2 border-seam-strong pl-4 text-sm text-basalt">
      A copy of {context.copiedFrom.title}, one week later. Check the dates before saving.
    </p>
  ) : null;

  const main = (
    <>
      {context.series && mode === "event" && (
        <SeriesBanner series={context.series} applyToAll={applyToAll} onChange={setApplyToAll} readOnly={readOnly} />
      )}
      <ListingSection />
      <WhenSection />
      <WhereSection />
      <PictureSection />
      <TagsFeaturesSection onTagCreated={(tag) => setExtraTags((tags) => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag]))} />
      <LinksSection />
      {mode !== "submission" && (
        <>
          <VendorsSection />
          <MoreDetailsSection />
        </>
      )}
    </>
  );

  const side = (
    <>
      {mode === "submission" && <WhatTheySent />}
      {!readOnly && <ReadinessPanel />}
      {mode === "event" && <CameFrom />}
      {mode === "event" && !record.archived && <Twins />}
      {mode !== "submission" && <Notes />}
      <HistoryMini onUndo={undo} />
      {mode !== "submission" && (
        <Also
          onPasteJson={mode === "new" ? () => setJsonOpen(true) : undefined}
          onArchive={mode === "event" && !record.archived ? () => setArchiveOpen(true) : undefined}
          onRestore={record.archived ? () => void restore() : undefined}
        />
      )}
    </>
  );

  return (
    <EditorFormProvider value={form}>
      <Screen bottomBar={false}>
        <EditorShell
          onKeyDown={keepPickerKeys}
          label={mode === "new" ? "New event" : `Editing ${title}`}
          header={
            <>
              <RecordHeader
                backLabel={nav.backLabel}
                backHref={nav.backHref}
                onBack={() => requestLeave(nav.backHref)}
                position={position}
                onPrevious={() => saveAndOpen(position?.previousId)}
                onNext={() => saveAndOpen(position?.nextId)}
                title={title}
                status={headerStatus}
                statusNote={statusNote}
                liveHref={live && record.slug ? `/events/${record.slug}` : null}
              />
              <SectionLinks links={mode === "submission" ? SUBMISSION_SECTIONS : EVENT_SECTIONS} />
            </>
          }
          banner={banner}
          main={main}
          side={side}
          actionBar={
            <ActionBar
              statusSentence={statusSentence}
              statusControl={statusControl}
              stateText={stateText}
              message={message}
              more={more}
              cancel={{ label: "Cancel", keys: "Esc", onClick: () => requestLeave(nav.backHref) }}
              secondary={secondary}
              primary={primary}
              leavePrompt={
                leaveTo
                  ? {
                      busy: busy === "save",
                      onStay: stay,
                      onDiscard: () => {
                        setValues(saved);
                        setErrors({});
                        leave(leaveTo.target);
                      },
                      onSave: () => void save(leaveTo.target),
                    }
                  : null
              }
            />
          }
        />
      </Screen>
      {mode !== "new" && (
        <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} title={title} tells={tells} busy={busy === "reject"} onReject={(reason) => void reject(reason)} />
      )}
      {mode === "event" && (
        <ConfirmDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          title={`Archive ${title}?`}
          description={
            dirty
              ? "It leaves every list and the site, and can be restored. Your unsaved changes are not saved."
              : "It leaves every list and the site, and can be restored."
          }
          confirmLabel="Archive"
          variant="destructive"
          pending={busy === "archive"}
          onConfirm={() => void archive()}
        />
      )}
      {mode === "new" && (
        <JsonPasteDialog
          open={jsonOpen}
          onOpenChange={setJsonOpen}
          current={values}
          options={options}
          onFill={(next, filled) => {
            setValues(next);
            announce(`Filled ${filled} ${filled === 1 ? "field" : "fields"} from the JSON.`);
          }}
        />
      )}
    </EditorFormProvider>
  );
}
