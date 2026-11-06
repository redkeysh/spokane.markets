import Link from "next/link";
import { cn } from "@/lib/utils";
import { SECTION_LINK } from "@/components/admin/kit/section-link";

/** In-page links to the sections of a long page. Anchors, not tabs: every section stays on the page. */
export function SectionLinks({ label, links, className }: { label: string; links: ReadonlyArray<{ id: string; label: string }>; className?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {links.map((link) => (
          <li key={link.id}>
            <Link href={`#${link.id}`} className={SECTION_LINK}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A section of the Site page: an anchor, the 15 px heading with its actions on the same line, an
 * optional sentence, then the content. Separated from the one above by a seam line and space.
 */
export function SiteSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-4 border-t border-seam pt-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="font-text text-[15px]/[20px] font-semibold text-basalt">
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1 max-w-[72ch] text-sm text-ash">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
