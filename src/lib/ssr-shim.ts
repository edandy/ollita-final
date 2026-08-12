// Cloudflare Workers don't define `window`/`document`/`navigator`/storage.
// Some third-party deps read those at module init via a bare reference, which
// throws ReferenceError and crashes the worker before any handler runs.
// We install permissive stubs that satisfy module-init code paths.
const noop = () => undefined;
const stubHandler: ProxyHandler<object> = {
  get(_t, prop) {
    if (prop === Symbol.toPrimitive) return () => "";
    if (prop === "toString") return () => "[ssr-stub]";
    return undefined;
  },
  set() {
    return true;
  },
  has() {
    return false;
  },
  apply: noop,
};
const storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
};
const g = globalThis as Record<string, unknown>;
for (const name of ["window", "document", "navigator", "self"] as const) {
  if (typeof g[name] === "undefined") {
    try {
      Object.defineProperty(globalThis, name, {
        value: new Proxy(Object.create(null), stubHandler),
        writable: true,
        configurable: true,
      });
    } catch {
      /* ignore */
    }
  }
}
for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof g[name] === "undefined") {
    try {
      Object.defineProperty(globalThis, name, {
        value: storage,
        writable: true,
        configurable: true,
      });
    } catch {
      /* ignore */
    }
  }
}
export {};