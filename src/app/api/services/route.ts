import { apiError, errorToResponse, json, requestId } from "@/lib/api";
import { requireApiAuth } from "@/lib/api-auth";
import { withLogContext } from "@/lib/log";
import { getInfrastructureProvider, providerAvailable } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

/**
 * Live services list, backed by the configured infrastructure provider.
 * In live mode with no provider configured this returns a clear error
 * rather than fake data.
 */
export async function GET(request: Request) {
  return withLogContext({ requestId: requestId(request) }, async () => {
    try {
      await requireApiAuth(request);
      if (!providerAvailable()) {
        return apiError(
          "No infrastructure provider is configured. Set INCIDENTLENS_MODE=demo or configure a Clanker connection.",
          409,
          { code: "PROVIDER_NOT_CONFIGURED", request },
        );
      }
      const provider = getInfrastructureProvider();
      const services = await provider.getServices();
      return json({ services }, undefined, request);
    } catch (error) {
      return errorToResponse(error, request);
    }
  });
}