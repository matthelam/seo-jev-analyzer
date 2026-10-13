// Built-in password gate. The cookie holds a hash of the password, never the password itself.

export const COOKIE = "sja_auth";

export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`seo-jev-analyzer:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
