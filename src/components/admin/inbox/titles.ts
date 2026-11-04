import { applicationTitle, excerpt } from "@/lib/admin/inbox/words";
import type { InboxItem, PublicDecisionData } from "@/lib/admin/inbox/types";

/** An item's title in lists and on its own page: the same words To do uses. */
export function itemTitle(item: InboxItem | PublicDecisionData): string {
  switch (item.kind) {
    case "submission":
      return item.title;
    case "review":
      return item.target ? `Review of ${item.target.title}` : "Review of a listing that is gone";
    case "photo":
      return item.target ? `Photo for ${item.target.title}` : "Photo for a listing that is gone";
    case "report":
      return `Report on ${item.target.title}`;
    case "application":
      return applicationTitle(item.name, item.formType);
    case "message":
      return item.subject ?? `Message from ${item.name}`;
    case "survey":
      return item.contactName ? `${item.vendorType}, ${item.contactName}` : item.vendorType;
    case "market":
      return `Verify ${item.name}?`;
  }
}

/** The one-line excerpt under a row's title, or null. */
export function itemExcerpt(item: InboxItem): string | null {
  switch (item.kind) {
    case "review":
      return item.text ? excerpt(item.text) : null;
    case "report":
      return item.notes ? excerpt(item.notes) : null;
    case "message":
      return excerpt(item.message);
    case "application":
      return item.answers.length
        ? excerpt(item.answers.map((a) => (/[?:.]$/.test(a.label) ? `${a.label} ${a.value}` : `${a.label}: ${a.value}`)).join(". "))
        : null;
    default:
      return null;
  }
}
