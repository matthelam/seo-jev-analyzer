// Validation of a page's scoring inputs, shared by the engine and the setup screen.

import { EXPECTED_COUNT, SCOPES } from "./schema";

export class InputError extends Error {}

/** Problems that stop a page from being scored; empty when ready. */
export function inputProblems(terms: string[], page: { label: string; intent: string; expected: string[] }): string[] {
  const out: string[] = [];
  if (!page.intent.trim()) out.push(`${page.label}: intent statement missing`);
  if (page.expected.length !== EXPECTED_COUNT) out.push(`${page.label}: ${page.expected.length} of ${EXPECTED_COUNT} expected terms`);
  if (new Set(page.expected).size !== page.expected.length) out.push(`${page.label}: an expected term is repeated`);
  const unknown = page.expected.filter((t) => !terms.includes(t));
  if (unknown.length) out.push(`${page.label}: not in the term list: ${unknown.join(", ")}`);
  return out;
}

/** Jev requests one run sends: an intent request and a terms request per scope, per page, per repeat. */
export const requestsPerRun = (pages: number, runsPerPage: number) => pages * SCOPES.length * 2 * runsPerPage;
