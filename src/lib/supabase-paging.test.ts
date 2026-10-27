import { describe, expect, it } from "vitest";
import { fetchAllRows, SUPABASE_PAGE_SIZE } from "./supabase-paging";

describe("fetchAllRows", () => {
  it("keeps requesting pages until a short page comes back", async () => {
    const rows = Array.from({ length: SUPABASE_PAGE_SIZE * 2 + 5 }, (_, i) => i);
    const calls: [number, number][] = [];
    const all = await fetchAllRows((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    });
    expect(all).toEqual(rows);
    expect(calls).toEqual([
      [0, SUPABASE_PAGE_SIZE - 1],
      [SUPABASE_PAGE_SIZE, SUPABASE_PAGE_SIZE * 2 - 1],
      [SUPABASE_PAGE_SIZE * 2, SUPABASE_PAGE_SIZE * 3 - 1],
    ]);
  });

  it("stops after one call when everything fits", async () => {
    let calls = 0;
    const all = await fetchAllRows(() => {
      calls += 1;
      return Promise.resolve({ data: [1, 2], error: null });
    });
    expect(all).toEqual([1, 2]);
    expect(calls).toBe(1);
  });

  it("throws the error message", async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});
