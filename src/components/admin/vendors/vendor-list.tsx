"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { VerificationStatus } from "@prisma/client";
import { AdminButton } from "@/components/admin/kit/button";
import { List } from "@/components/admin/kit/list";
import { Menu } from "@/components/admin/kit/menu";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { archiveVendor, restoreVendor } from "@/app/admin/_actions/vendors";
import { settle } from "@/lib/admin/settle";
import { eventsAtLabel, vendorPageHref, verificationMarkStatus } from "@/lib/vendors/admin-list";
import { cn } from "@/lib/utils";

export type VendorRowData = {
  id: string;
  businessName: string;
  slug: string;
  specialties: string | null;
  verificationStatus: VerificationStatus;
  owner: { id: string; name: string | null; email: string } | null;
  eventsCount: number;
  archived: boolean;
};

/**
 * Below 768 px a row is the name over one meta line. From 768 to 1279 px the specialties sit
 * under the name and the other cells span both lines; from 1280 px they get a column of their own.
 */
const COLUMNS = cn(
  "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,11rem)_6.5rem_5.5rem] md:items-center md:gap-x-4",
  "xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,11rem)_minmax(0,12rem)_6.5rem_5.5rem]"
);
const SPAN = "md:row-span-2 md:row-start-1 xl:row-span-1";

/** Lets the kit tooltip's trigger span fill a cell, so the text inside it can truncate. */
const TOOLTIP_CELL = "[&>span]:flex [&>span]:w-full";

/**
 * Text lifted above the row link so its tooltip opens on hover. A click on it still opens the
 * row, unless it lands on a link of its own.
 */
function TruncatedCell({
  tip,
  rowLink,
  children,
}: {
  tip: string;
  rowLink: React.RefObject<HTMLAnchorElement | null>;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={tip} placement="bottom-start" className="max-w-96">
      <span
        className="relative z-[1] block w-full min-w-0 cursor-pointer truncate"
        onClick={(e) => {
          if ((e.target as Element).closest("a")) return;
          rowLink.current?.click();
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}

function ownerName(owner: NonNullable<VendorRowData["owner"]>) {
  return owner.name?.trim() || owner.email;
}

function ownerTip(owner: NonNullable<VendorRowData["owner"]>) {
  const name = owner.name?.trim();
  return name ? `Claimed by ${name}, ${owner.email}` : `Claimed by ${owner.email}`;
}

function VendorRow({ row, back }: { row: VendorRowData; back: string }) {
  const announce = useAnnounce();
  const link = React.useRef<HTMLAnchorElement>(null);
  const [busy, setBusy] = React.useState(false);
  const ids = React.useId();
  const cell = (name: string) => `${ids}-${name}`;
  const specialties = row.specialties?.trim() || null;
  const href = vendorPageHref(row.id, back);

  const restore = async () => {
    setBusy(true);
    const result = await settle(restoreVendor(row.id));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Restored ${result.businessName}. It is back on the site.`);
    announce(`Restored ${result.businessName}.`);
  };

  const archive = async () => {
    const result = await settle(archiveVendor(row.id));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    announce(`Archived ${result.businessName}.`);
    toastWithUndo(`Archived ${result.businessName}. It is off the site.`, async () => {
      const undone = await settle(restoreVendor(row.id));
      if (undone.ok) announce(`Restored ${undone.businessName}.`);
      else toast.error(undone.error);
    });
  };

  return (
    <li
      className={cn(
        "sm-row border-b border-seam px-4 py-2.5 md:min-h-11 md:py-1.5",
        row.archived ? "bg-sheet text-ash-quiet hover:bg-hover" : "bg-sheet hover:bg-hover",
        COLUMNS
      )}
    >
      <div className={cn("min-w-0 md:col-start-1 md:row-start-1", row.archived ? "pr-24 md:pr-0" : "pr-10 md:pr-0")}>
        <Link
          ref={link}
          href={href}
          data-roving-item
          data-row-key={row.id}
          aria-describedby={[cell("specialties"), cell("verification"), cell("owner"), cell("events"), row.archived ? cell("archived") : null]
            .filter(Boolean)
            .join(" ")}
          className={cn("sm-row-link block min-w-0 text-sm font-medium", row.archived ? "text-ash-quiet" : "text-basalt")}
        >
          {row.businessName}
        </Link>
        {row.archived && (
          <span id={cell("archived")} className="sr-only">
            Archived.
          </span>
        )}
      </div>

      <div
        id={cell("specialties")}
        className={cn(
          "min-w-0 text-xs text-ash max-md:hidden md:col-start-1 md:row-start-2 xl:col-start-2 xl:row-start-1 xl:text-sm",
          TOOLTIP_CELL,
          row.archived && "text-ash-quiet"
        )}
      >
        {specialties ? (
          <TruncatedCell tip={specialties} rowLink={link}>
            {specialties}
          </TruncatedCell>
        ) : (
          <span className="text-ash-quiet">No specialties</span>
        )}
      </div>

      <div className={cn("mt-0.5 flex min-w-0 items-center gap-x-3 text-xs whitespace-nowrap md:contents", row.archived ? "pr-24" : "pr-10")}>
        <span id={cell("verification")} className={cn("shrink-0 md:col-start-2 md:min-w-0 md:truncate xl:col-start-3", SPAN)}>
          <StatusMark
            status={verificationMarkStatus(row.verificationStatus)}
            className={cn("text-xs md:text-sm", row.archived && "text-ash-quiet")}
          />
        </span>
        <span
          id={cell("owner")}
          className={cn("min-w-0 text-ash md:col-start-3 md:text-sm xl:col-start-4", TOOLTIP_CELL, row.archived && "text-ash-quiet", SPAN)}
        >
          {row.owner ? (
            <TruncatedCell tip={ownerTip(row.owner)} rowLink={link}>
              Claimed by{" "}
              <Link href={`/admin/users/${row.owner.id}`} data-row-action className="rounded-sm text-lilac underline-offset-4 hover:underline">
                {ownerName(row.owner)}
              </Link>
            </TruncatedCell>
          ) : (
            <span className="block truncate">Not claimed</span>
          )}
        </span>
        <span
          id={cell("events")}
          className={cn("shrink-0 text-ash tabular-nums md:col-start-4 md:text-right md:text-sm xl:col-start-5", row.archived && "text-ash-quiet", SPAN)}
        >
          {eventsAtLabel(row.eventsCount)}
        </span>
      </div>

      <div data-row-action className={cn("absolute top-2 right-2 md:static md:col-start-5 md:flex md:justify-end xl:col-start-6", SPAN)}>
        {row.archived ? (
          <AdminButton variant="outline" size="sm" onClick={restore} busy={busy} busyLabel="Restoring">
            Restore
          </AdminButton>
        ) : (
          <Menu
            label={`More actions for ${row.businessName}`}
            items={[
              { label: "Open", href },
              { label: "View on site", href: `/vendors/${row.slug}`, external: true },
              { label: "Archive", description: "Off the site and out of this list. Can be restored.", onSelect: archive },
            ]}
          />
        )}
      </div>
    </li>
  );
}

/**
 * The vendor rows: name, specialties, verification in words, who claimed it, and how many events.
 * `back` is the list address with its filters, carried to each vendor page for its Back link.
 */
export function VendorList({ rows, back }: { rows: VendorRowData[]; back: string }) {
  return (
    <List label="Vendors" className="bg-sheet">
      {rows.map((row) => (
        <VendorRow key={row.id} row={row} back={back} />
      ))}
    </List>
  );
}
