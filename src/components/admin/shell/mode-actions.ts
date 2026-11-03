"use server";

import { parseAdminMode, writeAdminMode, writeSingleKeys, type AdminMode } from "@/lib/admin/preferences";

/** Setting a cookie in a server action re-renders the admin layout with the new preference. */
export async function setAdminMode(mode: AdminMode): Promise<void> {
  await writeAdminMode(parseAdminMode(mode));
}

export async function setSingleKeyShortcuts(on: boolean): Promise<void> {
  await writeSingleKeys(on === true);
}
