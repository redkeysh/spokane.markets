"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { mergeDuplicateVenues } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

export type DuplicateVenueRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  events: number;
  markets: number;
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function VenueDuplicateGroup({ venues }: { venues: DuplicateVenueRow[] }) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(venues[0].id);
  const [mergeIds, setMergeIds] = useState(() => venues.slice(1).map((v) => v.id));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const keep = venues.find((v) => v.id === keepId) ?? venues[0];
  const selected = venues.filter((v) => v.id !== keep.id && mergeIds.includes(v.id));
  const eventsMoving = selected.reduce((n, v) => n + v.events, 0);
  const marketsMoving = selected.reduce((n, v) => n + v.markets, 0);

  function chooseKeep(id: string) {
    setKeepId(id);
    setMergeIds(venues.filter((v) => v.id !== id).map((v) => v.id));
  }

  function toggleMerge(id: string) {
    setMergeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function merge() {
    startTransition(async () => {
      try {
        const result = await mergeDuplicateVenues(keep.id, selected.map((v) => v.id));
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `Merged into ${keep.name}. Moved ${plural(result.eventsMoved, "event")} and ${plural(result.marketsMoved, "market")}.`
        );
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Merge failed.");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-16 p-3">Keep</th>
              <th className="w-16 p-3">Merge</th>
              <th className="p-3">Name</th>
              <th className="p-3">Address</th>
              <th className="w-20 p-3 text-right">Events</th>
              <th className="w-20 p-3 text-right">Markets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {venues.map((v) => {
              const isKeep = v.id === keep.id;
              return (
                <tr key={v.id} className={cn(isKeep && "bg-primary/5")}>
                  <td className="p-3">
                    <input
                      type="radio"
                      name={`keep-${venues[0].id}`}
                      checked={isKeep}
                      onChange={() => chooseKeep(v.id)}
                      aria-label={`Keep ${v.name}`}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      disabled={isKeep}
                      checked={!isKeep && mergeIds.includes(v.id)}
                      onChange={() => toggleMerge(v.id)}
                      aria-label={`Merge ${v.name}`}
                    />
                  </td>
                  <td className="p-3 font-medium">
                    <Link href={`/admin/venues/${v.id}/edit`} className="hover:underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {v.address}, {v.city}, {v.state} {v.zip}
                  </td>
                  <td className="p-3 text-right tabular-nums">{v.events}</td>
                  <td className="p-3 text-right tabular-nums">{v.markets}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
        <p className="text-sm text-muted-foreground">
          {selected.length === 0
            ? "Check the venues to merge into the one you keep."
            : `Moves ${plural(eventsMoving, "event")} and ${plural(marketsMoving, "market")} to ${keep.name}, then archives ${plural(selected.length, "duplicate")}.`}
        </p>
        <Button
          size="sm"
          disabled={selected.length === 0 || pending}
          onClick={() => setConfirmOpen(true)}
        >
          Merge selected
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Merge into ${keep.name}?`}
        description={`${selected.map((v) => v.name).join(", ")} will be archived, not deleted. Their ${plural(eventsMoving, "event")} and ${plural(marketsMoving, "market")} will point to ${keep.name}.`}
        confirmLabel="Merge venues"
        pending={pending}
        onConfirm={merge}
      />
    </section>
  );
}
