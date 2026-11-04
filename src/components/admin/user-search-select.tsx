"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type UserOption = {
  id: string;
  name: string | null;
  email: string;
};

interface UserSearchSelectProps {
  value: string | null;
  onChange: (userId: string | null) => void;
  /** When editing a vendor, pass its id so the current owner appears in results */
  allowVendorId?: string;
  /** Pre-loaded user when editing (avoids extra fetch) */
  initialUser?: UserOption | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function UserSearchSelect({
  value,
  onChange,
  allowVendorId,
  initialUser,
  placeholder = "Search by name or email...",
  disabled = false,
  className,
}: UserSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<UserOption | null>(
    initialUser ?? null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (!q || q.length < 2) {
          setResults([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          const params = new URLSearchParams({ q });
          if (allowVendorId) params.set("allowVendorId", allowVendorId);
          const res = await fetch(`/api/admin/users/search?${params}`);
          if (res.ok) {
            const data = (await res.json()) as UserOption[];
            setResults(data);
          } else {
            setResults([]);
          }
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [allowVendorId]
  );

  const [seenInitial, setSeenInitial] = useState(initialUser);
  if (seenInitial !== initialUser) {
    setSeenInitial(initialUser);
    setQuery("");
    setResults([]);
    setOpen(false);
    setSelectedDisplay(initialUser ?? null);
  }

  const changeQuery = (next: string) => {
    setQuery(next);
    if (next.trim().length >= 2) {
      search(next.trim());
      setOpen(true);
    } else {
      search("");
      setResults([]);
      setOpen(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (user: UserOption) => {
    onChange(user.id);
    setSelectedDisplay(user);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSelectedDisplay(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const displayLabel = (u: UserOption) =>
    [u.name, u.email].filter(Boolean).join(" • ") || u.email;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {value && selectedDisplay ? (
        <div className="flex items-center gap-2 rounded-md border border-seam-strong bg-sheet px-3 py-2">
          <span className="flex-1 truncate text-sm">
            {displayLabel(selectedDisplay)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Clear user"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <Input
            type="text"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            onFocus={() => query.length >= 2 && setOpen(true)}
          />
          {open && (results.length > 0 || loading) && (
            <ul
              className="absolute z-50 mt-1 max-h-60 w-full overflow-auto sm-float rounded-lg py-1"
              role="listbox"
            >
              {loading ? (
                <li className="px-3 py-2 text-sm text-ash">
                  Searching...
                </li>
              ) : (
                results.map((user) => (
                  <li
                    key={user.id}
                    role="option"
                    aria-selected={user.id === value}
                    className={cn(
                      "cursor-pointer px-3 py-2 text-sm hover:bg-hover",
                      user.id === value && "bg-lilac-tint"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(user);
                    }}
                  >
                    {displayLabel(user)}
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
      <p className="mt-1 text-xs text-ash">
        Link this profile to a user account. Leave empty for unclaimed.
      </p>
    </div>
  );
}
