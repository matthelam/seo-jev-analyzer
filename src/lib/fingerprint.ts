// Fingerprint of everything a calibration depends on. Any change marks the calibration stale.

import type { Page, Profile } from "./types";

export function fingerprintInput(profile: Profile, pages: Page[], model: string, questionVersion: string) {
  return JSON.stringify({
    model,
    questionVersion,
    terms: profile.terms,
    pages: pages
      .filter((p) => p.included)
      .map((p) => ({ url: p.url, intent: p.intent, expected: p.expected }))
      .sort((a, b) => a.url.localeCompare(b.url)),
  });
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fingerprint(profile: Profile, pages: Page[], model: string, questionVersion: string) {
  return sha256(fingerprintInput(profile, pages, model, questionVersion));
}
