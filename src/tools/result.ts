import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PluApiError } from "../services/plu-client.js";

export type ToolResult = CallToolResult;

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Text for every client, plus an HTML resource for the ones that render it. */
export function htmlResult(text: string, uri: string, html: string): ToolResult {
  return {
    content: [
      { type: "text", text },
      { type: "resource", resource: { uri, mimeType: "text/html", text: html } },
    ],
  };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Turns a thrown error into an `isError` result. Tool handlers should surface
 * failures to the model as content rather than crashing the server.
 */
export async function guard(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PluApiError) {
      const suffix = error.requestId ? ` (request ${error.requestId})` : "";
      return errorResult(`GetPlu API error [${error.code}]: ${error.message}${suffix}`);
    }
    const detail = error instanceof Error ? error.message : String(error);
    return errorResult(`Unexpected error: ${detail}`);
  }
}
