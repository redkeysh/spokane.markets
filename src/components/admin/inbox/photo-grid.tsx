"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/kit/button";
import { BulkBar } from "@/components/admin/kit/bulk-bar";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { decidePublicItems } from "@/app/admin/_actions/inbox";
import { inboxItemHref } from "@/lib/admin/inbox/model";
import type { InboxPhoto } from "@/lib/admin/inbox/types";
import { itemActions, type ItemAction } from "./item-actions";
import { PublicStatus } from "./item-parts";
import { itemTitle } from "./titles";
import { useInboxAction } from "./use-inbox-action";

/**
 * Photos as a grid: each with what it is for, who sent it and its status. A waiting photo can be
 * ticked; the bulk bar shows or rejects the ticked ones. "Use as the event picture" sits on each
 * event photo that is not its event's picture yet.
 */
export function PhotoGrid({ photos, back, tickable = true }: { photos: InboxPhoto[]; back: string; tickable?: boolean }) {
  const { run, busy } = useInboxAction();
  const [ticked, setTicked] = React.useState<ReadonlySet<string>>(new Set());
  const waiting = new Set(photos.filter((p) => p.status === "PENDING").map((p) => p.id));
  const tickedIds = [...ticked].filter((id) => waiting.has(id));

  const [seen, setSeen] = React.useState(photos);
  if (seen !== photos) {
    setSeen(photos);
    setTicked((prev) => new Set([...prev].filter((id) => photos.some((p) => p.id === id && p.status === "PENDING"))));
  }

  const toggle = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const perform = (photo: InboxPhoto, action: ItemAction) => {
    if (action.run) void run(`${photo.id}:${action.id}`, action.run, action.then);
  };

  const bulk = async (to: "APPROVED" | "REJECTED") => {
    const done = await run(`bulk:${to}`, () => decidePublicItems({ kind: "photo", ids: tickedIds, to }));
    if (done) setTicked(new Set());
  };

  return (
    <>
      <ul
        role="list"
        aria-label="Photos"
        className={cn(
          "grid gap-x-4 gap-y-6",
          tickable ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6"
        )}
      >
        {photos.map((photo) => {
          const title = itemTitle(photo);
          const actions = itemActions(photo);
          const picture = actions.more.find((a) => a.id === "picture");
          const menu: MenuItem[] = [actions.primary, actions.reject, ...actions.more.filter((a) => a.id !== "picture")]
            .filter((a): a is ItemAction => !!a)
            .map((a) => ({ label: a.label, onSelect: () => perform(photo, a), danger: a.variant === "danger-outline" }));
          const isTicked = ticked.has(photo.id);
          return (
            <li key={photo.id} className="min-w-0">
              <div className={cn("relative overflow-hidden rounded-sm border bg-fog", isTicked ? "border-lilac outline-2 outline-lilac" : "border-seam")}>
                <Link href={inboxItemHref("photos", photo.id, back)} aria-label={`${title}, sent by ${photo.uploader.name}`} className="block">
                  <Image
                    src={photo.url}
                    alt={photo.alt ?? title}
                    width={320}
                    height={240}
                    unoptimized
                    className="aspect-[4/3] h-auto w-full object-cover"
                  />
                </Link>
                {tickable && waiting.has(photo.id) && (
                  <label className="absolute top-1.5 left-1.5 flex size-8 cursor-pointer items-center justify-center rounded-sm bg-sheet/90">
                    <input
                      type="checkbox"
                      checked={isTicked}
                      onChange={(e) => toggle(photo.id, e.target.checked)}
                      aria-label={`Tick ${title}`}
                      className="size-4 cursor-pointer rounded-sm accent-basalt"
                    />
                  </label>
                )}
              </div>
              <div className="mt-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-basalt">{photo.target?.title ?? "A listing that is gone"}</p>
                  <p className="text-xs text-ash">
                    {photo.uploader.name}, <span className="tabular-nums">{photo.sentLabel}</span>
                  </p>
                  <PublicStatus kind="photo" status={photo.status} className="mt-1" />
                  {photo.isEventPicture && <p className="text-xs text-ash">The event picture</p>}
                </div>
                {menu.length > 0 && <Menu label={`More for ${title}`} items={menu} />}
              </div>
              {picture && (
                <AdminButton
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={busy !== null}
                  busy={busy === `${photo.id}:picture`}
                  busyLabel="Saving"
                  onClick={() => perform(photo, picture)}
                >
                  Use as the event picture
                </AdminButton>
              )}
            </li>
          );
        })}
      </ul>
      <BulkBar count={tickedIds.length} onClear={() => setTicked(new Set())} className="mt-4">
        <AdminButton size="sm" variant="publish" disabled={busy !== null} busy={busy === "bulk:APPROVED"} busyLabel="Showing" onClick={() => void bulk("APPROVED")}>
          Show {tickedIds.length}
        </AdminButton>
        <AdminButton size="sm" variant="danger-outline" disabled={busy !== null} busy={busy === "bulk:REJECTED"} busyLabel="Rejecting" onClick={() => void bulk("REJECTED")}>
          Reject {tickedIds.length}
        </AdminButton>
      </BulkBar>
    </>
  );
}
