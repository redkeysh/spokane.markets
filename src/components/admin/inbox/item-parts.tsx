import { cn } from "@/lib/utils";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";

type Word = { word: string; className: string };

/** Statuses with no stall: a word in the status color. */
const WORDS: Record<string, Word> = {
  RESOLVED: { word: "Resolved", className: "text-basalt" },
  DISMISSED: { word: "Dismissed", className: "text-ash" },
  NEEDS_INFO: { word: "Needs info", className: "text-ash" },
  DUPLICATE: { word: "Duplicate", className: "text-ash" },
  READ: { word: "Read", className: "text-ash" },
  ARCHIVED: { word: "Archived", className: "text-ash-quiet" },
  UNVERIFIED: { word: "Not verified", className: "text-ash" },
};

const MARKS: Record<string, MarkStatus> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  VERIFIED: "VERIFIED",
};

/**
 * The status of an item from the public, never color alone: waiting items carry the waiting
 * stall and the word (messages say "Unread"); decided ones a word.
 */
export function PublicStatus({ kind, status, live = false, className }: { kind: string; status: string; live?: boolean; className?: string }) {
  if (status === "PENDING") {
    if (kind === "market") return <StatusMark status="VERIFICATION_PENDING" size="sm" className={className} />;
    if (kind === "message") {
      return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap font-text text-xs font-medium text-honey-ink", className)}>Unread</span>;
    }
    return <StatusMark status="WAITING" size="sm" className={className} />;
  }
  if (kind === "submission" && status === "APPROVED" && live) return <StatusMark status="PUBLISHED" size="sm" className={className} />;
  if (kind === "photo" && status === "APPROVED") {
    return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap font-text text-xs font-medium text-basalt", className)}>Showing</span>;
  }
  const mark = MARKS[status];
  if (mark) return <StatusMark status={mark} size="sm" className={className} />;
  const word = WORDS[status] ?? { word: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "), className: "text-ash" };
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap font-text text-xs font-medium", word.className, className)}>{word.word}</span>;
}

/** Label and value rows: the label in a 104 px column beside the value, stacked on phones. */
export function Facts({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("sm:grid sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-3", className)}>{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 sm:contents">
      <dt className="text-sm font-medium text-ash">{label}</dt>
      <dd className="mt-0.5 min-w-0 max-w-[72ch] text-sm text-basalt sm:mt-0">{children}</dd>
    </div>
  );
}

export const LINK = "rounded-sm text-lilac underline-offset-2 hover:underline";
