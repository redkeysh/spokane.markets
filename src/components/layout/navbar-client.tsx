"use client";

import * as React from "react";
import Link from "next/link";
import {
  Menu,
  X,
  Home,
  Bell,
  User,
  LayoutDashboard,
  Store,
  Shield,
  LogOut,
  Calendar,
  Inbox,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { NotificationBell } from "@/components/notification-bell";
import { SiteLogo } from "@/components/layout/site-logo";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthGate } from "@/components/auth-gate";
import type { Session } from "@/lib/auth";

function getNavLinks(session: Session | null) {
  const base = [
    { href: "/", label: "Home", icon: Home },
    { href: "/events", label: "Events", icon: Calendar },
    { href: "/vendors", label: "Vendors", icon: Store },
    { href: "/submit", label: "Submit Event", icon: Inbox },
  ];
  if (session?.user?.role === "VENDOR" || session?.user?.role === "ORGANIZER") {
    base.push({ href: "/vendor-survey", label: "Vendor Survey" });
  }
  return base;
}

interface NavbarClientProps {
  session: Session | null;
  unreadCount?: number;
}

export function NavbarClient({ session, unreadCount = 0 }: NavbarClientProps) {
  const navLinks = React.useMemo(
    () => getNavLinks(session),
    [session]
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-nav/95 backdrop-blur supports-[backdrop-filter]:bg-nav/95">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <SiteLogo />

        {/* Desktop nav */}
        <div className="hidden md:flex md:items-center md:gap-10">
          {navLinks.map((link) => {
            const Icon = "icon" in link ? link.icon : null;
            const linkEl = (
              <Link
                href={link.href}
                prefetch={false}
                className="flex items-center gap-2 text-base font-medium text-link transition-colors hover:text-link/90 hover:underline"
              >
                {Icon && <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />}
                {link.label}
              </Link>
            );
            return link.href === "/submit" ? (
              <AuthGate key={link.href} session={session} callbackUrl="/submit">
                {linkEl}
              </AuthGate>
            ) : (
              <React.Fragment key={link.href}>{linkEl}</React.Fragment>
            );
          })}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex md:items-center md:gap-3">
          <ThemeToggle />
          {session && (
            <NotificationBell unreadCount={unreadCount} />
          )}
          {session ? (
            <UserMenu session={session} />
          ) : (
            <>
              <Button asChild variant="ghost" size="default">
                <Link href="/auth/signin" prefetch={false}>Sign In</Link>
              </Button>
              <Button asChild size="default">
                <Link href="/auth/signup" prefetch={false}>Sign Up</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <MobileNav session={session} navLinks={navLinks} unreadCount={unreadCount} />
      </nav>
    </header>
  );
}

function MobileNav({
  session,
  navLinks,
  unreadCount = 0,
}: {
  session: Session | null;
  navLinks: Array<{ href: string; label: string; icon?: React.ComponentType<{ className?: string }> }>;
  unreadCount?: number;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-0 top-20 z-50 flex h-[calc(100vh-5rem)] w-64 flex-col gap-4 overflow-y-auto border-l border-border bg-nav p-4 shadow-lg">
            {!session && (
              <div className="flex flex-col gap-2 pb-2 border-b border-border">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/auth/signin" prefetch={false} onClick={() => setOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild size="sm" className="w-full">
                  <Link href="/auth/signup" prefetch={false} onClick={() => setOpen(false)}>
                    Sign Up
                  </Link>
                </Button>
              </div>
            )}
            {navLinks.map((link) => {
              const Icon = "icon" in link ? link.icon : null;
              const linkEl = (
                <Link
                  href={link.href}
                  prefetch={false}
                  className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  {Icon && <Icon className="h-4 w-4" aria-hidden />}
                  {link.label}
                </Link>
              );
              return link.href === "/submit" ? (
                <AuthGate key={link.href} session={session} callbackUrl="/submit">
                  {linkEl}
                </AuthGate>
              ) : (
                <React.Fragment key={link.href}>{linkEl}</React.Fragment>
              );
            })}
            <div className="flex-1" aria-hidden />
            {session ? (
              <>
                <div className="flex flex-col gap-4 border-t border-border pt-4">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    <User className="h-4 w-4" aria-hidden />
                    My Account
                  </Link>
                  {session.user?.role === "ADMIN" && (
                    <Link
                      href="/admin"
                      className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      <Shield className="h-4 w-4" aria-hidden />
                      Admin
                    </Link>
                  )}
                  {session.user?.role === "ORGANIZER" && (
                    <Link
                      href="/organizer/dashboard"
                      className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      <LayoutDashboard className="h-4 w-4" aria-hidden />
                      Organizer Dashboard
                    </Link>
                  )}
                  {(session.user?.role === "VENDOR" || session.user?.role === "ORGANIZER") && (
                    <Link
                      href="/vendor/dashboard"
                      className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      <Store className="h-4 w-4" aria-hidden />
                      Vendor Dashboard
                    </Link>
                  )}
                  <Link
                    href="/notifications"
                    className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    <Bell className="h-4 w-4" aria-hidden />
                    Notifications
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                  <ThemeToggle showLabel />
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      await authClient.signOut();
                      window.location.href = "/";
                    }}
                    className="flex items-center gap-2 text-sm font-medium text-link transition-colors hover:text-link/90 hover:underline text-left"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <ThemeToggle showLabel />
            )}
          </div>
        </>
      )}
    </div>
  );
}
