import { cn } from "@/lib/utils";

/**
 * A keycap such as "P", "Ctrl+S" or "/". Decorative: the control it sits in carries the
 * shortcut through aria-keyshortcuts.
 */
export function KeyHint({
  keys,
  inverse = false,
  className,
}: {
  keys: string;
  /** On a filled button, the outline follows the button's text color. */
  inverse?: boolean;
  className?: string;
}) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-text text-xs font-medium tabular-nums not-italic",
        inverse ? "border-current/50 text-current" : "border-seam-strong text-ash",
        className
      )}
    >
      {keys}
    </kbd>
  );
}

/** "Ctrl+S" to the aria-keyshortcuts form "Control+S". */
export function toAriaKeyShortcuts(keys: string): string {
  return keys
    .split(" ")
    .map((combo) =>
      combo
        .split("+")
        .map((k) => (k === "Ctrl" ? "Control" : k === "Esc" ? "Escape" : k === "Down" ? "ArrowDown" : k === "Up" ? "ArrowUp" : k))
        .join("+")
    )
    .join(" ");
}
