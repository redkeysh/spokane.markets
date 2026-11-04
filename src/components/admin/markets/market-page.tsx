"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { DateLeaf } from "@/components/admin/kit/date-leaf";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Empty } from "@/components/admin/kit/empty";
import { HistoryList, type HistoryListEntry } from "@/components/admin/kit/history-list";
import { GroupHeading, List, ListRow } from "@/components/admin/kit/list";
import { Menu } from "@/components/admin/kit/menu";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useLeaveGuard } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useShell, type LeaveTarget } from "@/components/admin/shell/shell-context";
import { useMediaQuery } from "@/components/admin/shell/use-media";
import type { MarketNote, VerificationStatus, WaitingDate } from "@/lib/markets/board";
import type { PlannedDate } from "@/lib/markets/dates";
import type { MarketDetails } from "@/lib/markets/details";
import {
  archiveMarket,
  linkDatesToMarket,
  publishMarketDates,
  restoreMarket,
  saveMarketDetails,
  setMarketVerification,
  undoMarketChange,
} from "@/app/admin/_actions/markets";
import { AddDates, type CopySource } from "./add-dates";
import { focusRowSoon } from "./markets-board";
import { DetailsActionBar, MarketDetailsForm, countChanges, type DetailErrors, type DetailsOptions } from "./market-details";
import { NextSeason } from "./next-season";
import { CONFIRM_OVER, PublishConfirm } from "./publish-confirm";
import { useMarketAction } from "./use-market-action";

export type DateRowView = {
  id: string;
  href: string;
  date: string;
  /** "Fri Nov 27, 12:00 to 4:00 pm". */
  when: string;
  /** The listing's title when it differs from its season's. */
  title: string | null;
  /** The place when it is not the market's home place. */
  place: string | null;
  status: MarkStatus;
  /** Pending or Draft and still ahead: it can be ticked and published. */
  waiting: boolean;
  flags: string[];
};

export type SeasonView = {
  key: string;
  /** "Winter 2026: Kendall Yards Christmas Market". */
  heading: string;
  /** "6 dates, 6 waiting" or "Published, ended". */
  fact: string;
  ended: boolean;
  rows: DateRowView[];
  /** For a past listing that ran all season: its dates next year, one per week. */
  repeat: { plan: PlannedDate[]; summary: string; year: string; eventIds: string[] } | null;
};

export type MarketPageData = {
  market: {
    id: string;
    name: string;
    archived: boolean;
    verification: VerificationStatus;
    publicHref: string | null;
    /** "Kendall Yards, 1335 W Summit Pkwy, Spokane". */
    home: string;
    homeId: string;
    homeArchived: boolean;
    /** ISO time the market's own record last changed. */
    updatedAt: string;
  };
  nextSentence: string;
  notes: MarketNote[];
  lookAlikeIds: string[];
  scheduleCheck: string | null;
  scheduleSuggestion: string | null;
  seasons: SeasonView[];
  /** Pending and Draft dates still ahead, by date. */
  waiting: WaitingDate[];
  /** Open Add dates on arrival (`?add=1`). */
  openAdd: boolean;
  plan: PlannedDate[];
  planSummary: string;
  sources: CopySource[];
  taken: string[];
  firstFree: string;
  today: string;
  nowIso: string;
  details: MarketDetails;
  ownerDisplay: string;
  team: { name: string; role: string }[];
  /** Names of the people told when the market is verified. */
  toldOnVerify: string[];
  options: DetailsOptions;
  history: HistoryListEntry[];
  /** History entry id to the decision its Undo reverses. */
  undoable: Record<string, string>;
};

const VERIFICATION_MARK: Record<VerificationStatus, MarkStatus> = {
  VERIFIED: "VERIFIED",
  PENDING: "VERIFICATION_PENDING",
  UNVERIFIED: "NOT_VERIFIED",
};

const VERIFICATION_OPTIONS: { value: VerificationStatus; label: string; consequence: string; verb: string }[] = [
  { value: "VERIFIED", label: "Verified", consequence: "Events this organizer adds go live without review.", verb: "Verify" },
  {
    value: "PENDING",
    label: "Waiting for verification",
    consequence: "The organizer asked to be verified. Events they add wait for your review.",
    verb: "Mark as waiting",
  },
  { value: "UNVERIFIED", label: "Not verified", consequence: "Events this organizer adds wait for your review.", verb: "Mark as not verified" },
];

