import { useCallback, useRef, useState } from "react";

export function createSubmitGuard() {
  let pending = false;

  return {
    get pending() {
      return pending;
    },
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (pending) return undefined;
      pending = true;
      try {
        return await fn();
      } finally {
        pending = false;
      }
    },
  };
}

export function useSubmitLock() {
  const guardRef = useRef(createSubmitGuard());
  const [pending, setPending] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    return guardRef.current.run(async () => {
      setPending(true);
      try {
        return await fn();
      } finally {
        setPending(false);
      }
    });
  }, []);

  return { pending, run };
}
