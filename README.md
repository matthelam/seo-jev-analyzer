# seo-jev-analyzer

Measures how closely each page of a website matches the search intent you set for it, using the [TypeSafe](https://docs.typesafe.ai) decision model **Jev** as the judge of relevance. Use it from the web app or, through the same engine, as an MCP server for AI agents. Every score comes with a measured noise floor, and the web app keeps all data in your browser.

The full user guide is [docs/guide.md](docs/guide.md), also shown on the app's Guide page. An example profile for a fictional bouldering gym is in [public/examples/boulderfest.json](public/examples/boulderfest.json); load it from the Dashboard.

## The score

Each page gets one score from 0 to 10:

**Score = (sum of the ten term ratings) × intent fit**

| Part | Meaning | Range |
|---|---|---|
| Term rating | How central one of the page's ten expected search terms is to the page, from "not mentioned" (0) to "the page's central subject" (1) | 0 to 1 |
| Term sum | The ten ratings added; each term is worth up to one point | 0 to 10 |
| Intent fit | How fully the page answers its intent statement, the question the page must answer | 0 to 1 |
| Score | Term sum × intent fit | 0 to 10 |

Each rating is a Jev *Score* question with five described levels. Jev returns a probability per level; the rating is the probability-weighted average level divided by 4. Multiplying by intent fit discounts keyword stuffing: on one test page, a list of the ten terms scored 1.99 while a title and description that answered the question scored 3.37.

Two scores are reported per page. The **metadata score** reads only the title, meta description, Open Graph title and description, and JSON-LD text. The **page score** adds the main body text.

**Noise floor.** Jev's answers vary slightly between identical runs. The variation was measured once per Jev version: twice the largest standard deviation over 10 pages × 100 runs gives ± 0.194 for `jev-1.13.0`, the band of one score. A change between two single-run scores counts as level within ± 0.274 (0.194 × √2); averaging runs narrows it. Results compare only when the Jev version, question version, terms, intent and expected terms match.

**Evidence.** The [Jev Consistency Report](https://seo-jev-analyzer.vercel.app/guide/jev-consistency-report) scores 10 public pages 100 times each; the raw data and scripts are in [docs/evidence/jev-consistency-2026-10-14](docs/evidence/jev-consistency-2026-10-14).

**Limits.** Relevance as judged by Jev, not a search ranking or AI-answer visibility; no fact checking. See [docs/guide.md](docs/guide.md) and [docs/method.md](docs/method.md).

## Architecture

One engine does every calculation; the web app and the MCP server are two front doors to it, generated from one list of operations with one set of schemas. See [docs/architecture.md](docs/architecture.md).

```
UI (React) ──▶ client (IndexedDB, runner) ──▶ POST /api/v1/{operation} ─┐
AI agent ─────────────────────────────────────▶ /api/mcp (tools) ────────┤
                                                                          ▼
                                              operation registry ──▶ engine ──▶ core (pure)
                                                                          │
                                                       ports ◀── adapters: Jev, page reader, sitemap, profile fetcher
```

## MCP server

Endpoint `https://<your deployment>/api/mcp`, Streamable HTTP, header `Authorization: Bearer <MCP_API_KEY>`. Tools: `get_method`, `discover_pages`, `find_boilerplate`, `read_page`, `score_page`, `compare_results`, `self_test`.

A before-and-after loop for an agent:

1. `score_page` with `profileUrl` (an exported profile file at a public URL) and `page`; keep the returned JSON.
2. Edit the page, or prepare a draft.
3. `score_page` again with the kept JSON as `baseline` (and `text` for a draft). The reply's `comparison` says up, down or level for each score.

## Where data lives

| Data | Where |
|---|---|
| Profiles, pages, terms, intents, runs and results | Your browser's IndexedDB, saved automatically as they happen; export and import as JSON for backup, another browser, or the MCP `profileUrl` |
| Theme choice | Your browser's local storage |
| TypeSafe API key | A server environment variable; never sent to the browser |

The server adds the key to Jev requests and fetches public pages. It stores nothing.

## Configuration

Copy `.env.example` to `.env.local` for local development. On Vercel, set the variables in the project settings and mark `TYPESAFE_API_KEY`, `APP_PASSWORD` and `MCP_API_KEY` as type **Secret**.

| Variable | Required | Purpose |
|---|---|---|
| `TYPESAFE_API_KEY` | Yes | Your own Jev API key |
| `JEV_MODEL` | No, default `jev-1.13.0` | Pinned Jev version; aliases such as `jev-latest` are refused |
| `TYPESAFE_API_URL` | No | Alternative TypeSafe endpoint |
| `APP_AUTH` | No, default `password` | `password` uses the built-in access page; `platform` relies on a platform gate such as Vercel Authentication |
| `APP_PASSWORD` | Yes, unless `APP_AUTH=platform` | Password for the built-in access page |
| `MCP_API_KEY` | No | Bearer key for the MCP server and scripted HTTP calls, 16 characters or more. One key, or named keys separated by commas (`studio:key1,claude:key2`) so one client can be revoked alone; the caller's name is logged. MCP is off when unset |
| `RUN_CONCURRENCY` | No, default 8 | Parallel runs of a page within one score request |

The app refuses to run in production without an access gate, because an open deployment spends your Jev credits.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm test           # unit tests (core maths, hash, noise floor, profile, adapters) and HTTP/MCP parity
./tests/e2e/run-e2e.sh   # browser test after a build: setup, runs, comparison, export, import, migration, gates, MCP
npm run extract -- https://example.com/some-page   # try the page text extractor
npx tsx scripts/verify-export.ts <exported file>   # recompute every stored number in an export
```

The browser test runs with `JEV_MOCK=1` and no `TYPESAFE_API_KEY`: Jev answers are simulated and local addresses may be fetched. Test mode switches itself off whenever a real key is set.

Built with Next.js, React and MUI, themed with Material Design 3 values. Light and dark themes follow the system setting by default.

## Licence

MIT
