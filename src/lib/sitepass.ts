// Site pass: drop body lines that appear on most selected pages (shared banners, cookie notices),
// because they inflate the same terms on every page.

export function removeRepeatedLines<T extends { body: string }>(pages: T[], share = 0.8): T[] {
  if (pages.length < 3) return pages;
  const counts = new Map<string, number>();
  for (const p of pages) for (const line of new Set(p.body.split("\n"))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const limit = Math.ceil(pages.length * share);
  return pages.map((p) => ({ ...p, body: p.body.split("\n").filter((l) => (counts.get(l) ?? 0) < limit).join("\n") }));
}
