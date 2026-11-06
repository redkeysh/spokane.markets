"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useLeaveGuard } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useShell, type LeaveTarget } from "@/components/admin/shell/shell-context";
import { marketSlugFrom, type MarketDetails } from "@/lib/markets/details";
import { saveMarketDetails } from "@/app/admin/_actions/markets";
import { DetailsActionBar, MarketDetailsForm, countChanges, type DetailErrors, type DetailsOptions } from "./market-details";

/**
 * A new market: every detail group open, owner and vendor settings included. Creating it opens
 * the market page, where its dates are added.
 */
export function NewMarket({ initial, options, ownerDisplay }: { initial: MarketDetails; options: DetailsOptions; ownerDisplay?: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const { leave, navigate } = useShell();
  const [values, setValues] = React.useState(initial);
  const [leaveTo, setLeaveTo] = React.useState<LeaveTarget | null>(null);
  const [errors, setErrors] = React.useState<DetailErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(initial.slug !== "" && initial.slug !== marketSlugFrom(initial.name));

  const changes = countChanges(initial, values);
  useLeaveGuard(changes > 0, setLeaveTo, "/admin/markets");
  useShortcuts({
    escape: (event) => {
      if ((event.target as Element | null)?.closest?.("[role=dialog], [role=listbox], [role=menu]")) return;
      if (leaveTo) setLeaveTo(null);
      else navigate("/admin/markets");
    },
  });

  const create = async () => {
    setSaving(true);
    try {
      const result = await saveMarketDetails({ id: null, values });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setLeaveTo(null);
        toast(result.error);
        announce(result.error);
        return;
      }
      toast(result.message);
      announce(result.message);
      setLeaveTo(null);
      if (leaveTo?.kind === "href") leave(leaveTo);
      else if (result.marketId) router.replace(`/admin/markets/${result.marketId}?add=1`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen bottomBar={false} className="grid grid-rows-[minmax(0,1fr)_auto]">
      <Pane label="New market" className="lg:px-6">
        <div className="mx-auto max-w-[1184px] space-y-6 pb-10">
          <PageHeader
            title="New market"
            back={{ href: "/admin/markets", label: "Back to Markets" }}
            description="Name it and pick its home place. Its dates are added on the market's page once it exists."
          />
          <MarketDetailsForm
            values={values}
            onChange={(patch) => {
              if ("slug" in patch) setSlugTouched(true);
              setValues((v) => {
                const next = { ...v, ...patch };
                if ("name" in patch && !slugTouched && !("slug" in patch)) next.slug = marketSlugFrom(next.name);
                return next;
              });
            }}
            errors={errors}
            options={options}
            ownerDisplay={ownerDisplay}
            allOpen
            verificationLine={<p className="text-sm text-ash">New markets start as not verified. Verify it from its page once it exists.</p>}
          />
        </div>
      </Pane>
      <DetailsActionBar
        changes={changes}
        saving={saving}
        onSave={create}
        saveLabel="Publish market"
        saveVariant="publish"
        canSave
        leaving={leaveTo !== null}
        onLeave={() => leaveTo && leave(leaveTo)}
        onStay={() => setLeaveTo(null)}
        onCancel={() => navigate("/admin/markets")}
        status={values.name.trim() && values.venueId ? "Not on the site until you publish it." : "A name and a home place are required"}
      />
    </Screen>
  );
}
