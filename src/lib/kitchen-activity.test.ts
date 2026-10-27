import { describe, expect, it } from "vitest";
import { shouldLogActivity } from "./kitchen-activity";

describe("shouldLogActivity", () => {
  it("logs each kitchen once per day", () => {
    const seen = new Set<string>();
    expect(shouldLogActivity(seen, "olla-1", "2026-10-27")).toBe(true);
    expect(shouldLogActivity(seen, "olla-1", "2026-10-27")).toBe(false);
    expect(shouldLogActivity(seen, "olla-2", "2026-10-27")).toBe(true);
    expect(shouldLogActivity(seen, "olla-1", "2026-10-28")).toBe(true);
    expect(shouldLogActivity(seen, "", "2026-10-28")).toBe(false);
  });
});
