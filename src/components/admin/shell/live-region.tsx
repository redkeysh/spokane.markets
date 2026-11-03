"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});

/**
 * Announces decision and bulk results politely, e.g. "Published 8. Nov 7 is now 9 of 22 live."
 */
export function useAnnounce(): (message: string) => void {
  return useContext(AnnounceContext);
}

export const AnnounceProvider = AnnounceContext.Provider;

/** State for the shell's single live region; the same message twice is announced twice. */
export function useLiveRegionState(): [string, (message: string) => void] {
  const [message, setMessage] = useState("");
  const frame = useRef<number | undefined>(undefined);
  const announce = useCallback((next: string) => {
    setMessage("");
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setMessage(next));
  }, []);
  return [message, announce];
}

export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
