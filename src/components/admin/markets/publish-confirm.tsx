"use client";

import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import type { WaitingDate } from "@/lib/markets/board";

/** Above this many dates, publishing asks first and lists them. */
export const CONFIRM_OVER = 10;

/** "Publish 24 dates of Kendall Yards Night Market?" with every date it puts on the site. */
export function PublishConfirm({
  open,
  onOpenChange,
  marketName,
  dates,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketName: string;
  dates: readonly WaitingDate[];
  onConfirm: () => void;
}) {
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="list"
      title={`Publish ${dates.length} dates of ${marketName}?`}
      footer={
        <>
          <AdminButton variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="publish"
            data-autofocus
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Publish {dates.length}
          </AdminButton>
        </>
      }
    >
      <ul className="divide-y divide-seam text-sm">
        {dates.map((w) => (
          <li key={w.id} className="flex justify-between gap-4 py-1.5">
            <span className="min-w-0 text-basalt">{w.title}</span>
            <span className="shrink-0 text-ash tabular-nums">{w.day}</span>
          </li>
        ))}
      </ul>
    </AdminDialog>
  );
}
