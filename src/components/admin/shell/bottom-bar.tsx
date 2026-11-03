"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ListChecks, MapPin, Menu, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, PHONE_NAV_KEYS, activeNavKey, type AdminNavKey } from "@/lib/admin/nav";
import type { NavSignals } from "@/lib/admin/nav-signals";
import { NavDot } from "./nav-link";

const ICONS: Partial<Record<AdminNavKey, LucideIcon>> = {
  todo: ListChecks,
  events: CalendarDays,
  venues: MapPin,
  markets: Store,
  more: Menu,
};

/** Phone navigation, 56 px plus the safe area: icon and word for each of PHONE_NAV_KEYS. */
export function BottomBar({ signals }: { signals: NavSignals }) {
  const pathname = usePathname();
  const current = activeNavKey(pathname);

  return (
    <nav aria-label="Admin" className="sm-bottom-bar border-t border-seam bg-fog">
      <ul
        className="grid h-14"
        style={{ gridTemplateColumns: `repeat(${PHONE_NAV_KEYS.length}, minmax(0, 1fr))` }}
      >
        {PHONE_NAV_KEYS.map((key) => {
          const item = ADMIN_NAV.find((i) => i.key === key)!;
          const Icon = ICONS[key]!;
          const signal = item.signal ? signals[item.signal] : undefined;
          const active = current === key;
          return (
            <li key={key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={signal?.dot ? signal.label : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-0.5 font-text text-xs",
                  "before:absolute before:inset-x-3 before:top-0 before:border-t-2",
                  active
                    ? "font-semibold text-basalt before:border-basalt"
                    : "font-medium text-ash before:border-transparent forced-colors:before:border-[Canvas]"
                )}
              >
                <span className="relative">
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  {signal?.dot && <NavDot className="absolute -top-0.5 -right-1.5" />}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
