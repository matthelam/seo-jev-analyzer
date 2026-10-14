# Jev consistency experiment, 14 October 2026

Data behind the Jev Consistency Report at `/guide/jev-consistency-report`.

| File | Contents |
|---|---|
| `config.json` | The 10 pages: intent statement, 30 terms (10 expected), and the two metadata edits |
| `subjects.json` | Term order sent to Jev, page URL and body length |
| `results.jsonl` | One line per answer pair: page, condition, scope, run, intent fit and its probabilities, 30 term ratings, model, time |
| `results-session2.jsonl` | The same frozen text 62 minutes later: 20 runs per page and score, live metadata only (`run.ts` with 20 runs and no edits) |
| `fetch.ts` | Fetches and freezes each page's text to `pages.json` (not published: it holds third-party page text) |
| `run.ts` | Scores the frozen text; resumable; reads `TYPESAFE_API_KEY` from `.env.local` |
| `analyse2.py`, `export.py` | Statistics, then the report's data file `src/data/jev-consistency-2026-10-14.json`; run from this folder |

Rerun from the repo root:

```bash
npx tsx docs/evidence/jev-consistency-2026-10-14/fetch.ts docs/evidence/jev-consistency-2026-10-14/pages.json <the 10 URLs in config order>
npx tsx docs/evidence/jev-consistency-2026-10-14/run.ts docs/evidence/jev-consistency-2026-10-14
cd docs/evidence/jev-consistency-2026-10-14 && python3 analyse2.py && python3 export.py
```

Pages change over time, so a rerun scores different text. The consistency figures should reproduce; the scores need not.
