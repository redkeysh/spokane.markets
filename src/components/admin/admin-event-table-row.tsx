"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface AdminEventTableRowProps {
  href: string;
  children: ReactNode;
}

export function AdminEventTableRow({ href, children }: AdminEventTableRowProps) {
  const router = useRouter();

  function shouldIgnoreTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("[data-row-action]"));
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (shouldIgnoreTarget(event.target)) return;
    router.push(href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (shouldIgnoreTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    router.push(href);
  }

  return (
    <tr
      className="cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="link"
    >
      {children}
    </tr>
  );
}
