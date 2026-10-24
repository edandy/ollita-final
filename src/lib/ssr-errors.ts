import { renderErrorPage } from "./error-page";

const DISCONNECT_CODES = new Set(["ECONNRESET", "EPIPE", "ECONNABORTED"]);

function errorFields(error: unknown): { name: string; message: string; code: string; unhandled: boolean; cause?: unknown } | null {
  if (error == null) return null;
  if (typeof error === "string") {
    return { name: "", message: error, code: "", unhandled: false };
  }
  if (typeof error !== "object") return null;
  const e = error as { name?: unknown; message?: unknown; code?: unknown; unhandled?: unknown; cause?: unknown };
  return {
    name: typeof e.name === "string" ? e.name : "",
    message: typeof e.message === "string" ? e.message : "",
    code: typeof e.code === "string" ? e.code : "",
    unhandled: e.unhandled === true,
    cause: e.cause,
  };
}

export function isClientDisconnect(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    const fields = errorFields(current);
    if (!fields) return false;
    if (fields.name === "AbortError") return true;
    if (DISCONNECT_CODES.has(fields.code)) return true;
    const text = `${fields.message} ${fields.code}`.toLowerCase();
    if (text.includes("aborted") || text.includes("econnreset") || text.includes("epipe")) return true;
    if (fields.unhandled && text.includes("aborted")) return true;
    current = fields.cause;
  }
  return false;
}

export function isSwallowedHttpError(body: string) {
  return body.includes('"unhandled":true') && body.includes('"message":"HTTPError"');
}

export function clientClosedResponse() {
  return new Response(null, { status: 499, statusText: "Client Closed Request" });
}

export function ssrCrashResponse() {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function responseForSwallowedSsr({
  capturedError,
  requestAborted,
}: {
  body?: string;
  capturedError?: unknown;
  requestAborted?: boolean;
}) {
  if (requestAborted || isClientDisconnect(capturedError)) return clientClosedResponse();
  return ssrCrashResponse();
}

export function responseForSsrFailure(error: unknown, requestAborted?: boolean) {
  if (requestAborted || isClientDisconnect(error)) return clientClosedResponse();
  return ssrCrashResponse();
}
