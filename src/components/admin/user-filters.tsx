"use client";

import { UrlFilters } from "@/components/admin/rare/url-filters";
import { ROLE_ORDER, ROLE_WORDS } from "@/components/admin/user-words";

/** Search by name or email and filter by role; both live in the URL. */
export function UserFilters() {
  return (
    <UrlFilters
      label="Filter people"
      search={{ label: "Search name or email", placeholder: "Search name or email" }}
      selects={[
        {
          name: "role",
          label: "Role",
          options: [{ value: "", label: "Everyone" }, ...ROLE_ORDER.map((r) => ({ value: r, label: ROLE_WORDS[r].plural }))],
        },
      ]}
    />
  );
}
