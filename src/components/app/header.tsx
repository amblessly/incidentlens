"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";

import { MobileNav } from "@/components/app/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { UiState } from "@/lib/ui-state";

export function Header({
  mode,
  modeLabel,
  user,
}: Pick<UiState, "mode" | "modeLabel" | "user">) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleLogout() {
    fetch("/api/auth/me", { method: "POST" }).then(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
      <div className="flex flex-1 items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Toggle navigation menu"
            >
              <Menu className="size-4" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <MobileNav user={user} />
          </SheetContent>
        </Sheet>
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="font-medium text-foreground hover:underline">
            IncidentLens
          </Link>
          <span className="mx-1.5 text-muted-foreground/60">/</span>
          <span className="text-muted-foreground">operations console</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={
            mode === "demo"
              ? "hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 sm:inline-block dark:border-amber-500/40 dark:text-amber-400"
              : "hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 sm:inline-block dark:border-emerald-500/40 dark:text-emerald-400"
          }
          title={mode === "demo" ? "Simulated data — no real infrastructure is touched." : "Connected to real infrastructure."}
        >
          {modeLabel}
        </span>
        <ThemeToggle />
        {user && (
          <>
            <Avatar size="sm" className="cursor-pointer" title={`${user.name} (${user.role})`}>
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Log out"
              onClick={handleLogout}
            >
              <LogOut className="size-4" aria-hidden />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}