"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { LayerPortal } from "@/components/admin/kit/layer";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { TextInput } from "@/components/admin/site/inputs";
import { autoUpdate, flip, offset, size, useFloating } from "@floating-ui/react-dom";
import { cn } from "@/lib/utils";

export type OwnerOption = { id: string; name: string | null; email: string };

const SEARCH_DELAY_MS = 250;

/** Keeps the list clear of the 56 px action bar at the bottom of the editor. */
const BOTTOM_CLEARANCE = 64;

function nameOf(user: OwnerOption) {
  return user.name?.trim() || user.email;
}

/**
 * Who claimed the profile: an account picked by name or email. A combobox: type two letters,
 * move through the matches with the arrow keys, Enter picks one, Escape closes the list. Only
 * accounts without a vendor profile of their own are offered. Focus moves to Remove after a pick
 * and back to the search after a removal, since each replaces the control that had it.
 */
export function OwnerPicker({
  id,
  vendorId,
  value,
  onChange,
  disabled,
  labelledBy,
  describedBy,
  invalid,
}: {
  id: string;
  vendorId: string | null;
  value: OwnerOption | null;
  onChange: (owner: OwnerOption | null) => void;
  disabled?: boolean;
  /** The id of the visible heading that names the picker. */
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<OwnerOption[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [status, setStatus] = React.useState<"idle" | "searching" | "done" | "error">("idle");
  const listId = `${id}-list`;
  const timer = React.useRef<number | undefined>(undefined);
  const request = React.useRef(0);
  const [reference, setReference] = React.useState<HTMLInputElement | null>(null);
  const [floating, setFloating] = React.useState<HTMLUListElement | null>(null);
  const removeButton = React.useRef<HTMLButtonElement>(null);
  const refocus = React.useRef<"remove" | "input" | null>(null);
  const { floatingStyles } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    open,
    elements: { reference, floating },
    middleware: [
      offset(4),
      flip({ padding: { top: 8, bottom: BOTTOM_CLEARANCE } }),
      size({
        padding: { top: 8, bottom: BOTTOM_CLEARANCE },
        apply({ rects, elements, availableHeight }) {
          elements.floating.style.width = `${rects.reference.width}px`;
          elements.floating.style.maxHeight = `${Math.max(120, Math.min(256, availableHeight))}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const valueId = value?.id ?? null;
  React.useEffect(() => {
    const target = refocus.current;
    refocus.current = null;
    if (target === "remove") removeButton.current?.focus();
    else if (target === "input") document.getElementById(id)?.focus();
  }, [valueId, id]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (reference?.contains(target) || floating?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, reference, floating]);

  const search = (text: string) => {
    window.clearTimeout(timer.current);
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus("idle");
      setOpen(false);
      return;
    }
    setStatus("searching");
    setOpen(true);
    timer.current = window.setTimeout(async () => {
      const mine = ++request.current;
      try {
        const params = new URLSearchParams({ q });
        if (vendorId) params.set("allowVendorId", vendorId);
        const res = await fetch(`/api/admin/users/search?${params}`);
        const data = res.ok ? ((await res.json()) as OwnerOption[]) : [];
        if (mine !== request.current) return;
        setResults(data);
        setActive(0);
        setStatus(res.ok ? "done" : "error");
      } catch {
        if (mine !== request.current) return;
        setResults([]);
        setStatus("error");
      }
    }, SEARCH_DELAY_MS);
  };

  const pick = (owner: OwnerOption) => {
    refocus.current = "remove";
    onChange(owner);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-seam-strong bg-sheet py-1 pr-1 pl-3">
        <div className="min-w-0 flex-1">
          <Link href={`/admin/users/${value.id}`} className="block truncate text-sm font-medium text-lilac underline-offset-4 hover:underline">
            {nameOf(value)}
          </Link>
          {value.name && <span className="block truncate text-xs text-ash">{value.email}</span>}
        </div>
        <Tooltip content="Remove the owner">
          <AdminButton
            ref={removeButton}
            variant="quiet"
            size="icon-sm"
            aria-label={`Remove ${nameOf(value)} as the owner`}
            onClick={() => {
              refocus.current = "input";
              onChange(null);
            }}
            disabled={disabled}
          >
            <X strokeWidth={1.75} aria-hidden="true" />
          </AdminButton>
        </Tooltip>
      </div>
    );
  }

  const optionId = (i: number) => `${id}-option-${i}`;
  const showList = open && (status !== "idle");

  return (
    <>
      <TextInput
        ref={setReference}
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder="Search accounts by name or email"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open && query.trim().length >= 2) setOpen(true);
            setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (showList && results[active]) {
              e.preventDefault();
              pick(results[active]);
            }
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {showList && (
        <LayerPortal>
          <ul
            ref={setFloating}
            id={listId}
            role="listbox"
            aria-label="Matching accounts"
            style={floatingStyles}
            className="sm-float z-40 overflow-y-auto rounded-lg p-1 font-text text-sm text-basalt"
          >
            {status === "searching" && results.length === 0 && <li className="px-2 py-1.5 text-ash">Searching</li>}
            {status === "error" && <li className="px-2 py-1.5 text-ponderosa">The search did not work. Try again.</li>}
            {status === "done" && results.length === 0 && (
              <li className="px-2 py-1.5 text-ash">No account without a vendor profile matches.</li>
            )}
            {results.map((user, i) => (
              <li
                key={user.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(user)}
                onPointerMove={() => setActive(i)}
                className={cn("cursor-default rounded-md px-2 py-1.5", i === active && "bg-lilac-tint")}
              >
                <span className="block font-medium">{nameOf(user)}</span>
                {user.name && <span className="block text-xs text-ash">{user.email}</span>}
              </li>
            ))}
          </ul>
        </LayerPortal>
      )}
    </>
  );
}
