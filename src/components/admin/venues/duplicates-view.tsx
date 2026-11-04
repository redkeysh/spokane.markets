"use client";

import * as React from "react";
import { Empty } from "@/components/admin/kit/empty";
import { GroupHeading } from "@/components/admin/kit/list";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import type { DuplicateGroupPlan } from "@/lib/venues/place-review";
import { DuplicateGroup } from "./duplicate-group";
import { SafeMerge } from "./safe-merge-dialog";

/**
 * Duplicate groups by the date of the next event at each, so the groups touching this weekend
 * come first. The focused group's Merge is the pane's one filled button; "Merge these 5" takes
 * that role while it has focus.
 */
export function DuplicatesView({
  plans,
  snoozed,
  neighborhoods,
  now,
}: {
  plans: DuplicateGroupPlan[];
  snoozed: { plan: DuplicateGroupPlan; until: string }[];
  neighborhoods: NeighborhoodRow[];
  now: string;
}) {
  const [focused, setFocused] = React.useState<string | null>(null);
  const safe = plans.filter((p) => p.safe);
  const stillShown = (focused === "safe" && safe.length > 0) || plans.some((p) => p.key === focused);
  const current = stillShown ? focused : (plans[0]?.key ?? null);

  if (plans.length === 0 && snoozed.length === 0) {
    return <Empty detail="New places are checked against existing ones when they are added.">No duplicate places. Every place looks distinct.</Empty>;
  }

  return (
    <div>
      <SafeMerge plans={safe} primary={current === "safe"} onFocus={() => setFocused("safe")} />
      {plans.length === 0 && <Empty>Every duplicate group left is put off until later.</Empty>}
      {plans.map((plan) => (
        <DuplicateGroup
          key={plan.key}
          plan={plan}
          neighborhoods={neighborhoods}
          primary={current === plan.key}
          onFocusGroup={() => setFocused(plan.key)}
          now={now}
        />
      ))}
      {snoozed.length > 0 && (
        <div className="mt-8">
          <GroupHeading as="h2" fact={`${snoozed.length}`}>
            Put off until later
          </GroupHeading>
          <div className="px-4">
            {snoozed.map(({ plan, until }) => (
              <DuplicateGroup key={plan.key} plan={plan} neighborhoods={neighborhoods} snoozedUntil={until} headingLevel="h3" now={now} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
