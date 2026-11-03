import { cn } from "@/lib/utils";
import { StallGlyph, type StallStatus } from "./stall";

/**
 * Every status the admin shows, across events, submissions, reviews, markets and vendors.
 * Raw enums never reach the screen: each maps to a sentence-case word.
 */
export type MarkStatus =
  | "PUBLISHED"
  | "PENDING"
  | "DRAFT"
  | "CANCELLED"
  | "REJECTED"
  | "ARCHIVED"
  /** Submissions and reviews still waiting on a decision. */
  | "WAITING"
  /** An approved submission or review whose event is not live. One whose event is live shows as PUBLISHED. */
  | "APPROVED"
  /** Markets and vendors: verification uses words only, no stall. */
  | "VERIFIED"
  | "NOT_VERIFIED"
  | "VERIFICATION_PENDING";

type Mark = { word: string; glyph: StallStatus | null; text: string; chip: string };

const WAITING_CHIP = "bg-honey-tint text-honey-text";
const OFF_CHIP = "bg-ponderosa-tint text-ponderosa";

export const STATUS_MARKS: Record<MarkStatus, Mark> = {
  PUBLISHED: { word: "Published", glyph: "PUBLISHED", text: "text-cedar", chip: "bg-cedar-tint text-cedar" },
  PENDING: { word: "Pending", glyph: "PENDING", text: "text-honey-ink", chip: WAITING_CHIP },
  DRAFT: { word: "Draft", glyph: "DRAFT", text: "text-ash", chip: "bg-draft-tint text-ash" },
  CANCELLED: { word: "Cancelled", glyph: "CANCELLED", text: "text-ponderosa", chip: OFF_CHIP },
  REJECTED: { word: "Rejected", glyph: "REJECTED", text: "text-ponderosa", chip: OFF_CHIP },
  ARCHIVED: {
    word: "Archived",
    glyph: "ARCHIVED",
    text: "text-ash-quiet",
    chip: "border border-seam-strong text-ash-quiet",
  },
  WAITING: { word: "Waiting", glyph: "PENDING", text: "text-honey-ink", chip: WAITING_CHIP },
  APPROVED: { word: "Approved", glyph: null, text: "text-basalt", chip: "border border-seam-strong text-basalt" },
  VERIFIED: { word: "Verified", glyph: null, text: "text-basalt", chip: "border border-seam-strong text-basalt" },
  NOT_VERIFIED: { word: "Not verified", glyph: null, text: "text-ash", chip: "bg-draft-tint text-ash" },
  VERIFICATION_PENDING: { word: "Waiting for verification", glyph: null, text: "text-honey-ink", chip: WAITING_CHIP },
};

/**
 * The stall glyph followed by the word in the status color. `chip` is for compact places only:
 * pile rows, compare headers and the editor header.
 */
export function StatusMark({
  status,
  size = "md",
  chip = false,
  className,
}: {
  status: MarkStatus;
  /** sm for dense rows. */
  size?: "md" | "sm";
  chip?: boolean;
  className?: string;
}) {
  const mark = STATUS_MARKS[status];
  if (chip) {
    return (
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 font-text text-xs font-medium",
          mark.chip,
          className
        )}
      >
        {mark.glyph && <StallGlyph status={mark.glyph} size="sm" />}
        {mark.word}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-text font-medium",
        size === "md" ? "text-sm" : "text-xs",
        mark.text,
        className
      )}
    >
      {mark.glyph && <StallGlyph status={mark.glyph} size={size} />}
      {mark.word}
    </span>
  );
}
