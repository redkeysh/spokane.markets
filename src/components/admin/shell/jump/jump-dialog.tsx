"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Command, useCommandState } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Empty } from "@/components/admin/kit/empty";
import { LiveRegion } from "../live-region";
import { useShell } from "../shell-context";
import { EntityGroups, WeekendGroup } from "./entity-groups";
import { JUMP_ITEM } from "./item-class";
import { JUMP_COMMANDS, JUMP_PAGES, availableCommands, type JumpCommandAction } from "./pages";
import { filterLocal, jumpAnnouncement, weekendHref } from "./results";
import { useJumpSearch } from "./use-jump-search";

const SEARCHED = "events, markets, places, vendors and people";

/**
 * The command palette: every admin page by its plain name and synonyms, the commands, and
 * events, markets, places, vendors and people from the database. A typed date offers its weekend.
 * Opened with "/" or Ctrl+K, or from the top bar.
 */
export function JumpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump"
      hideTitle
      size="list"
      placement="top"
      bodyClassName="p-0"
    >
      <JumpPalette onDone={() => onOpenChange(false)} />
    </AdminDialog>
  );
}

/** Mounted only while the dialog is open, so each opening starts empty with fresh results. */
function JumpPalette({ onDone }: { onDone: () => void }) {
  const pathname = usePathname();
  const { mode, setMode, singleKeys, setSingleKeys, openShortcuts, navigate } = useShell();
  const [search, setSearch] = React.useState("");
  const entities = useJumpSearch(search);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const pages = filterLocal(JUMP_PAGES, search);
  const commands = filterLocal(availableCommands(JUMP_COMMANDS, { mode, singleKeys }), search);
  const results = entities.results;
  const weekend = results?.weekend ?? null;
  const groups = results?.groups ?? [];
  const itemCount = pages.length + commands.length + (weekend ? 1 : 0) + groups.length;
  const query = search.trim();

  const settled = entities.query !== "" && !entities.loading;
  const announcement = !settled
    ? ""
    : entities.failed
      ? `Could not search ${SEARCHED} just now.`
      : results
        ? jumpAnnouncement(results, { pages: pages.length, commands: commands.length })
        : "";

  const run = (action: JumpCommandAction) => {
    onDone();
    switch (action.type) {
      case "href":
        navigate(action.href);
        break;
      case "view-site":
        window.open("/", "_blank", "noopener,noreferrer");
        break;
      case "mode":
        setMode(action.mode);
        break;
      case "single-keys":
        setSingleKeys(action.on);
        break;
      case "shortcuts":
        openShortcuts();
        break;
    }
  };

  const go = (href: string) => run({ type: "href", href });
  /**
   * cmdk gives the cursor to the first option when the search changes or, if no option has it,
   * when options mount. Stale options cannot take the cursor, so the weekend and entity options
   * remount when they stop being stale and the first of them can take it.
   */
  const generation = entities.stale ? "stale" : "fresh";

  return (
    <Command
      ref={rootRef}
      label={`Jump to a page, a command, or one of the ${SEARCHED}`}
      shouldFilter={false}
      loop
      className="flex flex-col"
    >
      <ActiveOption rootRef={rootRef} />
      <div className="flex items-center gap-2 border-b-2 border-seam px-4 focus-within:border-lilac forced-colors:focus-within:border-[Highlight]">
        <Search className="size-4 shrink-0 text-ash" strokeWidth={1.75} aria-hidden="true" />
        <Command.Input
          data-autofocus
          value={search}
          onValueChange={setSearch}
          placeholder="Find an event, place, person or date"
          className="h-12 w-full min-w-0 bg-transparent font-text text-[15px] text-basalt outline-none pointer-coarse:text-base"
        />
      </div>
      <Command.List
        label="Results"
        aria-busy={entities.loading}
        className={cn(
          "max-h-[min(60dvh,480px)] overflow-y-auto [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ash",
          itemCount > 0 && "p-2"
        )}
      >
        {weekend && (
          <WeekendGroup
            key={`weekend-${generation}`}
            weekend={weekend}
            disabled={entities.stale}
            onOpen={() => go(weekendHref(weekend, pathname))}
          />
        )}
        {pages.length > 0 && (
          <Command.Group heading="Pages">
            {pages.map((page) => (
              <Command.Item key={page.id} value={`page:${page.id}`} onSelect={() => go(page.href)} className={JUMP_ITEM}>
                <span className="font-medium">{page.label}</span>
                {page.note && <span className="text-xs text-ash">{page.note}</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {commands.length > 0 && (
          <Command.Group heading="Commands">
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={`command:${command.id}`}
                onSelect={() => run(command.action)}
                className={JUMP_ITEM}
              >
                <span className="font-medium">{command.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {results && (
          <EntityGroups
            key={`entities-${generation}`}
            groups={groups}
            query={results.query}
            disabled={entities.stale}
            onOpen={go}
          />
        )}
      </Command.List>
      <JumpMessage
        query={query}
        searched={entities.query !== ""}
        hasItems={itemCount > 0}
        loading={entities.loading}
        failed={entities.failed}
      />
      <LiveRegion message={announcement} />
    </Command>
  );
}

/**
 * cmdk 1.1.1 reads the selected option for aria-activedescendant before that option re-renders,
 * so after opening or typing the input names no option or the previous one. This points the
 * input and the list at the option that is selected once it is on screen.
 */
function ActiveOption({ rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> }) {
  const value = useCommandState((state) => state.value);
  const reported = useCommandState((state) => state.selectedItemId);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const selected = root.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
    for (const el of root.querySelectorAll("[cmdk-input], [cmdk-list]")) {
      if (selected) el.setAttribute("aria-activedescendant", selected.id);
      else el.removeAttribute("aria-activedescendant");
    }
  }, [rootRef, value, reported]);
  return null;
}

/** Shown under the list: searching, a failed search, or why nothing is listed. */
function JumpMessage({
  query,
  searched,
  hasItems,
  loading,
  failed,
}: {
  query: string;
  /** False while the query is too short to search the database. */
  searched: boolean;
  hasItems: boolean;
  loading: boolean;
  failed: boolean;
}) {
  if (failed) {
    return hasItems ? (
      <p className="border-t border-seam px-5 py-2 text-xs text-ash">Could not search {SEARCHED} just now.</p>
    ) : (
      <Empty className="px-5 py-6" detail="Pages and commands still work.">
        Could not search {SEARCHED} just now.
      </Empty>
    );
  }
  if (hasItems || !query) return null;
  if (loading) {
    return <p className="px-5 py-6 text-sm text-ash">Searching {SEARCHED}.</p>;
  }
  return (
    <Empty
      className="px-5 py-6"
      detail={
        searched
          ? "Try a title, a place, a town, a name or a date such as dec 12."
          : `Type one more letter to search ${SEARCHED}.`
      }
    >
      Nothing matches &ldquo;{query}&rdquo;.
    </Empty>
  );
}
