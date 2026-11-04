"use client";

import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { ListRow } from "@/components/admin/kit/list";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { APPLICATION_FORM_WORDS, SEVERITY_WORDS, starsText } from "@/lib/admin/inbox/words";
import type { InboxItem } from "@/lib/admin/inbox/types";
import { itemActions, type ItemAction } from "./item-actions";
import { PublicStatus } from "./item-parts";
import { itemExcerpt, itemTitle } from "./titles";

/** The facts line under a row's title. */
export function rowFacts(item: InboxItem): string {
  switch (item.kind) {
    case "review":
      return `${starsText(item.rating)}, by ${item.author.name}, ${item.sentLabel}`;
    case "report":
      return `${item.reason}, ${(SEVERITY_WORDS[item.severity] ?? item.severity).toLowerCase()} severity, ${item.reporter ? `from ${item.reporter}, ` : ""}${item.sentLabel}`;
    case "application":
      return `${APPLICATION_FORM_WORDS[item.formType] ?? item.formTitle}, ${item.email}, ${item.sentLabel}`;
    case "message":
      return `From ${item.name}, ${item.email}, ${item.sentLabel}`;
    case "submission":
      return `${item.when}${item.place ? `, ${item.place}` : ""}. Sent by ${item.submitter.name}, ${item.sentLabel}`;
    case "photo":
      return `Sent by ${item.uploader.name}, ${item.sentLabel}`;
    case "survey":
      return item.sentLabel;
  }
}

function menuItem(action: ItemAction, perform: (action: ItemAction) => void): MenuItem {
  return action.href
    ? { label: action.label, href: action.href, external: action.external }
    : { label: action.label, onSelect: () => perform(action), danger: action.variant === "danger-outline" };
}

/**
 * One item in a list: the title opens it on its own (a submission opens its record), the facts
 * and the opening words below, the status, and at most one inline action (the next step for a
 * waiting item) with everything else in the row menu.
 */
export function InboxRow({
  item,
  href,
  ticked,
  onTickedChange,
  perform,
  busy,
  reserveTick = false,
}: {
  item: InboxItem;
  href: string;
  ticked?: boolean;
  onTickedChange?: (ticked: boolean) => void;
  perform: (action: ItemAction) => void;
  busy: string | null;
  /** Keeps the tick column's width on a row that cannot be ticked, so titles line up. */
  reserveTick?: boolean;
}) {
  const title = itemTitle(item);
  const words = itemExcerpt(item);
  const actions = item.kind === "survey" ? null : item.kind === "submission" ? null : itemActions(item);
  const inline = actions?.primary ?? null;
  const rest = [...(actions?.reject ? [actions.reject] : []), ...(actions?.more ?? [])];
  const status = item.kind === "survey" ? null : (
    <PublicStatus kind={item.kind} status={item.status} live={item.kind === "submission" ? !!item.event?.live : false} />
  );

  return (
    <ListRow
      rowKey={item.id}
      href={href}
      title={title}
      meta={
        <>
          <span className="block tabular-nums">{rowFacts(item)}</span>
          {words && <span className="mt-0.5 line-clamp-2 block max-w-[72ch] text-sm text-basalt">{words}</span>}
        </>
      }
      status={status}
      leaf={reserveTick && !onTickedChange ? <span aria-hidden="true" className="size-6 shrink-0" /> : undefined}
      ticked={ticked}
      onTickedChange={onTickedChange}
      action={
        inline || rest.length ? (
          <div className="flex items-center gap-1">
            {inline &&
              (inline.href ? (
                <AdminLinkButton href={inline.href} variant="outline" size="sm" className="hidden sm:inline-flex">
                  {inline.label}
                </AdminLinkButton>
              ) : (
                <AdminButton
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex"
                  disabled={busy !== null}
                  busy={busy === `${item.id}:${inline.id}`}
                  busyLabel={inline.busyLabel}
                  onClick={() => perform(inline)}
                >
                  {inline.label}
                </AdminButton>
              ))}
            <Menu label={`More for ${title}`} items={[...(inline ? [inline] : []), ...rest].map((a) => menuItem(a, perform))} />
          </div>
        ) : undefined
      }
    />
  );
}
