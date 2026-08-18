import { describe, expect, it, vi, afterEach } from "vitest";
import { todayISO } from "./dates";

describe("todayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Lima calendar date after UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:30:00Z"));
    expect(todayISO()).toBe("2026-08-17");
  });

  it("returns YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
