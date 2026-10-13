# seo-jev-analyzer

Measures how closely each page of a website matches the search intent you set for it, using the [TypeSafe](https://docs.typesafe.ai) decision model **Jev** as the judge of relevance. Jev's run-to-run variation is measured first, so every score comes with a noise band.

> Status: early build. The page text extractor (`src/extract.ts`) is in place; the setup screen, calibration and analysis views are in progress. See [docs/method.md](docs/method.md) for the full method.

## What it measures

| Item | Definition |
|---|---|
| Measured | Relevance of each page, as judged by Jev, to the page's intent statement and to your ordered key terms for that page |
| Unit | One page: its metadata and its main body content |
| Headline per page | Intent score: how fully the page answers its intent statement (0 to 1) |
| Explanatory per page | Term ranking: Jev's relevance score for each key term, ranked and compared with your expected top 10 |
| Not measured | Visibility in AI answers or search rankings; robots, sitemap and canonical; writing quality |

Results describe relevance as judged by Jev. Search engines do not publish how they judge relevance, and this tool does not claim to reproduce them.

## How it works

1. **Inputs.** A list of key terms for the whole site, one intent statement per page, and an ordered list of 10 expected terms per page, all from your brand guidelines.
2. **Page selection.** The tool reads the sitemap, lists every URL, and filters it as you type a path prefix. A person confirms the page set.
3. **Page text.** Metadata (title, description, Open Graph, JSON-LD text) and the body text inside `<main>`, with navigation, header, footer and hidden content removed.
4. **Calibration.** Every page is scored 100 times, unchanged, to measure how much Jev's scores vary. The result is a standard deviation stored with the project, tied to the Jev version and the inputs.
5. **Analysis.** A page is scored once and each score is shown with a band of plus or minus 2 standard deviations. Terms whose bands overlap are marked as tied.

## Configuration

Copy `.env.example` and fill in your own values. On Vercel, store `TYPESAFE_API_KEY`, `DATABASE_URL` and `APP_PASSWORD` as environment variables of type **Secret**.

| Variable | Required | Purpose |
|---|---|---|
| `TYPESAFE_API_KEY` | Yes | Your own Jev API key |
| `JEV_MODEL` | No, default `jev-1.13.0` | Pinned Jev version; aliases such as `jev-latest` are refused |
| `TYPESAFE_API_URL` | No | Alternative TypeSafe endpoint |
| `DATABASE_URL` | Yes | Postgres connection string |
| `APP_AUTH` | No, default `password` | `password` uses the built-in access page; `platform` relies on a platform gate such as Vercel Authentication |
| `APP_PASSWORD` | Yes, unless `APP_AUTH=platform` | Password for the built-in access page |
| `RUN_CONCURRENCY` | No, default 4 | Parallel Jev requests during calibration |

The app refuses to start in production without an access gate, because an open deployment spends your Jev credits.

## Try the extractor

```bash
npm install
npx tsx src/extract.ts https://example.com/some-page
```

## Licence

MIT
