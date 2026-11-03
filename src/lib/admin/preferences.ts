import { cookies } from "next/headers";

export const ADMIN_MODE_COOKIE = "sm_admin_mode";
export const ADMIN_KEYS_COOKIE = "sm_admin_keys";

export const ADMIN_MODES = ["system", "light", "dark"] as const;
export type AdminMode = (typeof ADMIN_MODES)[number];

export type AdminPreferences = {
  mode: AdminMode;
  /** Single-letter shortcuts (WCAG 2.1.4). When off, only Ctrl or Cmd combinations work. */
  singleKeys: boolean;
};

const COOKIE_OPTIONS = {
  path: "/admin",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;

export function parseAdminMode(value: string | null | undefined): AdminMode {
  return (ADMIN_MODES as readonly string[]).includes(value ?? "") ? (value as AdminMode) : "system";
}

/** Anything but an explicit "off" keeps single-key shortcuts on. */
export function parseSingleKeys(value: string | null | undefined): boolean {
  return value !== "off";
}

export function serializeSingleKeys(on: boolean): "on" | "off" {
  return on ? "on" : "off";
}

export async function getAdminPreferences(): Promise<AdminPreferences> {
  const jar = await cookies();
  return {
    mode: parseAdminMode(jar.get(ADMIN_MODE_COOKIE)?.value),
    singleKeys: parseSingleKeys(jar.get(ADMIN_KEYS_COOKIE)?.value),
  };
}

/** Only callable from a server action or route handler. */
export async function writeAdminMode(mode: AdminMode): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_MODE_COOKIE, parseAdminMode(mode), COOKIE_OPTIONS);
}

/** Only callable from a server action or route handler. */
export async function writeSingleKeys(on: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_KEYS_COOKIE, serializeSingleKeys(on), COOKIE_OPTIONS);
}
