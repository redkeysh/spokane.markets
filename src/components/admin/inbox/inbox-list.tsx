"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { BulkBar } from "@/components/admin/kit/bulk-bar";
import { List } from "@/components/admin/kit/list";
import { decidePublicItems } from "@/app/admin/_actions/inbox";
import { inboxItemHref, type InboxType } from "@/lib/admin/inbox/model";
import type { InboxActionResult, InboxItem } from "@/lib/admin/inbox/types";
import { InboxRow } from "./inbox-row";
import type { ItemAction } from "./item-actions";
import { RejectDialog } from "./reject-dialog";
import { itemTitle } from "./titles";
import { useInboxAction } from "./use-inbox-action";

type Bulk = { id: string; label: (n: number) => string; variant: "publish" | "ink" | "outline" | "danger-outline"; run?: (ids: string[]) => Promise<InboxActionResult> };

/** The bulk actions of a type's waiting items, filled one first. Types without them have no ticks. */
const BULK: Partial<Record<InboxType, Bulk[]>> = {
  reviews: [
    { id: "approve", label: (n) => `Approve ${n}`, variant: "publish", run: (ids) => decidePublicItems({ kind: "review", ids, to: "APPROVED" }) },
    { id: "reject", label: (n) => `Reject ${n}`, variant: "danger-outline", run: (ids) => decidePublicItems({ kind: "review", ids, to: "REJECTED" }) },
  ],
  reports: [
    { id: "resolve", label: (n) => `Mark ${n} resolved`, variant: "ink", run: (ids) => decidePublicItems({ kind: "report", ids, to: "RESOLVED" }) },
    { id: "dismiss", label: (n) => `Dismiss ${n}`, variant: "danger-outline", run: (ids) => decidePublicItems({ kind: "report", ids, to: "DISMISSED" }) },
  ],
  messages: [
    { id: "read", label: (n) => `Mark ${n} read`, variant: "ink", run: (ids) => decidePublicItems({ kind: "message", ids, to: "READ" }) },
    { id: "archive", label: (n) => `Archive ${n}`, variant: "outline", run: (ids) => decidePublicItems({ kind: "message", ids, to: "ARCHIVED" }) },
  ],
  submissions: [{ id: "reject", label: (n) => `Reject ${n}`, variant: "danger-outline" }],
};

/** Where a row opens, with the way back here: a submission's record, else the item on its own. */
export function rowHref(type: InboxType, item: InboxItem, back: string): string {
  if (item.kind === "submission") return `/admin/submissions/${item.id}?from=inbox&back=${encodeURIComponent(back)}`;
  return inboxItemHref(type, item.id, back);
}

/**
 * A list of one type's items with roving focus. Waiting items of reviews, reports, messages and
 * submissions can be ticked for one bulk decision (Space ticks, Escape clears); submissions are
 * rejected with one reason for all.
 */
export function InboxList({
  type,
  items,
  back,
  label,
  bulk: withBulk = true,
}: {
  type: InboxType;
  items: InboxItem[];
  back: string;
  label: string;
  /** False leaves out the ticks and the bulk bar (the Everything view). */
  bulk?: boolean;
}) {
  const { run, busy } = useInboxAction();
  const [ticked, setTicked] = React.useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = React.useState(false);
  const bulk = withBulk ? BULK[type] : undefined;
  const waiting = new Set(items.filter((i) => "status" in i && i.status === "PENDING").map((i) => i.id));
  const tickedIds = [...ticked].filter((id) => waiting.has(id));

  const [seen, setSeen] = React.useState(items);
  if (seen !== items) {
    setSeen(items);
    setTicked((prev) => new Set([...prev].filter((id) => items.some((i) => i.id === id && "status" in i && i.status === "PENDING"))));
  }

  const toggle = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const perform = (item: InboxItem) => (action: ItemAction) => {
    if (action.run) void run(`${item.id}:${action.id}`, action.run, action.then);
  };

  const runBulk = async (action: Bulk) => {
    if (!action.run) {
      setRejecting(true);
      return;
    }
    const done = await run(`bulk:${action.id}`, () => action.run!(tickedIds));
    if (done) setTicked(new Set());
  };

  return (
    <>
      <List
        label={label}
        onTick={bulk ? (key) => waiting.has(key) && toggle(key, !ticked.has(key)) : undefined}
        onClearTicks={() => setTicked(new Set())}
      >
        {items.map((item) => {
          const canTick = !!bulk && waiting.has(item.id);
          return (
            <InboxRow
              key={item.id}
              item={item}
              href={rowHref(type, item, back)}
              ticked={canTick ? ticked.has(item.id) : undefined}
              onTickedChange={canTick ? (on) => toggle(item.id, on) : undefined}
              perform={perform(item)}
              busy={busy}
              reserveTick={!!bulk && waiting.size > 0}
            />
          );
        })}
      </List>
      {bulk && (
        <BulkBar count={tickedIds.length} onClear={() => setTicked(new Set())}>
          {bulk.map((action) => (
            <AdminButton
              key={action.id}
              size="sm"
              variant={action.variant}
              disabled={busy !== null}
              busy={busy === `bulk:${action.id}`}
              busyLabel="Saving"
              onClick={() => void runBulk(action)}
            >
              {action.run ? action.label(tickedIds.length) : `${action.label(tickedIds.length)}…`}
            </AdminButton>
          ))}
        </BulkBar>
      )}
      {type === "submissions" && (
        <RejectDialog
          open={rejecting}
          busy={busy === "bulk:reject"}
          titles={items.filter((i) => tickedIds.includes(i.id)).map(itemTitle)}
          onClose={() => setRejecting(false)}
          onReject={(reason) =>
            void run("bulk:reject", () => decidePublicItems({ kind: "submission", ids: tickedIds, to: "REJECTED", reason })).then((done) => {
              if (!done) return;
              setRejecting(false);
              setTicked(new Set());
            })
          }
        />
      )}
    </>
  );
}
