"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { ConsentBanner } from "@/components/consent-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
      <Toaster richColors position="top-right" closeButton />
      <ConsentBanner />
    </ThemeProvider>
  );
}
