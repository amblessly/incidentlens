"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  Plus,
  Settings,
  Siren,
  Server,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/auth/permissions";
import type { UiState } from "@/lib/ui-state";

function NavLinks({ user }: { user: UiState["user"] }) {
  const pathname = usePathname();

  const NAV = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/incidents", label: "Incidents", icon: Siren },
    { href: "/services", label: "Services", icon: Server },
    { href: "/audit", label: "Audit log", icon: ClipboardList },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const canCreate = user ? hasPermission(user.role, "incidents.create") : false;

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main navigation">
      {NAV.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "nav-hover flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
      {canCreate && (
        <Link
          href="/incidents/new"
          className={cn(
            "nav-hover mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
            pathname.startsWith("/incidents/new")
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          New incident
        </Link>
      )}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Activity className="size-4" aria-hidden />
      </span>
      <span className="font-heading text-[15px] font-semibold tracking-tight">
        IncidentLens
      </span>
    </Link>
  );
}

function SidebarFooter({ isDemo }: { isDemo: boolean }) {
  return (
    <div className="mt-auto space-y-3">
      <div className="rounded-lg border border-dashed px-2.5 py-2">
        <p className="text-xs font-medium">{isDemo ? "Demo mode" : "Live mode"}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {isDemo
            ? "Simulated incident data. No live infrastructure is queried."
            : "Connected to real infrastructure. All data comes from your provider."}
        </p>
      </div>
      <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
        Investigation agent · Clanker Cloud · read-only
      </p>
    </div>
  );
}

export function DesktopSidebar({ isDemo, user }: { isDemo: boolean; user: UiState["user"] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r px-3 py-4 lg:flex">
      <Brand />
      <NavLinks user={user} />
      <SidebarFooter isDemo={isDemo} />
    </aside>
  );
}

export function MobileNav({ user }: { user: UiState["user"] }) {
  return (
    <div className="lg:hidden">
      <NavLinks user={user} />
    </div>
  );
}

export function MobileNavButton() {
  return (
    <Button variant="outline" size="icon" className="lg:hidden" aria-label="Toggle navigation menu">
      <Siren className="size-4" aria-hidden />
    </Button>
  );
}