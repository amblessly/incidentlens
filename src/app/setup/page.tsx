import { redirect } from "next/navigation";

import { SetupForm } from "@/components/auth/setup-form";
import { appUiState } from "@/lib/ui-state";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const state = await appUiState();
  if (!state.needsSetup) redirect("/login");

  return <SetupForm />;
}