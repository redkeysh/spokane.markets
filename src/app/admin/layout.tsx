import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Overpass, Public_Sans } from "next/font/google";
import { requireAdmin } from "@/lib/auth-utils";
import { getAdminPreferences } from "@/lib/admin/preferences";
import { getNavSignals } from "@/lib/admin/nav-signals";
import { getWeekendRail } from "@/lib/admin/weekends";
import { AdminRoot } from "@/components/admin/shell/admin-root";

const overpass = Overpass({
  subsets: ["latin"],
  display: "swap",
  variable: "--sm-font-display",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--sm-font-text",
});

export const metadata: Metadata = {
  title: {
    absolute: "Spokane Markets admin",
    template: "%s, Spokane Markets admin",
  },
};

/**
 * The root layout renders page content on the client, so before the admin shell mounts this
 * color-scheme meta is the only mode signal in the server HTML; globals.css paints the admin
 * ground from it.
 */
export async function generateViewport(): Promise<Viewport> {
  const { mode } = await getAdminPreferences();
  return { colorScheme: mode === "system" ? "light dark" : mode };
}

/** Captures the public fonts before the admin root redefines --font-heading and --font-sans. */
const PUBLIC_FONT_CAPTURE = {
  display: "contents",
  "--sm-public-heading": "var(--font-heading)",
  "--sm-public-sans": "var(--font-sans)",
} as CSSProperties;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [preferences, rail, signals] = await Promise.all([getAdminPreferences(), getWeekendRail(), getNavSignals()]);

  return (
    <div style={PUBLIC_FONT_CAPTURE}>
      <AdminRoot
        mode={preferences.mode}
        singleKeys={preferences.singleKeys}
        rail={rail}
        signals={signals}
        className={`${overpass.variable} ${publicSans.variable}`}
      >
        {children}
      </AdminRoot>
    </div>
  );
}
