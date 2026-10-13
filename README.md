# seo-jev-analyzer

Measures how closely each page of a website matches the search intent you set for it, using the [TypeSafe](https://docs.typesafe.ai) decision model **Jev** as the judge of relevance. Every score comes with a band measured by calibration, and all data stays in your browser.

> Status: early build. The Guide, theme and app shell are in place; profile setup, calibration and the Dashboard are in progress. The full user guide is [docs/guide.md](docs/guide.md), also shown on the app's Guide page.

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

**Calibration.** Jev's answers vary slightly between identical runs. Setting up a profile runs every page 100 times to measure each page's standard deviation; scores are shown with a ± 2 SD band and overlapping bands count as level. A calibration is tied to the Jev version and to the inputs, and is marked stale when either changes.

**Limits.** Relevance as judged by Jev, not a search ranking or AI-answer visibility; no fact checking. See [docs/guide.md](docs/guide.md) and [docs/method.md](docs/method.md).

## Where data lives

| Data | Where |
|---|---|
| Profiles, pages, terms, intents, calibrations, runs | Your browser's IndexedDB; export and import as JSON |
| Theme choice | Your browser's local storage |
| TypeSafe API key | A server environment variable; never sent to the browser |

The server adds the key to Jev requests and fetches public pages. It stores nothing.

## Configuration

Copy `.env.example` to `.env.local` for local development. On Vercel, set the variables in the project settings and mark `TYPESAFE_API_KEY` and `APP_PASSWORD` as type **Secret**.

| Variable | Required | Purpose |
|---|---|---|
| `TYPESAFE_API_KEY` | Yes | Your own Jev API key |
| `JEV_MODEL` | No, default `jev-1.13.0` | Pinned Jev version; aliases such as `jev-latest` are refused |
| `TYPESAFE_API_URL` | No | Alternative TypeSafe endpoint |
| `APP_AUTH` | No, default `password` | `password` uses the built-in access page; `platform` relies on a platform gate such as Vercel Authentication |
| `APP_PASSWORD` | Yes, unless `APP_AUTH=platform` | Password for the built-in access page |
| `RUN_CONCURRENCY` | No, default 4 | Parallel Jev requests during calibration |

The app refuses to run in production without an access gate, because an open deployment spends your Jev credits.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npx tsx src/extract.ts https://example.com/some-page   # try the page text extractor
```

Built with Next.js, React and MUI, themed with Material Design 3 values. Light and dark themes follow the system setting by default.

## Licence

MIT
