"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AREAS, type Area } from "@/lib/admin/regions";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { SingleKeysContext, isTypingTarget, useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useLeaveGuard } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useRail, useRailReach, useRailSelection } from "@/components/admin/shell/rail-context";
import { useShell } from "@/components/admin/shell/shell-context";
import { useMediaQuery } from "@/components/admin/shell/use-media";
import {
  archiveDecisionEvents,
  keepOneCopy,
  markDifferentEvents,
  publishEvents,
  publishSubmissionDecision,
  rejectEvents,
  rejectSubmissionDecision,
  saveEventEdits,
  saveSubmissionPlace,
  snoozeDecision,
  undoTodoDecision,
} from "@/app/admin/_actions/todo";
import { ContextPane } from "./context-pane";
import { DecisionArea } from "./decision-pane";
import { editorHref } from "./decision-model";
import type { EventEditsInput } from "./held-edits";
import { archiveMessage, keepMessage, laterMessage, publishMessage, rejectMessage, weekLiveSentence } from "./messages";
import { Pile } from "./pile";
import {
  briefItemId,
  buildPile,
  cursorAfterDecision,
  decisionItemId,
  defaultLane,
  enterLane,
  laneFromParams,
  moveCursor,
  stepWeek,
  weekKeyOf,
  type CursorMove,
  type PileInput,
  type PileItem,
  type PileScope,
  type PileState,
} from "./pile-model";
import { PublishConfirm } from "./publish-confirm";
import { RejectReasons } from "./reject-reasons";
import { TodoContext, type DirtyEntry, type KeepOneOptions, type RejectRequest, type TodoApi } from "./todo-context";
import type { Decision, DecisionLane, TodoActionResult, TodoData } from "./types";

const EMPTY: ReadonlySet<string> = new Set();
const SCOPES: ReadonlySet<string> = new Set(["all", "events", "places", "public"]);

/** The shell's pane mode: pile, decision and context side by side, each scrolling by itself. */
const PANE_MODE = "(min-width: 1024px) and (min-height: 600px)";
const CONTEXT_PANE = "(min-width: 1280px) and (min-height: 600px)";
/** How long the shell waits for the second key of "g e", the same window as kit/use-shortcuts. */
const SEQUENCE_MS = 1500;

function paneMode(): boolean {
  return window.matchMedia(PANE_MODE).matches;
}

type UrlParts = { week: string | null; lane: string | null; d: string | null };
type Nav = { openLane: DecisionLane; cursor: string; url: UrlParts };
type Ok = Extract<TodoActionResult, { ok: true }>;

function urlParts(params: URLSearchParams | null): UrlParts {
  return { week: params?.get("week") ?? null, lane: params?.get("lane") ?? null, d: params?.get("d") ?? null };
}

function sameUrl(a: UrlParts, b: UrlParts): boolean {
  return a.week === b.week && a.lane === b.lane && a.d === b.d;
}

/** The pile row a `?d=` value names: a decision key, or "brief:<lane>". */
function itemForD(d: string, data: TodoData): { lane: DecisionLane; cursor: string } | null {
  if (d.startsWith("brief:")) {
    const lane = d.slice(6) as DecisionLane;
    return data.lanes.some((l) => l.lane === lane) ? { lane, cursor: d } : null;
  }
  const decision = data.decisions.find((x) => x.key === d);
  if (decision) return { lane: decision.lane, cursor: decisionItemId(decision.key) };
  const single = d.match(/^single:(.+)$/);
  if (single) {
    const batch = data.decisions.find((x) => x.rows.some((r) => r.id === single[1]));
    if (batch) return { lane: batch.lane, cursor: decisionItemId(batch.key) };
  }
  return null;
}

/** The `?d=` value for a pile row. */
function dOf(itemId: string): string | null {
  if (itemId.startsWith("d:")) return itemId.slice(2);
  if (itemId.startsWith("brief:")) return itemId;
  return null;
}

