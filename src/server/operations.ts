// Every operation the engine offers, defined once. The HTTP routes and the MCP tools are both generated from this list.

import { z } from "zod";
import {
  BoilerplateRequest, BoilerplateResult, CompareRequest, Comparison, DiscoverRequest, DiscoverResult, Empty,
  MethodResult, ReadRequest, ReadResult, ScoreRequest, ScoreResult, SelfTestResult,
} from "@/core/schema";
import type { ScoringEngine } from "@/engine/engine";
import { OutputError } from "./errors";

export type Operation<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  title: string;
  description: string;
  input: I;
  output: O;
  readOnly: boolean;
  /** Spends Jev requests. */
  costly: boolean;
  run: (engine: ScoringEngine, input: z.output<I>) => Promise<z.input<O>> | z.input<O>;
};

const op = <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(o: Operation<I, O>) => o;

export const OPERATIONS = [
  op({
    name: "get_method", title: "Method",
    description: "How scores are made: Jev model and question version, the noise floor (changes within it are level), the score scale, the level wording and the run limit.",
    input: Empty, output: MethodResult, readOnly: true, costly: false,
    run: (e) => e.method(),
  }),
  op({
    name: "discover_pages", title: "Discover pages",
    description: "Lists a site's page URLs from its sitemap (robots.txt, then /sitemap.xml). Optional pathFilter keeps URLs whose path starts with it.",
    input: DiscoverRequest, output: DiscoverResult, readOnly: true, costly: false,
    run: (e, i) => e.discoverPages(i),
  }),
  op({
    name: "find_boilerplate", title: "Find boilerplate",
    description: "Reads the given pages and returns body lines repeated on at least `share` of them (shared banners, cookie notices). Store the lines in the profile; scoring removes them.",
    input: BoilerplateRequest, output: BoilerplateResult, readOnly: true, costly: false,
    run: (e, i) => e.findBoilerplate(i),
  }),
  op({
    name: "read_page", title: "Read page",
    description: "Returns exactly the text the scorer reads for a page: metadata and main body, with boilerplate removed.",
    input: ReadRequest, output: ReadResult, readOnly: true, costly: false,
    run: (e, i) => e.readPage(i),
  }),
  op({
    name: "score_page", title: "Score page",
    description:
      "Scores one page against its intent statement and 10 expected terms with the Jev decision model. Give page (URL, or a path with a profile) or text (a draft to score without publishing). " +
      "Inputs come from intent/expected/terms, else the page's entry in profile or profileUrl, else baseline. runs 1 to 10 (default 1). " +
      "Pass an earlier result as baseline to get the change: level when within noise floor x sqrt(1/runs + 1/baseline runs), else up or down. The returned JSON can be stored and passed back as a baseline.",
    input: ScoreRequest, output: ScoreResult, readOnly: true, costly: true,
    run: (e, i) => e.scorePage(i),
  }),
  op({
    name: "compare_results", title: "Compare results",
    description: "Compares two stored score_page results of the same page without new Jev requests. Comparable only when model, question version, terms, intent and expected terms all match.",
    input: CompareRequest, output: Comparison, readOnly: true, costly: false,
    run: (e, i) => e.compareResults(i),
  }),
  op({
    name: "self_test", title: "Self test",
    description: "Scores three practice texts whose answer is obvious; each must rank its target term first with intent fit of at least 0.75.",
    input: Empty, output: SelfTestResult, readOnly: true, costly: true,
    run: (e) => e.selfTest(),
  }),
];

export const findOperation = (name: string) => OPERATIONS.find((o) => o.name === name);

/** The single execution path: validate the input, run the engine, validate the output against the published schema. */
export async function execute(engine: ScoringEngine, name: string, raw: unknown): Promise<unknown> {
  const o = findOperation(name);
  if (!o) throw new Error(`Unknown operation ${name}`);
  const input = o.input.parse(raw ?? {});
  const out = await o.run(engine, input as never);
  const checked = o.output.safeParse(out);
  if (!checked.success) throw new OutputError(`${name} produced output outside its schema: ${checked.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  return checked.data;
}
