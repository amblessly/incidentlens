import { json } from "@/lib/api";
import { getDashboardData } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ dashboard: getDashboardData() });
}
