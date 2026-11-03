import { cn } from "@/lib/utils";

export type PublicPalette = "cedar" | "evergreen" | "paper" | "clay";

/**
 * Renders a real public component (event card, announcement bar) inside the admin in the public
 * site's own look: light, cream and cedar, Fraunces and Inter, or the palette the owner picked.
 */
export function PublicIsland({
  palette = "cedar",
  children,
  className,
}: {
  palette?: PublicPalette | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("sm-public-island", className)}
      data-palette={palette && palette !== "cedar" ? palette : undefined}
    >
      {children}
    </div>
  );
}
