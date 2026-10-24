import { describe, expect, it } from "vitest";
import {
  isClientDisconnect,
  isSwallowedHttpError,
  responseForSwallowedSsr,
} from "./ssr-errors";

describe("isClientDisconnect", () => {
  it("detects Node abort / ECONNRESET / EPIPE", () => {
    expect(isClientDisconnect(Object.assign(new Error("aborted"), { code: "ECONNRESET" }))).toBe(true);
    expect(isClientDisconnect(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }))).toBe(true);
    expect(isClientDisconnect(new Error("aborted"))).toBe(true);
  });

  it("detects AbortError and a nested cause", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(isClientDisconnect(abort)).toBe(true);
    expect(isClientDisconnect({ message: "HTTPError", unhandled: true, cause: abort })).toBe(true);
  });

  it("detects h3 unhandled abort", () => {
    expect(isClientDisconnect({ unhandled: true, message: "aborted", status: 500 })).toBe(true);
  });

  it("does not treat a real app error as a disconnect", () => {
    expect(isClientDisconnect(new Error("Missing Supabase environment variable(s)"))).toBe(false);
    expect(isClientDisconnect({ unhandled: true, message: "HTTPError" })).toBe(false);
    expect(isClientDisconnect(undefined)).toBe(false);
  });
});

describe("isSwallowedHttpError", () => {
  it("matches the JSON h3 returns for unhandled throws", () => {
    expect(isSwallowedHttpError('{"status":500,"unhandled":true,"message":"HTTPError"}')).toBe(true);
    expect(isSwallowedHttpError('{"status":404,"message":"Not Found"}')).toBe(false);
  });
});

describe("responseForSwallowedSsr", () => {
  const body = '{"status":500,"unhandled":true,"message":"HTTPError"}';

  it("returns 499 with an empty body when the client hung up", async () => {
    const aborted = await responseForSwallowedSsr({
      body,
      capturedError: Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
      requestAborted: false,
    });
    expect(aborted.status).toBe(499);
    expect(await aborted.text()).toBe("");

    const flagged = await responseForSwallowedSsr({
      body,
      requestAborted: true,
    });
    expect(flagged.status).toBe(499);
  });

  it("keeps the error page for a real swallowed crash", async () => {
    const res = await responseForSwallowedSsr({
      body,
      capturedError: new Error("boom"),
      requestAborted: false,
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("This page didn't load");
  });
});
