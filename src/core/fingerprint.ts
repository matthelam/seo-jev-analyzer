// Two results are comparable when their fingerprints match: same model, question wording, terms, intent and expected terms.
// The page text is deliberately excluded; a change in the text is what a before-and-after comparison measures.

import { canonical, sha256 } from "./hash";
import type { Inputs, PageText } from "./schema";

export const fingerprint = (model: string, questionVersion: string, inputs: Inputs) =>
  sha256(canonical({ model, questionVersion, terms: inputs.terms, intent: inputs.intent, expected: inputs.expected }));

export const textHash = (text: PageText) => sha256(canonical(text));
