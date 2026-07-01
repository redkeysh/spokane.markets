import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Boxes,
  ShieldCheck,
  Megaphone,
  Users,
  Settings,
  Calendar,
  Store,
  ShoppingBag,
  MapPin,
  Map,
  Tag,
  BadgeCheck,
  LayoutGrid,
  ClipboardList,
  Inbox,
  MessageSquare,
  ImageIcon,
  Flag,
  FileText,
  WandSparkles,
  Mail,
  KeyRound,
  Database,
  Activity,
  ScrollText,
} from "lucide-react";

export type AdminNavItem = { label: string; href: string; icon: LucideIcon };

export type AdminNavSection = {
  label: string;
  icon: LucideIcon;
  /** Section landing page (the first sub-item, or /admin for Overview). */
  href: string;
  /** Secondary nav shown in the content topbar; empty for a standalone section. */
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/admin", items: [] },
  {
    label: "Catalog",
    icon: Boxes,
    href: "/admin/events",
    items: [
      { label: "Events", href: "/admin/events", icon: Calendar },
      { label: "Markets", href: "/admin/markets", icon: Store },
      { label: "Vendors", href: "/admin/vendors", icon: ShoppingBag },
      { label: "Venues", href: "/admin/venues", icon: MapPin },
      { label: "Neighborhoods", href: "/admin/neighborhoods", icon: Map },
      { label: "Tags & Features", href: "/admin/tags", icon: Tag },
      { label: "Community Badges", href: "/admin/badges", icon: BadgeCheck },
      { label: "Categories", href: "/admin/categories", icon: LayoutGrid },
    ],
  },
  {
    label: "Moderation",
    icon: ShieldCheck,
    href: "/admin/queues",
    items: [
      { label: "Queues", href: "/admin/queues", icon: ClipboardList },
      { label: "Submissions", href: "/admin/submissions", icon: Inbox },
      { label: "Reviews", href: "/admin/reviews", icon: MessageSquare },
      { label: "Photos", href: "/admin/photos", icon: ImageIcon },
      { label: "Reports", href: "/admin/reports", icon: Flag },
      { label: "Applications", href: "/admin/applications", icon: FileText },
    ],
  },
  {
    label: "Growth",
    icon: Megaphone,
    href: "/admin/promotions",
    items: [
      { label: "Promotions", href: "/admin/promotions", icon: Megaphone },
      { label: "Asset Studio", href: "/admin/marketing/asset-studio", icon: WandSparkles },
    ],
  },
  {
    label: "People",
    icon: Users,
    href: "/admin/users",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Permissions", href: "/admin/permissions", icon: KeyRound },
      { label: "Subscribers", href: "/admin/subscribers", icon: Mail },
    ],
  },
  {
    label: "System",
    icon: Settings,
    href: "/admin/settings",
    items: [
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Content", href: "/admin/content", icon: FileText },
      { label: "Data", href: "/admin/data", icon: Database },
      { label: "System Health", href: "/admin/system-health", icon: Activity },
      { label: "Audit Log", href: "/admin/audit-log", icon: ScrollText },
    ],
  },
];

/** Match a pathname to a sub-item (exact or a nested route like /new, /[id]/edit). */
export function isItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Resolve the top-level section for a pathname via the longest matching sub-item. */
export function findActiveSection(pathname: string): AdminNavSection {
  if (pathname === "/admin") return ADMIN_NAV[0];
  let best: { section: AdminNavSection; len: number } | null = null;
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (isItemActive(item.href, pathname) && (!best || item.href.length > best.len)) {
        best = { section, len: item.href.length };
      }
    }
  }
  return best?.section ?? ADMIN_NAV[0];
}

export function isSectionActive(section: AdminNavSection, pathname: string): boolean {
  return findActiveSection(pathname).label === section.label;
}
