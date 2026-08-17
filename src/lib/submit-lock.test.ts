import { describe, expect, it } from "vitest";
import { createSubmitGuard } from "./submit-lock";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSubmitGuard", () => {
  it("runs the first call and ignores a second while pending", async () => {
    const guard = createSubmitGuard();
    const first = deferred<string>();
    let calls = 0;

    const p1 = guard.run(async () => {
      calls += 1;
      return first.promise;
    });
    const p2 = guard.run(async () => {
      calls += 1;
      return "second";
    });

    expect(guard.pending).toBe(true);
    first.resolve("first");
    await expect(p1).resolves.toBe("first");
    await expect(p2).resolves.toBeUndefined();
    expect(calls).toBe(1);
    expect(guard.pending).toBe(false);
  });

  it("releases the lock after an error so a later call can run", async () => {
    const guard = createSubmitGuard();
    await expect(guard.run(async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(guard.pending).toBe(false);

    const result = await guard.run(async () => "ok");
    expect(result).toBe("ok");
  });

  it("allows a second submit after the first finishes", async () => {
    const guard = createSubmitGuard();
    expect(await guard.run(async () => 1)).toBe(1);
    expect(await guard.run(async () => 2)).toBe(2);
  });
});
