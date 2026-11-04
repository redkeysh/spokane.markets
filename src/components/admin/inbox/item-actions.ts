import type { AdminButtonVariant } from "@/components/admin/kit/button";
import { decidePublicItems, makePhotoEventPicture } from "@/app/admin/_actions/inbox";
import type { InboxActionResult, InboxItem, PublicDecisionData } from "@/lib/admin/inbox/types";

/** One thing the owner can do with an item: a server action, or a link. */
export type ItemAction = {
  id: string;
  label: string;
  variant: AdminButtonVariant;
  /** "P" puts it on the site or settles it; "X" keeps it off. */
  keys?: "P" | "X";
  busyLabel?: string;
  run?: () => Promise<InboxActionResult>;
  href?: string;
  /** Opens in a new tab (the public site) or the mail app. */
  external?: boolean;
  /** Where to go once `run` changed something, instead of staying. */
  then?: string;
};

export type ItemActions = {
  /** The filled button (cedar when it puts something on the site). */
  primary: ItemAction | null;
  /** Keeps it off: Reject, Dismiss, Archive. */
  reject: ItemAction | null;
  more: ItemAction[];
};

type Actionable = PublicDecisionData | Extract<InboxItem, { kind: "submission" }>;

const NONE: ItemActions = { primary: null, reject: null, more: [] };

/**
 * The actions of an item in its current status. With a `decisionKey` (from To do) the decision's
 * audit entries carry it; `notes` go with an application's decision.
 */
