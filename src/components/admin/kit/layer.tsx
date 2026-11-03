"use client";

import { useContext, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DialogPortalContext } from "@/components/ui/dialog";

const noopSubscribe = () => () => {};

/** True after hydration; portals render only on the client. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Renders into the admin's #sm-layer (inside the theme scope, z-index 40) so popovers, menus and
 * tooltips inherit the admin tokens. Falls back to document.body outside the admin shell.
 */
export function LayerPortal({ children }: { children: ReactNode }) {
  const layer = useContext(DialogPortalContext);
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(children, layer ?? document.body);
}
