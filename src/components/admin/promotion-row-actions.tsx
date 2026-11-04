"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePromotion } from "@/app/admin/actions";
import { isNextControlFlowError } from "@/lib/api-client";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useAnnounce } from "@/components/admin/shell/live-region";

/** The row menu of a featured entry: edit it, see it on the site, or take it off the homepage. */
export function PromotionRowActions({
  id,
  title,
  publicHref,
}: {
  id: string;
  title: string;
  publicHref: string | null;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const items: MenuItem[] = [
    { label: "Edit", href: `/admin/promotions/${id}/edit` },
    ...(publicHref ? [{ label: "View on site", href: publicHref, external: true }] : []),
    { label: "Remove from the homepage", danger: true, onSelect: () => setConfirming(true) },
  ];

  return (
    <>
      <Menu items={items} label={`More actions for ${title}`} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${title} from the homepage?`}
        description="It leaves the homepage carousel. The listing itself stays as it is."
        confirmLabel="Remove"
        variant="destructive"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            try {
              await deletePromotion(id);
              setConfirming(false);
              const message = `Removed ${title} from the homepage.`;
              toast.success(message);
              announce(message);
              router.refresh();
            } catch (err) {
              if (isNextControlFlowError(err)) throw err;
              toast.error("Could not remove it. Try again.");
            }
          })
        }
      />
    </>
  );
}
