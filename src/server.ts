// IMPORTANT: ssr-shim must be the very first import so its module-init runs
// before any other module references browser globals.
import "./lib/ssr-shim";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { isSwallowedHttpError, responseForSsrFailure, responseForSwallowedSsr } from "./lib/ssr-errors";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response, request: Request): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isSwallowedHttpError(body)) return response;

  const captured = consumeLastCapturedError();
  const next = responseForSwallowedSsr({
    body,
    capturedError: captured,
    requestAborted: request.signal.aborted,
  });
  if (next.status >= 500) {
    console.error(captured ?? new Error(`h3 swallowed SSR error: ${body}`));
  }
  return next;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      const next = responseForSsrFailure(error, request.signal.aborted);
      if (next.status >= 500) console.error(error);
      return next;
    }
  },
};
