"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useAnnounce } from "@/components/admin/shell/live-region";

/** The row menu of a past graphic: make another like it, or delete it from the list. */
export function RenderActions({ renderId, name }: { renderId: string; name: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const items: MenuItem[] = [
    { label: "Make another like this", href: `/admin/marketing/asset-studio/new?duplicateRenderId=${renderId}` },
    { label: "Delete", danger: true, onSelect: () => setConfirming(true) },
  ];

  async function onDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/renders/${renderId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Could not delete it.");
      }
      setConfirming(false);
      const message = `Deleted the ${name} graphic.`;
      toast.success(message);
      announce(message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Menu items={items} label={`More actions for the ${name} graphic`} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this graphic?"
        description="It leaves Past graphics and can no longer be downloaded here."
        confirmLabel="Delete"
        variant="destructive"
        pending={busy}
        onConfirm={onDelete}
      />
    </>
  );
}
