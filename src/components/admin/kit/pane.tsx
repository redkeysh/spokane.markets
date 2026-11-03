import { cn } from "@/lib/utils";

/**
 * The root of a screen that lays out its own panes. In pane mode it fills the shell's screen row
 * and nothing outside its panes scrolls; in page mode it flows with the document.
 */
export function Screen({
  children,
  className,
  bottomBar = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** false hides the phone bottom bar, for screens with their own action bar (the editor). */
  bottomBar?: boolean;
}) {
  return (
    <div className={cn("sm-screen", className)} data-no-bottom-bar={bottomBar ? undefined : true}>
      {children}
    </div>
  );
}

/**
 * A pane that scrolls by itself in pane mode. It is a labeled region with a tab stop, so it
 * scrolls by keyboard; its focus ring is drawn inside so the neighbors never clip it.
 */
export function Pane({
  label,
  children,
  className,
  tone = "sheet",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  tone?: "sheet" | "fog";
}) {
  return (
    <section
      aria-label={label}
      tabIndex={0}
      className={cn("sm-pane focus-visible:outline-offset-[-2px]", tone === "sheet" ? "bg-sheet" : "bg-fog", className)}
    >
      {children}
    </section>
  );
}
