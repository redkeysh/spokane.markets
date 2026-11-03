"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, activeNavKey } from "@/lib/admin/nav";
import type { NavSignals } from "@/lib/admin/nav-signals";
import { AdminButton, adminButtonClass } from "@/components/admin/kit/button";
import { StallGlyph } from "@/components/admin/kit/stall";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { ModeToggle } from "./mode-toggle";
import { NavLink } from "./nav-link";
import { useShell } from "./shell-context";

/**
 * 48 px on the fog band, continuous with the rail. Desktop: wordmark, the seven words, Jump,
 * View site and the mode. Phone: wordmark and a Jump icon; the rest moves to the bottom bar.
 */
export function TopBar({ signals }: { signals: NavSignals }) {
  const pathname = usePathname();
  const current = activeNavKey(pathname);
  const { openJump } = useShell();

  return (
    <header className="sm-topbar flex items-center bg-fog px-4 md:px-6">
      <Link href="/admin" className="flex shrink-0 items-center gap-2 rounded-sm">
        <StallGlyph status="PUBLISHED" size="md" />
        <span className="font-display text-[15px]/5 font-extrabold text-basalt md:max-lg:sr-only">Spokane Markets</span>
      </Link>

      <nav aria-label="Admin" className="ml-5 hidden min-w-0 md:block lg:ml-8">
        <ul className="flex items-center gap-4 lg:gap-5">
          {ADMIN_NAV.map((item) => (
            <li key={item.key}>
              <NavLink
                item={item}
                active={current === item.key}
                signal={item.signal ? signals[item.signal] : undefined}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1 pl-4">
        <AdminButton
          variant="quiet"
          size="sm"
          keys="/"
          aria-keyshortcuts="/ Control+K Meta+K"
          className="hidden md:inline-flex"
          onClick={openJump}
        >
          Jump
        </AdminButton>
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          className={cn(adminButtonClass({ variant: "quiet", size: "sm" }), "hidden md:inline-flex")}
        >
          View site<span className="sr-only"> (opens in a new tab)</span>
        </Link>
        <ModeToggle className="hidden md:inline-flex" />
        <Tooltip content="Jump">
          <AdminButton variant="quiet" size="icon" aria-label="Jump" className="md:hidden" onClick={openJump}>
            <Search strokeWidth={1.75} aria-hidden="true" />
          </AdminButton>
        </Tooltip>
      </div>
    </header>
  );
}
