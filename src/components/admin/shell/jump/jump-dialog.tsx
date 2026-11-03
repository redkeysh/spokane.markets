"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { useShell } from "../shell-context";
import { JUMP_COMMANDS, JUMP_PAGES, availableCommands, type JumpCommandAction } from "./pages";

const ITEM =
  "flex cursor-default flex-col rounded-md px-3 py-2 text-sm text-basalt data-[selected=true]:bg-lilac-tint data-[selected=true]:outline-2 data-[selected=true]:-outline-offset-2 data-[selected=true]:outline-lilac data-[disabled=true]:opacity-50 forced-colors:data-[selected=true]:outline-[Highlight]";

/**
 * The command palette: every admin page by its plain name and synonyms, and the commands.
 * Opened with "/" or Ctrl+K, or from the top bar.
 */
export function JumpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { mode, setMode, singleKeys, setSingleKeys, openShortcuts } = useShell();
  const [search, setSearch] = React.useState("");
  const commands = availableCommands(JUMP_COMMANDS, { mode, singleKeys });

  const close = () => {
    onOpenChange(false);
    setSearch("");
  };

  const run = (action: JumpCommandAction) => {
    close();
    switch (action.type) {
      case "href":
        router.push(action.href);
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

  return (
    <AdminDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Jump"
      hideTitle
      size="list"
      placement="top"
      bodyClassName="p-0"
    >
      <Command label="Jump to a page or command" loop className="flex flex-col">
        <div className="flex items-center gap-2 border-b-2 border-seam px-4 focus-within:border-lilac forced-colors:focus-within:border-[Highlight]">
          <Search className="size-4 shrink-0 text-ash" strokeWidth={1.75} aria-hidden="true" />
          <Command.Input
            data-autofocus
            value={search}
            onValueChange={setSearch}
            placeholder="Jump to a page or command"
            className="h-12 w-full bg-transparent font-text text-[15px] text-basalt outline-none pointer-coarse:text-base"
          />
        </div>
        <Command.List className="max-h-[min(60dvh,480px)] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ash">
          <Command.Empty className="px-3 py-6 text-[15px]/[23px] text-basalt">
            No page or command matches &ldquo;{search}&rdquo;.
          </Command.Empty>
          <Command.Group heading="Pages">
            {JUMP_PAGES.map((page) => (
              <Command.Item
                key={page.id}
                value={page.label}
                keywords={page.keywords}
                onSelect={() => run({ type: "href", href: page.href })}
                className={ITEM}
              >
                <span className="font-medium">{page.label}</span>
                {page.note && <span className="text-xs text-ash">{page.note}</span>}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Commands">
            {commands.map((command) => (
              <Command.Item
                key={command.id}
                value={command.label}
                keywords={command.keywords}
                onSelect={() => run(command.action)}
                className={ITEM}
              >
                <span className="font-medium">{command.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </AdminDialog>
  );
}
