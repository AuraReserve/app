import { getDataInput } from "@/lib/dal/data-inputs";
import { getIntegrationRegistry } from "@/lib/integrations/registry";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// POST /api/spaces/[spaceId]/data-inputs/[inputId]/run
// Runs the integration handler and returns the result.
// If ?persist=true, also creates a stream entry (full run).
// By default, only tests the handler without persisting.
export const POST = spaceRoute<{ inputId: string }>(
  { requiredAccess: "auditor", label: "run data input" },
  async ({ params, request }) => {
    const input = await getDataInput(params.inputId);
    if (!input || input.spaceId !== params.spaceId) {
      return ApiError.notFound("Data input not found");
    }

    if (input.integration.key === "manual") {
      return ApiError.badRequest("Manual inputs cannot be run programmatically");
    }

    const url = new URL(request.url);
    const persist = url.searchParams.get("persist") === "true";

    const registry = getIntegrationRegistry();
    const handler = registry.getInputHandler(input.integration.key);
    if (!handler) {
      return ApiError.badRequest(`No input handler for: ${input.integration.key}`);
    }

    const config = (input.config as Record<string, unknown>) ?? {};
    const startTime = Date.now();

    try {
      const result = await handler.run(config);
      const durationMs = Date.now() - startTime;

      if (persist && result.success) {
        // Full run: use the runner to create entry + log
        const { runSpaceIntegration } = await import("@/lib/integrations/runner");
        const runResult = await runSpaceIntegration(params.inputId);
        return ApiSuccess.ok({
          ...runResult,
          value: result.value,
          artifactData: result.artifactData,
          durationMs,
          persisted: true,
        });
      }

      // Test mode: return result without persisting
      return ApiSuccess.ok({
        success: result.success,
        message: result.message || result.error,
        value: result.value,
        artifactData: result.artifactData,
        durationMs,
        persisted: false,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Unknown error";
      return ApiSuccess.ok({
        success: false,
        message: `Integration run failed: ${message}`,
        durationMs,
        persisted: false,
      });
    }
  }
);
