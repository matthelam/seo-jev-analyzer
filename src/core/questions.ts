// Jev question definitions for seo-jev-analyzer.
// Two requests per page: intent fit (sees the intent) and term relevance (never sees the intent).

// Changing any question or level wording changes the scale: bump this version; results and noise floors are tied to it.
export const QUESTION_VERSION = "q1";

export const INTENT_LEVELS = [
  "The page does not address the question at all.",
  "The page mentions the topic of the question but does not answer it.",
  "The page answers the question in part; key facts are missing.",
  "The page answers the question with most of the key facts.",
  "The page answers the question fully and directly, with the key facts.",
];

export const TERM_LEVELS = [
  "The term is not mentioned on the page, and its subject is not covered.",
  "The term or its subject is mentioned only in passing.",
  "The term's subject is a supporting topic of the page.",
  "The term's subject is one of the page's main topics.",
  "The term's subject is the page's central subject.",
];

import type { JudgeState as PageState } from "./text";

export function intentRequest(model: string, page: PageState, intent: string) {
  return {
    model,
    state: { page, intent },
    questions: {
      intent_fit: {
        type: "score",
        instructions:
          "How fully does the web page content in `page` answer the searcher's question in `intent`?",
        criteria: INTENT_LEVELS,
      },
    },
  };
}

export function termRequest(model: string, page: PageState, terms: string[]) {
  const questions: Record<string, unknown> = {};
  terms.forEach((t, i) => {
    questions[`t${String(i).padStart(2, "0")}`] = {
      type: "score",
      instructions: `How central is the search term "${t}" to the web page content in \`page\`?`,
      criteria: TERM_LEVELS,
    };
  });
  return { model, state: { page }, questions };
}

// Normalise a Score answer (0 to levels-1) to 0 to 1.
export const norm = (score: number, levels = 5) => score / (levels - 1);
