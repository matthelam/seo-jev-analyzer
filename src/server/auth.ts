// Access: the built-in password gate (cookie) for the web app, and bearer keys for MCP and scripted calls.

import { sha256 } from "@/core/hash";

export const COOKIE = "sja_auth";

/** The cookie holds a hash of the password, never the password itself. */
export const tokenFor = (password: string) => sha256(`seo-jev-analyzer:${password}`);

/**
 * MCP_API_KEY holds either one key, or named keys separated by commas: "studio:k1,claude:k2".
 * Named keys let one client be revoked without touching the others, and identify the caller in the logs.
 */
export function apiKeys(raw = process.env.MCP_API_KEY): { name: string; key: string }[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((part, i) => {
    const p = part.trim();
    const at = p.indexOf(":");
    return at > 0 ? { name: p.slice(0, at).trim(), key: p.slice(at + 1).trim() } : { name: i ? `key${i + 1}` : "default", key: p };
  }).filter((k) => k.key.length >= 16);
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The name of the key in an "Authorization: Bearer <key>" header, or null. Keys shorter than 16 characters are ignored. */
export function bearerName(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const given = header.slice(7).trim();
  let found: string | null = null;
  for (const k of apiKeys()) if (same(given, k.key)) found = k.name; // check every key: no early exit
  return found;
}

export const bearerOk = (header: string | null) => bearerName(header) !== null;
