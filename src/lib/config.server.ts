import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
  };
}

export function getSpacesConfig() {
  const key = process.env.SPACES_KEY;
  const secret = process.env.SPACES_SECRET;
  const bucket = process.env.SPACES_BUCKET;
  const region = process.env.SPACES_REGION;
  const derivedEndpoint = region ? `https://${region}.digitaloceanspaces.com` : "";
  const endpoint =
    process.env.SPACES_ENDPOINT && process.env.SPACES_ENDPOINT.includes(`${region}.`)
      ? process.env.SPACES_ENDPOINT
      : derivedEndpoint;
  const cdnUrl = process.env.SPACES_CDN_URL?.replace(/\/$/, "") || "";

  const missing = [
    ...(!key ? ["SPACES_KEY"] : []),
    ...(!secret ? ["SPACES_SECRET"] : []),
    ...(!bucket ? ["SPACES_BUCKET"] : []),
    ...(!region ? ["SPACES_REGION"] : []),
    ...(!endpoint ? ["SPACES_ENDPOINT"] : []),
  ];
  if (missing.length) {
    throw new Error(`Faltan variables de DigitalOcean Spaces: ${missing.join(", ")}`);
  }

  return { key: key!, secret: secret!, bucket: bucket!, region: region!, endpoint: endpoint!, cdnUrl };
}
