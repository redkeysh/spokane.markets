"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { useRail } from "@/components/admin/shell/rail-context";
import { buildBrief, type BriefAction } from "./brief-model";
import { DecisionHeader, type ActionSpec } from "./decision-parts";
import { PhoneDecisionBar } from "./phone-decision";
import { weekKeyOf } from "./pile-model";
import { useDecisionKeys, useTodo } from "./todo-context";
import type { TodoLane } from "./types";

/**
 * "This weekend at a glance": a few plain sentences in order, each with at most one button. The
 * only filled one is cedar "Publish the 8 ready"; P does the same. Live counts come from the
 * rail, so they move the moment the stalls fill.
 */
export function WeekendBrief({ lane }: { lane: TodoLane }) {
  const api = useTodo();
  const { rail } = useRail();
  const week = rail.weeks.find((w) => w.key === weekKeyOf(lane.lane));
  const counts = week ? { live: week.live, total: week.live + week.pending + week.draft } : undefined;
  const brief = buildBrief({ lane, lanes: api.lanes, decisions: api.decisions, today: api.data.today, now: api.now, counts });
  const ready = api.decisions.find((d) => d.kind === "ready" && d.lane === lane.lane);
  const anyBusy = api.busy !== null;

  const publishReady = () => {
    if (ready) api.confirmPublish(ready, ready.settles);
    else api.announce("Nothing here is ready to publish as a batch.");
  };
  useDecisionKeys({ p: publishReady });

  const spec = (action: BriefAction): ActionSpec => {
    switch (action.kind) {
      case "publish-ready":
        return {
          label: action.label,
          keys: "P",
          variant: "publish",
          onClick: publishReady,
          disabled: anyBusy,
          busy: api.busy === action.decisionKey,
          busyLabel: "Publishing",
        };
      case "goto":
        return { label: action.label, variant: "outline", onClick: () => api.goTo(action.decisionKey), disabled: anyBusy };
      case "open-lane":
        return { label: action.label, variant: "ink", onClick: () => api.openLane(action.lane), disabled: anyBusy };
    }
  };
  const specs = brief.lines.map((line) => (line.action ? spec(line.action) : null));
  const primary = specs.find((s) => s?.variant === "publish" || s?.variant === "ink") ?? undefined;

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader title={brief.title} />
      <div className="grid items-start gap-y-4 sm:grid-cols-[minmax(0,72ch)_auto] sm:gap-x-8">
        {brief.lines.map((line, i) => {
          const s = specs[i];
          return (
            <React.Fragment key={line.text}>
              <p className="text-[15px]/[23px] text-basalt">{line.text}</p>
              <div className={!s || s === primary ? "max-sm:hidden" : "-mt-2 sm:mt-0"}>
                {s && (
                  <AdminButton
                    variant={s.variant}
                    keys={s.keys && api.singleKeys ? s.keys : undefined}
                    onClick={s.onClick}
                    disabled={s.disabled}
                    busy={s.busy}
                    busyLabel={s.busyLabel}
                    className="max-lg:hidden"
                  >
                    {s.label}
                  </AdminButton>
                )}
                {s && s !== primary && (
                  <AdminButton variant={s.variant} onClick={s.onClick} disabled={s.disabled} size="sm" className="lg:hidden">
                    {s.label}
                  </AdminButton>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {brief.footer && <p className="mt-6 max-w-[72ch] text-[15px]/[23px] text-ash">{brief.footer}</p>}
      {primary && <PhoneDecisionBar primary={primary} more={[]} />}
    </article>
  );
}