export function itemActions(item: Actionable, decisionKey?: string, options: { notes?: string } = {}): ItemActions {
  const key = decisionKey ? { decisionKey } : {};
  switch (item.kind) {
    case "review": {
      const approve: ItemAction = {
        id: "approve",
        label: "Approve",
        variant: "publish",
        keys: "P",
        busyLabel: "Approving",
        run: () => decidePublicItems({ kind: "review", ids: [item.id], to: "APPROVED", ...key }),
      };
      const reject: ItemAction = {
        id: "reject",
        label: "Reject",
        variant: "danger-outline",
        keys: "X",
        busyLabel: "Rejecting",
        run: () => decidePublicItems({ kind: "review", ids: [item.id], to: "REJECTED", ...key }),
      };
      if (item.status === "PENDING") return { primary: approve, reject, more: [] };
      return { primary: null, reject: null, more: [item.status === "APPROVED" ? { ...reject, keys: undefined } : { ...approve, keys: undefined, variant: "outline" }] };
    }
    case "photo": {
      const show: ItemAction = {
        id: "show",
        label: "Show photo",
        variant: "publish",
        keys: "P",
        busyLabel: "Showing",
        run: () => decidePublicItems({ kind: "photo", ids: [item.id], to: "APPROVED", ...key }),
      };
      const reject: ItemAction = {
        id: "reject",
        label: "Reject",
        variant: "danger-outline",
        keys: "X",
        busyLabel: "Rejecting",
        run: () => decidePublicItems({ kind: "photo", ids: [item.id], to: "REJECTED", ...key }),
      };
      const picture: ItemAction[] =
        item.eventId && !item.isEventPicture
          ? [{ id: "picture", label: "Use as the event picture", variant: "outline", busyLabel: "Saving", run: () => makePhotoEventPicture({ photoId: item.id, ...key }) }]
          : [];
      if (item.status === "PENDING") return { primary: show, reject, more: picture };
      if (item.status === "APPROVED") return { primary: null, reject: null, more: [...picture, { ...reject, keys: undefined }] };
      return { primary: null, reject: null, more: [{ ...show, keys: undefined, variant: "outline" }, ...picture] };
    }
    case "report": {
      const open: ItemAction[] = item.target.adminHref ? [{ id: "open", label: "Open the listing", variant: "outline", href: item.target.adminHref }] : [];
      if (item.status !== "PENDING") return { ...NONE, more: open };
      return {
        primary: {
          id: "resolve",
          label: "Mark resolved",
          variant: "ink",
          keys: "P",
          busyLabel: "Saving",
          run: () => decidePublicItems({ kind: "report", ids: [item.id], to: "RESOLVED", ...key }),
        },
        reject: {
          id: "dismiss",
          label: "Dismiss",
          variant: "danger-outline",
          keys: "X",
          busyLabel: "Dismissing",
          run: () => decidePublicItems({ kind: "report", ids: [item.id], to: "DISMISSED", ...key }),
        },
        more: open,
      };
    }
    case "application": {
      const notes = options.notes !== undefined ? { notes: options.notes } : {};
      const to = (status: "APPROVED" | "REJECTED" | "NEEDS_INFO" | "DUPLICATE") => () =>
        decidePublicItems({ kind: "application", ids: [item.id], to: status, ...notes, ...key });
      const approve: ItemAction = { id: "approve", label: "Approve", variant: "ink", keys: "P", busyLabel: "Approving", run: to("APPROVED") };
      const reject: ItemAction = { id: "reject", label: "Reject", variant: "danger-outline", keys: "X", busyLabel: "Rejecting", run: to("REJECTED") };
      const needs: ItemAction = { id: "needs-info", label: "Ask for more information", variant: "outline", busyLabel: "Saving", run: to("NEEDS_INFO") };
      const duplicate: ItemAction = { id: "duplicate", label: "Mark as a duplicate", variant: "outline", busyLabel: "Saving", run: to("DUPLICATE") };
      const market = item.createMarketHref;
      const approveAndCreate: ItemAction[] = market
        ? [{ id: "approve-create", label: "Approve and create the market", variant: "outline", busyLabel: "Approving", run: to("APPROVED"), then: market }]
        : [];
      if (item.status === "PENDING") return { primary: approve, reject, more: [...approveAndCreate, needs, duplicate] };
      if (item.status === "APPROVED") {
        return { primary: market ? { id: "create-market", label: "Create the market", variant: "ink", href: market } : null, reject: null, more: [] };
      }
      if (item.status === "NEEDS_INFO") return { primary: approve, reject, more: [...approveAndCreate, duplicate] };
      return { primary: null, reject: null, more: [{ ...approve, keys: undefined, variant: "outline" }] };
    }
    case "message": {
      const set = (status: "PENDING" | "READ" | "ARCHIVED") => () => decidePublicItems({ kind: "message", ids: [item.id], to: status, ...key });
      const reply: ItemAction = {
        id: "reply",
        label: "Reply by email",
        variant: "outline",
        href: `mailto:${item.email}${item.subject ? `?subject=${encodeURIComponent(`Re: ${item.subject}`)}` : ""}`,
        external: true,
      };
      const read: ItemAction = { id: "read", label: "Mark read", variant: "ink", keys: "P", busyLabel: "Saving", run: set("READ") };
      const archive: ItemAction = { id: "archive", label: "Archive", variant: "outline", keys: "X", busyLabel: "Archiving", run: set("ARCHIVED") };
      const unread: ItemAction = { id: "unread", label: "Mark unread", variant: "outline", busyLabel: "Saving", run: set("PENDING") };
      if (item.status === "PENDING") return { primary: read, reject: archive, more: [reply] };
      if (item.status === "READ") return { primary: null, reject: null, more: [reply, { ...archive, keys: undefined }, unread] };
      return { primary: null, reject: null, more: [reply, unread] };
    }
    case "market": {
      const set = (status: "VERIFIED" | "UNVERIFIED") => () => decidePublicItems({ kind: "market", ids: [item.id], to: status, ...key });
      if (item.status !== "PENDING") return NONE;
      return {
        primary: { id: "verify", label: "Verify", variant: "ink", keys: "P", busyLabel: "Verifying", run: set("VERIFIED") },
        reject: { id: "unverified", label: "Do not verify", variant: "danger-outline", keys: "X", busyLabel: "Saving", run: set("UNVERIFIED") },
        more: [],
      };
    }
    case "submission":
      return NONE;
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What the main actions do beyond the item itself, in one or two sentences; null once decided. */
export function consequenceNote(item: PublicDecisionData): string | null {
  if (item.status !== "PENDING") return null;
  switch (item.kind) {
    case "review":
      return "Approving shows the review on the site. Nobody is told.";
    case "photo":
      return item.eventId
        ? "Showing puts the photo on the site. Use it as the event picture to put it at the top of the listing."
        : "Showing puts the photo on the site.";
    case "report":
      return "Resolving closes its escalation. Nobody is told. Fix the listing itself from Open the listing.";
    case "application":
      return item.account ? `${firstName(item.name)} is told whatever you decide.` : "They have no account, so nobody is told.";
    case "message":
      return "Nobody is told. Reply by email to answer.";
    case "market":
      return item.owner ? `Verifying tells ${firstName(item.owner.name)} and the market's managers.` : "Nobody is told: the market has no owner account.";
  }
}
