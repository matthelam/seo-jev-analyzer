// Page filter: accepts "/climb", "climb" or a full address such as "example.com/climb"; only the path counts.
// Every page whose path starts with the result is kept.

export function filterToPath(filter: string): string {
  const f = filter.trim();
  if (!f) return "";
  if (f.startsWith("/")) return f;
  if (!/[./]/.test(f)) return `/${f}`;
  try {
    return new URL(/^https?:\/\//.test(f) ? f : `https://${f}`).pathname;
  } catch {
    return f;
  }
}

export const matchesFilter = (path: string, filter: string) => {
  const p = filterToPath(filter);
  return !p || path.startsWith(p);
};
