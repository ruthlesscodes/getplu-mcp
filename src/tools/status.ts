import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PluApiError, type PluApi } from "../services/plu-api.js";
import { guard, result } from "./result.js";
import { z } from "zod";

const outputSchema = {
  reachable: z.boolean(),
  endpoint: z.string(),
  status: z.string().nullable(),
  service: z.string().nullable(),
  version: z.string().nullable(),
  latencyMs: z.number(),
  reason: z.string().optional(),
};

export function registerStatusTools(server: McpServer, api: PluApi): void {
  server.registerTool(
    "get_api_status",
    {
      title: "Check GetPlu API status",
      description:
        "Check whether the GetPlu API is reachable and healthy. Use this to diagnose whether a failure is on GetPlu's side before retrying anything else.",
      inputSchema: {},
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      guard(async () => {
        const startedAt = Date.now();

        try {
          const health = await api.health();
          const latencyMs = Date.now() - startedAt;
          return result(
            `GetPlu API is reachable at ${api.endpoint} — ${health.service} ${health.version}, status ${health.status} (${latencyMs}ms).`,
            {
              reachable: true,
              endpoint: api.endpoint,
              status: health.status,
              service: health.service,
              version: health.version,
              latencyMs,
            },
          );
        } catch (error) {
          // An unreachable API is a fact to report, not a tool failure.
          const latencyMs = Date.now() - startedAt;
          const reason =
            error instanceof PluApiError
              ? `${error.code}: ${error.message}`
              : error instanceof Error
                ? error.message
                : String(error);

          return result(`GetPlu API is not reachable at ${api.endpoint} — ${reason}.`, {
            reachable: false,
            endpoint: api.endpoint,
            status: null,
            service: null,
            version: null,
            latencyMs,
            reason,
          });
        }
      }),
  );
}
