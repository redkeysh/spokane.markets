"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { TodoEvent, TodoLink } from "./types";

/** Label and value rows: the label in an 88 px column beside the value, stacked on phones. */
export function FieldList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("sm:grid sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-3", className)}>{children}</dl>;
}

export function Field({
  label,
  children,
  action,
  className,
}: {
  label: string;
  children: React.ReactNode;
  /** One small control at the end of the row ("Split into daily hours", "Edit"). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 sm:contents", className)}>
      <dt className="text-sm font-medium text-ash">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 text-sm text-basalt sm:mt-0">
        <div className="min-w-0 max-w-[72ch] flex-1 basis-56">{children}</div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </dd>
    </div>
  );
}

const ABOUT_SHORT = 420;

/** A description cut at about 420 characters with "Show all", kept to the 72 character measure. */
export function About({ text }: { text: string | null }) {
  const [open, setOpen] = React.useState(false);
  const body = text?.trim();
  if (!body) return <span className="text-ash">No description</span>;
  const long = body.length > ABOUT_SHORT;
  return (
    <div>
      <p className="whitespace-pre-line">{long && !open ? `${body.slice(0, ABOUT_SHORT).trimEnd()}…` : body}</p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-ml-1 mt-1 inline-flex h-6 items-center rounded-sm px-1 text-xs font-medium text-lilac hover:bg-hover"
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

export function Links({ links }: { links: TodoLink[] }) {
  if (links.length === 0) return <span className="text-ash">None</span>;
  return (
    <ul role="list" className="space-y-0.5">
      {links.map((link) => (
        <li key={link.href} className="min-w-0 [overflow-wrap:anywhere]">
          <a href={link.href} target="_blank" rel="noreferrer" className="text-lilac underline-offset-2 hover:underline">
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Names({ names }: { names: string[] }) {
  return names.length ? <span>{names.join(", ")}</span> : <span className="text-ash">None</span>;
}

/** A small picture, or what is wrong with the link. */
export function Picture({ url, isPage }: { url: string | null; isPage: boolean }) {
  if (!url?.trim()) return <span className="text-ash">None</span>;
  if (isPage) return <span>This link is a web page, not a picture.</span>;
  return (
    <span className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary link */}
      <img src={url} alt="" className="h-16 w-24 shrink-0 rounded-sm border border-seam object-cover" />
      <span className="min-w-0 text-xs text-ash [overflow-wrap:anywhere]">{url.replace(/^https?:\/\//, "")}</span>
    </span>
  );
}

export function placeLine(event: TodoEvent): string {
  const v = event.venue;
  const address = [v.address, v.city, [v.state, v.zip].filter(Boolean).join(" ")].filter((p) => p.trim()).join(", ");
  return `${v.name}${address ? `, ${address}` : ""}${v.archived ? " (archived)" : ""}`;
}

/**
 * What the public will see of an event: When, Where, About, Tags, Has, Picture, Links. `slots`
 * replace a value with an editor; `actions` add one control to a row.
 */
export function EventFields({
  event,
  slots = {},
  actions = {},
}: {
  event: TodoEvent;
  slots?: Partial<Record<"when" | "where" | "tags" | "has" | "picture", React.ReactNode>>;
  actions?: Partial<Record<"when" | "where" | "tags" | "has" | "picture", React.ReactNode>>;
}) {
  return (
    <FieldList>
      <Field label="When" action={actions.when}>
        {slots.when ?? (
          <ul role="list" className="tabular-nums">
            {event.when.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Where" action={actions.where}>
        {placeLine(event)}
        {event.marketName && <span className="block text-xs text-ash">Part of {event.marketName}</span>}
        {slots.where && <div className="mt-2">{slots.where}</div>}
      </Field>
      <Field label="About">
        <About text={event.description} />
        {event.importerNote && <span className="mt-1 block text-xs text-ash">Reads like an importer note.</span>}
      </Field>
      <Field label="Tags" action={actions.tags}>
        {slots.tags ?? <Names names={event.tags.map((t) => t.name)} />}
      </Field>
      <Field label="Has" action={actions.has}>
        {slots.has ?? <Names names={event.features.map((f) => f.name)} />}
      </Field>
      <Field label="Picture" action={actions.picture}>
        {slots.picture ?? <Picture url={event.imageUrl} isPage={event.pictureIsPage} />}
      </Field>
      <Field label="Links">
        <Links links={event.links} />
      </Field>
    </FieldList>
  );
}
