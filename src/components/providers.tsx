"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ConsentBanner } from "@/components/consent-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The admin mounts its own Toaster inside its theme scope and has no consent banner.
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
      {!isAdmin && <Toaster richColors position="top-right" closeButton />}
      {!isAdmin && <ConsentBanner />}
    </ThemeProvider>
  );
}
