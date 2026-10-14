// Refuse requests to local or private addresses so the server cannot be used to probe a private network.

import { SIMULATED } from "../config";

const PRIVATE = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./,
  /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i, /\.local$/i, /\.internal$/i,
];

export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https addresses are allowed");
  if (!SIMULATED && PRIVATE.some((r) => r.test(u.hostname))) throw new Error("Local and private addresses are not allowed");
  return u;
}

export const USER_AGENT = "seo-jev-analyzer/0.2 (+https://github.com/matthelam/seo-jev-analyzer)";

/** fetch with the address check applied to the first URL and to every redirect. */
export async function safeFetch(url: string, init: RequestInit = {}, hops = 5): Promise<Response> {
  checkUrl(url);
  const res = await fetch(url, { ...init, redirect: "manual", cache: "no-store", headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) } });
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    if (hops <= 0) throw new Error("Too many redirects");
    return safeFetch(new URL(res.headers.get("location")!, url).toString(), init, hops - 1);
  }
  return res;
}