function names(list: readonly string[]): string {
  if (list.length <= 2) return list.join(" and ");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Verified, Waiting for verification or Not verified, with a menu whose every choice says what it does and asks once. */
function Verification({ data }: { data: MarketPageData }) {
  const { run, busy } = useMarketAction();
  const [choice, setChoice] = React.useState<VerificationStatus | null>(null);
  const option = VERIFICATION_OPTIONS.find((o) => o.value === choice);
  const current = data.market.verification;
  return (
    <span className="inline-flex items-center gap-1">
      <StatusMark status={VERIFICATION_MARK[current]} chip />
      {!data.market.archived && (
        <Menu
          label="Change verification"
          trigger="Change"
          variant="quiet"
          size="sm"
          items={VERIFICATION_OPTIONS.map((o) => ({
            label: o.label,
            description: o.consequence,
            checked: o.value === current,
            onSelect: () => (o.value === current ? undefined : setChoice(o.value)),
          }))}
        />
      )}
      <AdminDialog
        open={choice !== null}
        onOpenChange={(open) => !open && setChoice(null)}
        title={
          choice === "VERIFIED"
            ? `Verify ${data.market.name}?`
            : choice === "PENDING"
              ? `Mark ${data.market.name} as waiting for verification?`
              : `Mark ${data.market.name} as not verified?`
        }
        footer={
          <>
            <AdminButton variant="quiet" onClick={() => setChoice(null)}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="ink"
              data-autofocus
              busy={busy === "verify"}
              busyLabel="Saving"
              onClick={async () => {
                if (!choice) return;
                const result = await run("verify", () => setMarketVerification({ marketId: data.market.id, status: choice }));
                if (result.ok) setChoice(null);
              }}
            >
              {option?.verb}
            </AdminButton>
          </>
        }
      >
        {option && (
          <div className="space-y-2 pb-2 text-sm text-basalt">
            <p>
              {option.label}: {option.consequence.charAt(0).toLowerCase() + option.consequence.slice(1)}
            </p>
            {choice === "VERIFIED" && (
              <p className="text-ash">
                {data.toldOnVerify.length
                  ? `${names(data.toldOnVerify)} ${data.toldOnVerify.length === 1 ? "is" : "are"} told it is verified, and can then edit the market.`
                  : "Nobody is told: the market has no owner or manager yet."}
              </p>
            )}
          </div>
        )}
      </AdminDialog>
    </span>
  );
}

function SeasonGroup({
  season,
  ticked,
  onTick,
  onClearTicks,
  onRepeat,
  headingId,
}: {
  season: SeasonView;
  ticked: ReadonlySet<string>;
  onTick: (id: string, on: boolean) => void;
  onClearTicks: () => void;
  onRepeat: (season: SeasonView, opener: HTMLElement) => void;
  headingId: string;
}) {
  const limit = season.ended ? 0 : 4;
  const [expanded, setExpanded] = React.useState(season.rows.length <= limit);
  const shown = expanded ? season.rows : season.rows.slice(0, season.ended ? 0 : 3);
  const hiddenCount = season.rows.length - shown.length;
  return (
    <section aria-labelledby={headingId}>
      <GroupHeading
        as="h3"
        sticky={false}
        fact={season.fact}
        action={
          season.repeat ? (
            <AdminButton size="sm" variant="outline" onClick={(e) => onRepeat(season, e.currentTarget)}>
              Repeat for {season.repeat.year} as weekly dates
            </AdminButton>
          ) : undefined
        }
        className="flex-wrap"
      >
        <span id={headingId}>{season.heading}</span>
      </GroupHeading>
      {shown.length > 0 && (
        <List label={season.heading} onClearTicks={onClearTicks}>
          {shown.map((row) => (
            <ListRow
              key={row.id}
              rowKey={row.id}
              href={row.href}
              leaf={<DateLeaf date={row.date} />}
              title={row.title ?? row.when}
              meta={[row.title ? row.when : null, row.place].filter(Boolean).join(", ") || undefined}
              flags={row.flags.length ? row.flags.join(", ") : undefined}
              status={<StatusMark status={row.status} size="sm" />}
              ticked={row.waiting ? ticked.has(row.id) : undefined}
              onTickedChange={row.waiting ? (on) => onTick(row.id, on) : undefined}
            />
          ))}
        </List>
      )}
      {hiddenCount > 0 && (
        <div className="border-b border-seam px-4 py-1.5">
          <AdminButton
            size="sm"
            variant="quiet"
            aria-expanded={false}
            onClick={() => {
              setExpanded(true);
              focusRowSoon(season.rows[shown.length].id);
            }}
          >
            Show {hiddenCount} {season.ended ? (hiddenCount === 1 ? "date" : "dates") : "more"}
          </AdminButton>
        </div>
      )}
    </section>
  );
}

type Panel = { kind: "add" } | { kind: "next"; plan: PlannedDate[]; summary: string; eventIds?: string[] } | null;

/**
 * The market page: dates first (by season, waiting ones ticked for "Publish 6"), add dates and next
 * season in place, then the details in collapsed groups with the action bar that saves them.
 */
export function MarketPage({ data }: { data: MarketPageData }) {
  const router = useRouter();
  const { leave, navigate } = useShell();
  const announce = useAnnounce();
  const phone = useMediaQuery("(max-width: 767.98px)", false);
  const now = React.useMemo(() => new Date(data.nowIso), [data.nowIso]);
  const archived = data.market.archived;
  const canAdd = !archived && !data.market.homeArchived;
  const { run, busy } = useMarketAction();

  const held = new Set(data.notes.find((n) => n.kind === "slug-mismatch")?.eventIds ?? []);
  const defaultTicks = () => new Set(data.waiting.filter((w) => !held.has(w.id)).map((w) => w.id));
  const [ticked, setTicked] = React.useState<ReadonlySet<string>>(defaultTicks);
  const [panel, setPanel] = React.useState<Panel>(() => (data.openAdd && canAdd ? { kind: "add" } : null));
  const [confirming, setConfirming] = React.useState(false);
  const [baseline, setBaseline] = React.useState(data.details);
  const [values, setValues] = React.useState(data.details);
  const [errors, setErrors] = React.useState<DetailErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [leaveTo, setLeaveTo] = React.useState<LeaveTarget | null>(null);
  const waitingKey = data.waiting.map((w) => w.id).join("|");
  const [seenWaiting, setSeenWaiting] = React.useState(waitingKey);
  const [seenDetails, setSeenDetails] = React.useState(data.details);
  const opener = React.useRef<HTMLElement | null>(null);
  const addButton = React.useRef<HTMLButtonElement>(null);

  if (waitingKey !== seenWaiting) {
    setSeenWaiting(waitingKey);
    setTicked(defaultTicks());
  }
  if (data.details !== seenDetails) {
    setSeenDetails(data.details);
    if (countChanges(baseline, values) === 0) {
      setBaseline(data.details);
      setValues(data.details);
    }
  }

  React.useEffect(() => {
    if (!data.openAdd) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [data.openAdd]);

  const changes = countChanges(baseline, values);
  useLeaveGuard(changes > 0, setLeaveTo, "/admin/markets");
  useShortcuts(
    {
      escape: (event) => {
        if ((event.target as Element | null)?.closest?.("[role=dialog], [role=listbox], [role=menu]")) return;
        if (leaveTo) setLeaveTo(null);
        else navigate("/admin/markets");
      },
    },
    { enabled: !panel && !confirming }
  );

  const openPanel = (next: Exclude<Panel, null>, from: HTMLElement) => {
    opener.current = from;
    setPanel(next);
  };
  const closePanel = () => {
    setPanel(null);
    const target = opener.current ?? addButton.current;
    opener.current = null;
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus();
    });
  };

  const toPublish = data.waiting.filter((w) => ticked.has(w.id));
  const publishNow = () => void run("publish", () => publishMarketDates({ marketId: data.market.id, eventIds: toPublish.map((w) => w.id) }));
  const publish = () => (toPublish.length > CONFIRM_OVER ? setConfirming(true) : publishNow());
  useShortcuts(
    {
      p: () => {
        if (toPublish.length > 0 && busy === null) publish();
      },
    },
    { enabled: !archived && !panel && !confirming && data.waiting.length > 0 }
  );

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const result = await saveMarketDetails({ id: data.market.id, values });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast(result.error);
        announce(result.error);
        return false;
      }
      setErrors({});
      setBaseline(values);
      toast(result.message);
      announce(result.message);
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const suggestion = data.scheduleSuggestion;
  const adoptSchedule = suggestion ? () => setValues((v) => ({ ...v, typicalSchedule: suggestion })) : undefined;

  const linkNote = data.notes.find((n) => n.kind === "look-alikes");
  const placeNotes = data.notes.filter((n) => n.kind !== "schedule" && n.kind !== "home-archived");
  const totalDates = data.seasons.reduce((n, s) => n + s.rows.length, 0);
  const verification = VERIFICATION_OPTIONS.find((o) => o.value === data.market.verification);

  const addDates = (
    <AddDates
      marketId={data.market.id}
      sources={data.sources}
      taken={data.taken}
      homePlace={data.market.home.split(",")[0]}
      firstFree={data.firstFree}
      today={data.today}
      now={now}
      onClose={closePanel}
      inDialog={phone}
    />
  );

  return (
    <Screen bottomBar={false} className="grid grid-rows-[minmax(0,1fr)_auto]">
      <Pane label={data.market.name} className="lg:px-6">
        <div className="mx-auto max-w-[1184px] space-y-8 pb-10">
          <header className="space-y-3">
            <PageHeader
              title={data.market.name}
              back={{ href: "/admin/markets", label: "Back to Markets" }}
              actions={
                <>
                  {archived ? (
                    <>
                      <StatusMark status="ARCHIVED" chip />
                      <AdminButton size="sm" variant="outline" busy={busy === "restore"} busyLabel="Restoring" onClick={() => void run("restore", () => restoreMarket(data.market.id))}>
                        Restore
                      </AdminButton>
                    </>
                  ) : (
                    <Verification data={data} />
                  )}
                  {data.market.publicHref && (
                    <a
                      href={data.market.publicHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-6 items-center rounded-sm text-sm text-lilac underline-offset-4 hover:underline"
                    >
                      View on site
                    </a>
                  )}
                </>
              }
            />
            <div className="max-w-[72ch] space-y-1.5 text-sm text-basalt">
              <p>
                Home place:{" "}
                <Link href={`/admin/venues/${data.market.homeId}`} className="text-lilac underline-offset-4 hover:underline">
                  {data.market.home}
                </Link>
                .{data.market.homeArchived && <span className="text-honey-ink"> It is archived, so new dates cannot be added until it is restored or another home place is picked.</span>}
              </p>
              {placeNotes.map((note) => (
                <p key={note.kind} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{note.text}</span>
                  {note.kind === "slug-mismatch" && note.eventIds?.[0] && (
                    <AdminLinkButton href={`/admin/events/${note.eventIds[0]}?from=markets&back=${encodeURIComponent(`/admin/markets/${data.market.id}`)}`} size="sm" variant="outline">
                      Open that date
                    </AdminLinkButton>
                  )}
                  {note.kind === "same-place-twice" && note.href && (
                    <AdminLinkButton href={note.href} size="sm" variant="outline">
                      Merge places
                    </AdminLinkButton>
                  )}
                  {note.kind === "look-alikes" && linkNote?.eventIds && !archived && (
                    <AdminButton
                      size="sm"
                      variant="outline"
                      busy={busy === "link"}
                      busyLabel="Linking"
                      onClick={() => void run("link", () => linkDatesToMarket({ marketId: data.market.id, eventIds: linkNote.eventIds! }))}
                    >
                      Link {linkNote.eventIds.length} {linkNote.eventIds.length === 1 ? "date" : "dates"}
                    </AdminButton>
                  )}
                </p>
              ))}
              <p>{data.nextSentence}</p>
            </div>
          </header>

          <section aria-labelledby="dates-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="dates-heading" className="font-text text-[15px]/[20px] font-semibold text-basalt">
                Dates
              </h2>
              {!archived && (
                <div className="flex flex-wrap gap-2">
                  <AdminButton
                    ref={addButton}
                    variant="outline"
                    aria-expanded={panel?.kind === "add"}
                    disabled={!canAdd}
                    onClick={(e) => (panel?.kind === "add" ? closePanel() : openPanel({ kind: "add" }, e.currentTarget))}
                  >
                    Add dates
                  </AdminButton>
                  {data.plan.length > 0 && (
                    <AdminButton
                      variant="outline"
                      aria-expanded={panel?.kind === "next" && !panel.eventIds}
                      disabled={!canAdd}
                      onClick={(e) =>
                        panel?.kind === "next" && !panel.eventIds
                          ? closePanel()
                          : openPanel({ kind: "next", plan: data.plan, summary: data.planSummary }, e.currentTarget)
                      }
                    >
                      Next season
                    </AdminButton>
                  )}
                  {data.waiting.length > 0 && (
                    <AdminButton
                      variant={panel ? "outline" : "publish"}
                      disabled={toPublish.length === 0}
                      busy={busy === "publish"}
                      busyLabel="Publishing"
                      aria-keyshortcuts={panel ? undefined : "p"}
                      onClick={publish}
                    >
                      Publish {toPublish.length}
                    </AdminButton>
                  )}
                </div>
              )}
            </div>

            {panel?.kind === "add" &&
              (phone ? (
                <AdminDialog
                  open
                  onOpenChange={(open) => !open && closePanel()}
                  title="Add dates"
                  size="list"
                  className="m-0 h-dvh max-h-none w-screen max-w-none rounded-none [&>div:first-child]:h-full [&>div:first-child]:max-h-none"
                  bodyClassName="pb-6"
                >
                  {addDates}
                </AdminDialog>
              ) : (
                addDates
              ))}
            {panel?.kind === "next" && (
              <NextSeason
                marketId={data.market.id}
                plan={panel.plan}
                summary={panel.summary}
                fromEventIds={panel.eventIds}
                headingLevel="h3"
                onClose={closePanel}
                now={now}
                className="border-t-2 border-lilac pt-4"
              />
            )}

            {totalDates === 0 ? (
              <Empty
                detail={data.plan.length > 0 ? "Last season's dates can be repeated with Next season." : "Add the first dates to put it on the calendar."}
              >
                This market has no dates.
              </Empty>
            ) : (
              <div className="space-y-4">
                {data.seasons.map((season) => (
                  <SeasonGroup
                    key={season.key}
                    season={season}
                    headingId={`season-${season.key.replace(/[^a-z0-9]/gi, "")}`}
                    ticked={ticked}
                    onTick={(id, on) =>
                      setTicked((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(id);
                        else next.delete(id);
                        return next;
                      })
                    }
                    onClearTicks={() => setTicked(new Set())}
                    onRepeat={(s, from) =>
                      s.repeat && openPanel({ kind: "next", plan: s.repeat.plan, summary: s.repeat.summary, eventIds: s.repeat.eventIds }, from)
                    }
                  />
                ))}
              </div>
            )}
            <PublishConfirm open={confirming} onOpenChange={setConfirming} marketName={data.market.name} dates={toPublish} onConfirm={publishNow} />
          </section>

          <section aria-labelledby="details-heading" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="details-heading" className="font-text text-[15px]/[20px] font-semibold text-basalt">
                Details
              </h2>
              {!archived && (
                <Menu
                  label={`More for ${data.market.name}`}
                  items={[
                    { label: "Archive", description: "Off the site and out of every list. Can be restored.", danger: true, onSelect: () => void run("archive", () => archiveMarket(data.market.id)) },
                  ]}
                />
              )}
            </div>
            <MarketDetailsForm
              values={values}
              onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              errors={errors}
              options={data.options}
              ownerDisplay={data.ownerDisplay}
              team={data.team}
              scheduleCheck={data.scheduleCheck}
              scheduleSuggestion={data.scheduleSuggestion}
              onUseSchedule={archived ? undefined : adoptSchedule}
              verificationLine={
                <p className="text-sm text-basalt">
                  Verification: {verification?.label}. <span className="text-ash">{verification?.consequence} Change it next to the name.</span>
                </p>
              }
            />
          </section>

          <section aria-labelledby="history-heading" className="space-y-2">
            <h2 id="history-heading" className="font-text text-[15px]/[20px] font-semibold text-basalt">
              History
            </h2>
            <HistoryList
              entries={data.history}
              headingLevel="h3"
              stickyHeadings={false}
              onUndo={async (entryId) => {
                const decisionId = data.undoable[entryId];
                if (!decisionId) return;
                const result = await undoMarketChange(decisionId);
                const words = result.ok ? result.message : result.error;
                toast(words);
                announce(words);
                router.refresh();
              }}
            />
          </section>
        </div>
      </Pane>
      <DetailsActionBar
        changes={changes}
        saving={saving}
        onSave={async () => {
          const ok = await save();
          if (ok && leaveTo) leave(leaveTo);
        }}
        onDiscard={() => {
          setValues(baseline);
          setErrors({});
        }}
        leaving={leaveTo !== null}
        onLeave={() => leaveTo && leave(leaveTo)}
        onStay={() => setLeaveTo(null)}
        onCancel={() => navigate("/admin/markets")}
        savedAt={Date.parse(data.market.updatedAt)}
      />
    </Screen>
  );
}
