import { Header } from "@/components/app/header";
import { DesktopSidebar } from "@/components/app/nav";
import type { UiState } from "@/lib/ui-state";

export function AppShell({
  children,
  mode,
  isDemo,
  modeLabel,
  user,
}: {
  children: React.ReactNode;
} & Pick<UiState, "mode" | "isDemo" | "modeLabel" | "user">) {
  return (
    <div className="flex min-h-dvh w-full">
      <DesktopSidebar isDemo={isDemo} user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header mode={mode} modeLabel={modeLabel} user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}