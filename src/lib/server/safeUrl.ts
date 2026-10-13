// Refuse requests to local or private addresses so the server cannot be used to probe a private network.

import { MOCK } from "./config";

const PRIVATE = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./,
  /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i, /\.local$/i, /\.internal$/i,
];

export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https addresses are allowed");
  if (!MOCK && PRIVATE.some((r) => r.test(u.hostname))) throw new Error("Local and private addresses are not allowed");
  return u;
}

export const USER_AGENT = "seo-jev-analyzer/0.1 (+https://github.com/matthelam/seo-jev-analyzer)";
