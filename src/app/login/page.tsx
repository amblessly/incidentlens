import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { appUiState } from "@/lib/ui-state";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const state = await appUiState();
  if (state.needsSetup) redirect("/setup");
  if (state.user) redirect("/dashboard");

  return <LoginForm modeLabel={state.modeLabel} isDemo={state.isDemo} />;
}