function navFromUrl(url: UrlParts, data: TodoData, input: PileInput, state: Omit<PileState, "openLane">): Nav {
  const fromD = url.d ? itemForD(url.d, data) : null;
  if (fromD) return { openLane: fromD.lane, cursor: fromD.cursor, url };
  const lane = laneFromParams(url.week, url.lane, data.lanes) ?? defaultLane(data.lanes);
  const cursor = enterLane(input, { ...state, openLane: lane }, lane, "first") ?? briefItemId(lane);
  return { openLane: lane, cursor, url };
}

/** Changes the query without a server round trip; Next's router picks up the new search params. */
function writeUrl(changes: Record<string, string | null>, mode: "replace" | "push" = "replace"): UrlParts {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
  return urlParts(url.searchParams);
}

function laneUrl(lane: DecisionLane, fallback: DecisionLane): Pick<UrlParts, "week" | "lane"> {
  if (lane === fallback) return { week: null, lane: null };
  const week = weekKeyOf(lane);
  return week ? { week, lane: null } : { week: null, lane };
}

/**
 * The To do screen: the pile, the decision on the cursor and its context. Owns the cursor, the
 * open lane, the held-edit guard, every decision action with its toast, Undo and announcement,
 * and the pile's keys.
 */
export function TodoScreen({ data }: { data: TodoData }) {
  const router = useRouter();
  const params = useSearchParams();
  const announce = useAnnounce();
  const singleKeys = React.useContext(SingleKeysContext);
  const { rail, markLive } = useRail();
  const wide = useMediaQuery(PANE_MODE, true);
  const xl = useMediaQuery(CONTEXT_PANE, true);
  const now = React.useMemo(() => new Date(data.now), [data.now]);

  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(EMPTY);
  const [split, setSplit] = React.useState<ReadonlySet<string>>(EMPTY);
  const [seen, setSeen] = React.useState(data);
  if (seen !== data) {
    setSeen(data);
    setHidden(EMPTY);
  }

  const scopeParam = params?.get("show") ?? "all";
  const scope: PileScope = SCOPES.has(scopeParam) ? (scopeParam as PileScope) : "all";
  const areaParam = params?.get("area") ?? null;
  const area: Area | null = AREAS.includes(areaParam as Area) ? (areaParam as Area) : null;
  const url = urlParts(params);
  const fallbackLane = defaultLane(data.lanes);

  const input = React.useMemo<PileInput>(() => ({ decisions: data.decisions, lanes: data.lanes, events: data.events }), [data]);
  const baseState = { scope, area, hidden, split };

  const [nav, setNav] = React.useState<Nav>(() => navFromUrl(url, data, input, baseState));
  // The router's search params trail our own history writes by a render; only a change the
  // router reports that we did not write (a rail link, Back) moves the cursor.
  const [seenUrl, setSeenUrl] = React.useState(url);
  if (!sameUrl(url, seenUrl)) {
    setSeenUrl(url);
    if (!sameUrl(url, nav.url)) {
      const laneChanged = url.week !== nav.url.week || url.lane !== nav.url.lane;
      const opened = url.d && url.d !== nav.url.d ? itemForD(url.d, data) : null;
      if (opened) setNav({ openLane: opened.lane, cursor: opened.cursor, url });
      else if (laneChanged) setNav(navFromUrl({ ...url, d: null }, data, input, baseState));
      else setNav({ ...nav, url });
    }
  }

  const state: PileState = { ...baseState, openLane: nav.openLane };
  const openLaneNow = nav.openLane;
  const pile = React.useMemo(
    () => buildPile(input, { openLane: openLaneNow, scope, area, hidden, split }),
    [input, openLaneNow, scope, area, hidden, split]
  );
  const cursorItem: PileItem | undefined =
    pile.items.find((i) => i.id === nav.cursor) ?? pile.items.find((i) => i.lane === nav.openLane) ?? pile.items[0];
  const current = cursorItem?.type === "decision" ? cursorItem.decision : null;
  const phoneOpen = !!url.d;
  const keysEnabled = wide || phoneOpen;

  const pileRef = React.useRef(pile);
  const navRef = React.useRef(nav);
  React.useEffect(() => {
    pileRef.current = pile;
    navRef.current = nav;
  });

  const openWeek = weekKeyOf(nav.openLane);
  useRailSelection(openWeek);
  const readyHere = data.decisions.find((d) => d.kind === "ready" && d.lane === cursorItem?.lane && !hidden.has(d.key));
  useRailReach(current ? current.settles : cursorItem?.type === "brief" ? (readyHere?.settles ?? null) : null);

  const [focusRequest, setFocusRequest] = React.useState<{ id: string; n: number } | null>(null);
  const requestFocus = React.useCallback((id: string) => setFocusRequest((prev) => ({ id, n: (prev?.n ?? 0) + 1 })), []);

  const dirtyRef = React.useRef<DirtyEntry | null>(null);
  const [held, setHeld] = React.useState(false);
  const setDirty = React.useCallback((entry: DirtyEntry | null) => {
    dirtyRef.current = entry;
    setHeld(!!entry && entry.count > 0);
  }, []);
  const [pendingLeave, setPendingLeave] = React.useState<{ go: () => void } | null>(null);

  /** Holds `go` behind "Save changes first?" and returns true when the pane holds unsaved edits. */
  const hold = React.useCallback(
    (go: () => void) => {
      if (!dirtyRef.current || dirtyRef.current.count === 0) return false;
      setPendingLeave({ go });
      announce("Save changes first?");
      return true;
    },
    [announce]
  );

  /** Runs `go` now, or after "Save changes first?" when the pane holds unsaved edits. */
  const guard = React.useCallback(
    (go: () => void) => {
      if (!hold(go)) go();
    },
    [hold]
  );

  // Leaving To do (links, shortcuts, Jump, Back) asks the same question while edits are held.
  const { leave } = useShell();
  useLeaveGuard(held, (target) => hold(() => leave(target)));

  const applyMove = React.useCallback(
    (move: CursorMove, options: { focus?: boolean } = {}) => {
      const prev = navRef.current;
      let nextUrl = prev.url;
      const narrow = !paneMode();
      if (move.openLane !== prev.openLane || (!narrow && prev.url.d)) {
        nextUrl = writeUrl({ ...laneUrl(move.openLane, fallbackLane), d: narrow ? prev.url.d : null });
      }
      if (narrow && prev.url.d && dOf(move.cursor) && dOf(move.cursor) !== prev.url.d) {
        nextUrl = writeUrl({ d: dOf(move.cursor) });
      }
      setNav({ openLane: move.openLane, cursor: move.cursor, url: nextUrl });
      if (options.focus && !narrow) requestFocus(move.cursor);
    },
    [fallbackLane, requestFocus]
  );

  const moveTo = React.useCallback(
    (move: CursorMove | null, options: { focus?: boolean } = {}) => {
      if (!move) return;
      if (move.cursor === navRef.current.cursor && move.openLane === navRef.current.openLane) {
        if (options.focus) requestFocus(move.cursor);
        return;
      }
      guard(() => applyMove(move, options));
    },
    [applyMove, guard, requestFocus]
  );

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  });

  const move = (delta: 1 | -1) => moveTo(moveCursor(input, stateRef.current, navRef.current.cursor, delta), { focus: true });

  const openLane = React.useCallback(
    (lane: DecisionLane) => {
      const cursor = enterLane(input, { ...stateRef.current, openLane: lane }, lane, "first");
      moveTo(cursor ? { openLane: lane, cursor } : null, { focus: true });
    },
    [input, moveTo]
  );

  const step = (delta: 1 | -1) => {
    const lane = stepWeek(data.lanes, navRef.current.openLane, delta) ?? fallbackLane;
    openLane(lane);
  };

  const goTo = React.useCallback(
    (key: string) => {
      const decision = pileRef.current.decisions.find((d) => d.key === key);
      if (!decision) return;
      moveTo({ openLane: decision.lane, cursor: decisionItemId(key) }, { focus: true });
    },
    [moveTo]
  );

  const pushedRef = React.useRef(false);

  /** A tap or click on a pile row: on a phone it opens the decision full screen. */
  const selectItem = React.useCallback(
    (item: PileItem) => {
      if (item.type === "lane") {
        openLane(item.lane);
        return;
      }
      const narrow = !paneMode();
      if (!narrow) {
        moveTo({ openLane: item.lane, cursor: item.id }, { focus: true });
        return;
      }
      guard(() => {
        const nextUrl = writeUrl({ d: dOf(item.id) }, navRef.current.url.d ? "replace" : "push");
        pushedRef.current = pushedRef.current || !navRef.current.url.d;
        setNav({ openLane: item.lane, cursor: item.id, url: nextUrl });
        window.scrollTo(0, 0);
      });
    },
    [guard, moveTo, openLane]
  );

  const closePhone = React.useCallback(() => {
    guard(() => {
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
        return;
      }
      const nextUrl = writeUrl({ d: null });
      setNav((n) => ({ ...n, url: nextUrl }));
    });
  }, [guard]);

  const wasPhoneOpen = React.useRef(phoneOpen);
  React.useEffect(() => {
    if (wasPhoneOpen.current && !phoneOpen) {
      document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(navRef.current.cursor)}"]`)?.focus();
    }
    if (!wasPhoneOpen.current && phoneOpen) {
      document.getElementById("todo-decision-title")?.focus();
    }
    wasPhoneOpen.current = phoneOpen;
  }, [phoneOpen]);

  const [busy, setBusy] = React.useState<string | null>(null);
  const busyRef = React.useRef<string | null>(null);
  const undoStack = React.useRef<string[]>([]);
  const undoLabel = singleKeys ? "Undo (U)" : "Undo (Ctrl+Z)";

  const titleOf = React.useCallback(
    (id: string) => data.events[id]?.title ?? data.submissions[id]?.title ?? "It",
    [data.events, data.submissions]
  );

  const undo = React.useCallback(
    async (decisionId?: string) => {
      const id = decisionId ?? undoStack.current[undoStack.current.length - 1];
      if (!id) {
        announce("Nothing to undo.");
        toast("Nothing to undo.");
        return;
      }
      if (busyRef.current) return;
      busyRef.current = "undo";
      setBusy("undo");
      undoStack.current = undoStack.current.filter((x) => x !== id);
      try {
        const result = await undoTodoDecision({ decisionId: id });
        toast(result.message);
        announce(result.message);
      } catch {
        toast("Undo failed. Try again.");
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [announce]
  );

  const showDone = React.useCallback(
    (text: string, decisionId: string | null) => {
      if (decisionId) {
        undoStack.current.push(decisionId);
        toast(text, { duration: 10000, action: { label: undoLabel, onClick: () => void undo(decisionId) } });
      } else {
        toast(text);
      }
    },
    [undo, undoLabel]
  );

  /** Lands the cursor after a decision: on a phone the next decision opens in place. */
  const landOn = React.useCallback(
    (id: string) => {
      const narrow = !paneMode();
      const prev = navRef.current;
      const item = pileRef.current.items.find((i) => i.id === id);
      const lane = item?.lane ?? prev.openLane;
      let nextUrl = prev.url;
      if (narrow && prev.url.d && dOf(id)) {
        nextUrl = writeUrl({ d: dOf(id) });
        window.scrollTo(0, 0);
      }
      setNav({ openLane: lane, cursor: id, url: nextUrl });
      const active = document.activeElement;
      const inScreen = !active || active === document.body || !!active.closest?.(".sm-screen");
      if (!narrow && inScreen) requestFocus(id);
    },
    [requestFocus]
  );

  const run = React.useCallback(
    async (
      decision: Decision,
      call: () => Promise<TodoActionResult>,
      describe: (result: Ok) => { text: string; spoken?: string; live?: string[]; keep?: boolean },
      options: { hide?: boolean } = {}
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = decision.key;
      setBusy(decision.key);
      const next = cursorAfterDecision(pileRef.current.items, navRef.current.cursor, decision.key);
      try {
        const result = await call();
        if (!result.ok) {
          toast.error(result.error);
          announce(result.error);
          return false;
        }
        const { text, spoken, live, keep } = describe(result);
        const hide = options.hide !== false && !keep;
        if (live?.length) markLive(live);
        if (hide) {
          setHidden((prev) => new Set(prev).add(decision.key));
          dirtyRef.current = null;
          setPendingLeave(null);
        }
        showDone(text, result.decisionId);
        announce(spoken ?? text);
        if (hide && next) landOn(next);
        return true;
      } catch (err) {
        console.error("[todo]", err);
        toast.error("Something went wrong. Try again.");
        return false;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [announce, landOn, markLive, showDone]
  );

  const weekOf = React.useCallback(
    (decision: Decision) => {
      const key = weekKeyOf(decision.lane);
      return rail.weeks.find((w) => w.key === key);
    },
    [rail.weeks]
  );

  const [confirm, setConfirm] = React.useState<{ decision: Decision; eventIds: string[] } | null>(null);
  const [reject, setReject] = React.useState<RejectRequest | null>(null);

  const api: TodoApi = {
    data,
    now,
    lanes: data.lanes,
    events: data.events,
    submissions: data.submissions,
    decisions: pile.decisions,
    busy,
    keysEnabled: keysEnabled && !confirm && !reject,
    singleKeys,
    isSplit: (key) => key.startsWith("single:") && !data.decisions.some((d) => d.key === key),
    confirmPublish: (decision, eventIds) => setConfirm({ decision, eventIds }),
    publish: (decision, eventIds, edits) =>
      run(
        decision,
        () => publishEvents({ decisionKey: decision.key, eventIds, edits }),
        (r) => {
          const text = publishMessage(r, titleOf);
          const week = r.changed.length ? weekLiveSentence(weekOf(decision), r.changed) : "";
          const keep = r.changed.length === 0 && r.alreadyThere.length === 0;
          return { text, spoken: week ? `${text} ${week}` : text, live: r.changed, keep };
        }
      ),
    rejectEvents: (decision, eventIds, reason, edits) =>
      run(
        decision,
        () => rejectEvents({ decisionKey: decision.key, eventIds, reason, edits }),
        (r) => ({ text: rejectMessage(r, titleOf, reason) })
      ),
    openReject: (request) => setReject(request),
    archive: (decision, eventIds) =>
      run(
        decision,
        () => archiveDecisionEvents({ decisionKey: decision.key, eventIds }),
        (r) => ({ text: archiveMessage(r.archived ?? [], titleOf) })
      ),
    keepOne: (decision, options: KeepOneOptions) =>
      run(
        decision,
        () => keepOneCopy({ decisionKey: decision.key, ...options }),
        (r) => {
          const text = keepMessage(titleOf(options.keepId), options.publish && r.changed.length > 0, r.archived?.length ?? 0, r.notified);
          const week = r.changed.length ? weekLiveSentence(weekOf(decision), r.changed) : "";
          return { text, spoken: week ? `${text} ${week}` : text, live: r.changed };
        }
      ),
    different: (decision) =>
      run(
        decision,
        () =>
          markDifferentEvents({
            decisionKey: decision.key,
            eventIds: decision.rows.filter((r) => r.type === "event").map((r) => r.id),
            title: decision.title,
          }),
        () => ({ text: "Marked as different events. They will not be paired again." })
      ),
    later: (decision, until) =>
      run(
        decision,
        () => snoozeDecision({ decisionKey: decision.key, until, title: decision.title }),
        () => ({ text: laterMessage(until, data.today) })
      ),
    publishSubmission: (decision, submissionId, draft) =>
      run(
        decision,
        () => publishSubmissionDecision({ decisionKey: decision.key, submissionId, draft }),
        (r) => ({
          text: publishMessage({ ...r, changed: [submissionId] }, titleOf),
          live: [submissionId],
        })
      ),
    rejectSubmission: (decision, submissionId, reason) =>
      run(
        decision,
        () => rejectSubmissionDecision({ decisionKey: decision.key, submissionId, reason }),
        (r) => ({ text: rejectMessage({ ...r, changed: [submissionId] }, titleOf, reason) })
      ),
    saveSubmissionPlace: (decision, submissionId, draft) =>
      run(
        decision,
        () => saveSubmissionPlace({ decisionKey: decision.key, submissionId, draft }),
        () => ({ text: `Saved the place of ${titleOf(submissionId)}.` }),
        { hide: false }
      ),
    saveEdits: (decision, eventId, edits: EventEditsInput, options) =>
      run(
        decision,
        () => saveEventEdits({ decisionKey: decision.key, eventId, edits }),
        () => ({ text: `Saved ${titleOf(eventId)}.` }),
        { hide: options?.decide === true }
      ),
    split: (decision) => {
      setSplit((prev) => new Set(prev).add(decision.key));
      const first = decision.rows.find((r) => r.type === "event");
      if (first) {
        const id = decisionItemId(`single:${first.id}`);
        requestAnimationFrame(() => landOn(id));
      }
      announce(`Split into ${decision.rows.length} decisions.`);
    },
    goTo,
    openLane,
    openEditor: (decision, rowId) => {
      const href = editorHref(decision, rowId);
      if (href) guard(() => router.push(href));
    },
    rememberUndo: (decisionId) => {
      undoStack.current.push(decisionId);
    },
    settle: (decision) => {
      const next = cursorAfterDecision(pileRef.current.items, navRef.current.cursor, decision.key);
      setHidden((prev) => new Set(prev).add(decision.key));
      if (next) landOn(next);
    },
    setDirty,
    pendingLeave: pendingLeave
      ? {
          save: () => {
            const dirty = dirtyRef.current;
            const go = pendingLeave.go;
            setPendingLeave(null);
            if (!dirty) return go();
            void dirty.save().then((ok) => {
              if (ok) {
                dirtyRef.current = null;
                go();
              }
            });
          },
          discard: () => {
            const go = pendingLeave.go;
            dirtyRef.current = null;
            setPendingLeave(null);
            go();
          },
          cancel: () => setPendingLeave(null),
        }
      : null,
    announce,
  };

  const dialogsOpen = !!confirm || !!reject;

  useShortcuts(
    {
      j: () => move(1),
      k: () => move(-1),
      "[": () => step(-1),
      "]": () => step(1),
    },
    { enabled: !dialogsOpen && !busy }
  );

  useShortcuts(
    {
      l: () => {
        if (!current) return;
        if (api.isSplit(current.key)) announce("Later sets aside the whole batch. Use it before treating the rows one by one.");
        else void api.later(current, "tomorrow");
      },
      "shift+l": () => {
        if (current && !api.isSplit(current.key)) void api.later(current, "next-monday");
      },
      u: () => void undo(),
      escape: () => {
        if (pendingLeave) setPendingLeave(null);
        else if (phoneOpen && !wide) closePhone();
      },
    },
    { enabled: keysEnabled && !dialogsOpen && !busy }
  );

  // E opens the editor, except as the second key of the shell's "g e" (go to Events). The shell
  // binds that sequence after this screen on a fresh load, so it would never see the "e".
  const editKeys = React.useRef({ enabled: false, current: null as Decision | null, gAt: 0 });
  React.useEffect(() => {
    editKeys.current.enabled = keysEnabled && !dialogsOpen && !busy && singleKeys;
    editKeys.current.current = current;
  });
  const openEditorRef = React.useRef(api.openEditor);
  React.useEffect(() => {
    openEditorRef.current = api.openEditor;
  });
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const keys = editKeys.current;
      const key = e.key.toLowerCase();
      const afterG = Date.now() - keys.gAt < SEQUENCE_MS;
      keys.gAt = key === "g" && !e.shiftKey ? Date.now() : 0;
      if (key !== "e" || e.shiftKey || afterG || !keys.enabled || !keys.current) return;
      if ((e.target as Element | null)?.closest?.("dialog[open]")) return;
      e.preventDefault();
      openEditorRef.current(keys.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!keysEnabled || dialogsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (isTypingTarget(e.target) || (e.target as Element | null)?.closest?.("dialog[open]")) return;
      e.preventDefault();
      void undo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [keysEnabled, dialogsOpen, undo]);

  const setParam = (key: "show" | "area", value: string | null) => {
    writeUrl({ [key]: value });
    if (key === "area") announce(value ? `Showing ${value} only.` : "Showing every area.");
  };

  return (
    <TodoContext.Provider value={api}>
      <Screen
        bottomBar={!phoneOpen}
        className="lg:[@media(min-height:600px)]:grid lg:[@media(min-height:600px)]:grid-cols-[296px_minmax(0,1fr)] lg:[@media(min-height:600px)]:grid-rows-[minmax(0,1fr)] xl:[@media(min-height:600px)]:grid-cols-[320px_minmax(0,1fr)_360px]"
      >
        <Pane
          label="Waiting on you"
          tone="fog"
          className={cn(
            "p-0 md:p-0 lg:[@media(min-height:600px)]:border-r lg:[@media(min-height:600px)]:border-seam",
            phoneOpen && "hidden lg:[@media(min-height:600px)]:block"
          )}
        >
          <Pile
            sections={pile.sections}
            items={pile.items}
            cursor={cursorItem?.id ?? null}
            scope={scope}
            area={area}
            onScope={(value) => setParam("show", value === "all" ? null : value)}
            onClearArea={() => setParam("area", null)}
            onSelect={selectItem}
            onMove={(delta) => move(delta)}
            onEdge={(edge) => {
              const items = pileRef.current.items;
              const target = edge === "first" ? items[0] : items[items.length - 1];
              if (target) moveTo({ openLane: target.type === "lane" ? navRef.current.openLane : target.lane, cursor: target.id }, { focus: true });
            }}
            focusRequest={focusRequest}
            doneToday={data.doneToday}
            snoozed={data.snoozed}
            onUndo={(id) => void undo(id)}
            busy={busy}
          />
        </Pane>
        <Pane label="Decision" className={cn("p-0 md:p-0", !phoneOpen && "hidden lg:[@media(min-height:600px)]:block")}>
          {(wide || phoneOpen) && cursorItem && (
            <DecisionArea
              item={cursorItem}
              onBack={closePhone}
              context={
                xl ? null : <ContextPane item={cursorItem} area={area} onArea={(value) => setParam("area", value)} folded />
              }
            />
          )}
        </Pane>
        <Pane label="That weekend on the site" className="hidden border-l border-seam xl:[@media(min-height:600px)]:block">
          {xl && cursorItem && <ContextPane item={cursorItem} area={area} onArea={(value) => setParam("area", value)} />}
        </Pane>
      </Screen>
      <PublishConfirm
        request={confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={async () => {
          const request = confirm;
          if (!request) return;
          setConfirm(null);
          await api.publish(request.decision, request.eventIds);
        }}
      />
      <RejectReasons request={reject} onClose={() => setReject(null)} />
    </TodoContext.Provider>
  );
}
