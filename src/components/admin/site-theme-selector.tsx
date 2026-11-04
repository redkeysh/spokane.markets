"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { PublicIsland } from "@/components/admin/kit/public-island";
import { FormError } from "@/components/admin/site/inputs";
import { useUnsavedSection } from "@/components/admin/site/unsaved";
import { saveSitePalette } from "@/app/admin/_actions/site";
import { SITE_PALETTES } from "@/lib/site/settings-input";
import type { SiteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { settle } from "@/lib/admin/settle";

/** The public site's palette: one choice of four, each with its ground, green and accent shown. */
export function SiteThemeSelector({ currentTheme }: { currentTheme: SiteTheme }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(currentTheme);
  const [choice, setChoice] = React.useState(currentTheme);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const dirty = choice !== saved;
  useUnsavedSection("palette", "Color palette", dirty);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await settle(saveSitePalette(choice));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(choice);
      toast.success(`The public site now uses ${SITE_PALETTES.find((p) => p.value === choice)?.label ?? "the new palette"}.`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="sr-only">Color palette of the public site</legend>
        <div className="divide-y divide-seam border-y border-seam">
          {SITE_PALETTES.map((option) => {
            const id = `palette-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2.5",
                  choice === option.value ? "bg-lilac-tint" : "hover:bg-hover"
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name="site-palette"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => setChoice(option.value)}
                  className="size-4 shrink-0 accent-basalt"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-basalt">
                    {option.label}
                    {option.value === saved && <span className="font-normal text-ash"> (in use)</span>}
                  </span>
                  <span className="block text-xs text-ash">{option.description}</span>
                </span>
                <PublicIsland palette={option.value} className="flex shrink-0 gap-1 rounded-sm border border-seam p-1">
                  <span aria-hidden="true" className="size-4 rounded-[2px] border border-border bg-background" />
                  <span aria-hidden="true" className="size-4 rounded-[2px] bg-primary" />
                  <span aria-hidden="true" className="size-4 rounded-[2px] bg-accent" />
                </PublicIsland>
              </label>
            );
          })}
        </div>
      </fieldset>
      <FormError>{error}</FormError>
      <AdminButton type="submit" variant={dirty ? "ink" : "outline"} disabled={!dirty} busy={pending} busyLabel="Saving">
        Save
      </AdminButton>
    </form>
  );
}
