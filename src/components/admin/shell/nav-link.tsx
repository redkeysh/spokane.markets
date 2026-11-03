"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminNavItem } from "@/lib/admin/nav";
import type { NavSignal } from "@/lib/admin/nav-signals";
import { Tooltip } from "@/components/admin/kit/tooltip";

/** A 6 px honey-ink dot drawn with a border, so it survives forced colors. */
export function NavDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-block size-1.5 rounded-full border-[3px] border-honey-ink", className)} />
  );
}

/**
 * A top bar item. The current one is basalt 600 with a 2 px basalt bar on the bottom edge. A dot
 * carries its count in the accessible name and the tooltip ("To do: 21 waiting this weekend").
 */
export function NavLink({ item, active, signal }: { item: AdminNavItem; active: boolean; signal?: NavSignal }) {
  const dot = signal?.dot ?? false;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={dot ? signal?.label : undefined}
      className={cn(
        "relative inline-flex h-12 items-center rounded-sm font-text text-sm whitespace-nowrap transition-colors duration-[80ms]",
        "after:absolute after:inset-x-0 after:bottom-0 after:border-b-2",
        active
          ? "font-semibold text-basalt after:border-basalt"
          : "font-medium text-ash after:border-transparent hover:text-basalt forced-colors:after:border-[Canvas]"
      )}
    >
      {item.label}
      {dot && <NavDot className="ml-1" />}
    </Link>
  );
  return dot && signal ? <Tooltip content={signal.label}>{link}</Tooltip> : link;
}
