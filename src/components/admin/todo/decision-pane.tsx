"use client";

import * as React from "react";
import { paneFor } from "./kind-registry";
import { PhoneBackLink } from "./phone-decision";
import { DecisionHeader } from "./decision-parts";
import { isWeekLane, positionText, type PileItem } from "./pile-model";
import { useTodo } from "./todo-context";
import { WeekendBrief } from "./weekend-brief";

export { DecisionActions, DecisionHeader, type ActionSpec } from "./decision-parts";

/**
 * The decision pane's content for the pile row under the cursor: the weekend brief or the pane
 * the registry names for the decision's kind, then the folded context wherever the context pane
 * is not shown (below 1280 px wide or 600 px tall).
 */
export function DecisionArea({ item, onBack, context }: { item: PileItem; onBack: () => void; context: React.ReactNode }) {
  const { decisions, lanes } = useTodo();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.closest(".sm-pane")?.scrollTo({ top: 0 });
  }, [item.id]);
  let body: React.ReactNode = null;
  if (item.type === "brief") {
    const lane = lanes.find((l) => l.lane === item.lane);
    body = lane ? <WeekendBrief lane={lane} /> : null;
  } else if (item.type === "decision") {
    body = React.createElement(paneFor(item.decision.kind), {
      key: item.decision.key,
      decision: item.decision,
      position: positionText(item.decision, decisions, lanes),
    });
  } else {
    const lane = lanes.find((l) => l.lane === item.lane);
    if (lane && isWeekLane(lane.lane)) body = <WeekendBrief lane={lane} />;
    else if (lane) body = <DecisionHeader title={lane.label} context="Nothing waits here." />;
  }
  return (
    <div ref={ref} className="px-4 pt-4 pb-8 md:px-5 md:pb-[calc(96px+env(safe-area-inset-bottom))] lg:p-5 lg:pb-24 xl:px-6">
      <PhoneBackLink onBack={onBack} />
      {body}
      <div className="xl:[@media(min-height:600px)]:hidden">{context}</div>
    </div>
  );
}
