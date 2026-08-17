import { json } from "@/lib/api";
import { listServices } from "@/lib/services/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ services: listServices() });
}
