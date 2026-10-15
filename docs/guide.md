# Guide

## What the score measures

How closely a page matches what you intend it to be found for. You give each page an **intent statement**, the question the page must answer, and **ten expected search terms**. The score shows how well the page delivers both, as judged by the [TypeSafe](https://docs.typesafe.ai) decision model **Jev**.

## How it is calculated

Each page gets one score from 0 to 10.

**Score = (sum of the ten term ratings) × intent fit**

| Part | Meaning | Range |
|---|---|---|
| Term rating | How central one expected term is to the page, from "not mentioned" (0) to "the page's central subject" (1) | 0 to 1 |
| Term sum | The ten ratings added together; each term is worth up to one point | 0 to 10 |
| Intent fit | How fully the page answers its intent statement, from "does not address it" (0) to "answers fully and directly, with the key facts" (1) | 0 to 1 |
| Score | Term sum × intent fit | 0 to 10 |

**How Jev produces a rating.** Each rating is a Jev *Score* question with five described levels. Jev returns a probability for each level; the rating is the probability-weighted average level, divided by 4 so it runs from 0 to 1. For example, 90% on level 4 and 10% on level 3 gives (4 × 0.9 + 3 × 0.1) ÷ 4 = 0.975.

| Level | Term rating question: "How central is the search term to the page?" | Intent fit question: "How fully does the page answer the question?" |
|---|---|---|
| 0 | Not mentioned, subject not covered | Does not address the question |
| 1 | Mentioned only in passing | Mentions the topic but does not answer |
| 2 | A supporting topic | Answers in part; key facts missing |
| 3 | One of the main topics | Answers with most of the key facts |
| 4 | The page's central subject | Answers fully and directly, with the key facts |

**Why multiply.** A page stuffed with keywords can rate well on every term without answering its question. Multiplying by intent fit discounts it. A worked example on one page's metadata:

| Metadata | Term sum | Intent fit | Score |
|---|---|---|---|
| Title "Casual entry", no description | 0.68 | 0.006 | 0.00 |
| A written title and description that answer the question | 3.40 | 0.99 | 3.37 |
| A list of the ten terms | 5.44 | 0.37 | 1.99 |

## Metadata score and page score

| Score | Text Jev reads |
|---|---|
| **Metadata score** | Page title, meta description, Open Graph title and description, and the text of the JSON-LD structured data |
| **Page score** | All of the above plus the page's main body text |

The metadata score shows what search and answer engines can learn from the page's metadata alone; it is the score metadata work moves. The page score shows the whole page as a reader sees it. Metadata alone rarely exceeds about 4: a title and a description cannot make ten topics central.

The **profile score** is the mean of the page scores across a profile's pages.

## Noise floor and bands

Jev's answers vary very slightly between identical runs. That variation was measured once for each Jev version, by scoring 10 public pages 100 times each: the [Jev Consistency Report](/guide/jev-consistency-report). Twice the largest standard deviation found gives the **noise floor**: ± 0.19 for `jev-1.13.0` with question set `q1`.

Every score is shown with the noise floor as its band. A change between two scores carries the noise of both, so the threshold for a change is wider: ± 0.27 between two single-run scores (0.194 × √2), narrowing as either score averages more runs (0.194 × √(1/runs + 1/baseline runs)). A change within the threshold counts as **level**. The profile score's band is narrower, ± 0.19 ÷ √(number of pages), because it is a mean.

A score can be the mean of several runs (**Runs per page**, 1 to 10). One run is enough for most decisions; more runs help when two scores are close.

Two results compare only when they share a model version, question version, term list, intent statement and expected terms. If you edit a page's intent or expected terms, that page shows **not comparable** in the next run; the other pages still compare. A Jev version without a measured noise floor is refused.

## Setting up a profile

Start from the Dashboard. You can also import a profile file exported from this app, or load the Boulderfest example to see a complete profile.

1. **Domain and sitemap.** Enter the site address. The tool reads `robots.txt` for a sitemap, or `/sitemap.xml`, or a sitemap address you paste.
2. **Pages.** Type a path to filter the list; every URL that starts with what you type stays. Tick the pages to score.
3. **Terms and intents.** Paste the site's search terms, one per line. For each page, enter its intent statement and its ten expected terms in order.
4. **Save**, or **Save and run**. The first run finds lines repeated across the ticked pages (shared banners, cookie notices) and removes them from every page before scoring.

To change a profile later, select **Edit profile** on the Dashboard.

## Reading the Dashboard

| Element | Shows |
|---|---|
| Method banner | The Jev version, question version, noise floor, and the Jev requests one run will send |
| Saved in this browser | Confirms that work is saved automatically; hover for where it is kept |
| Score cards | Profile metadata score, profile page score, and points available |
| Band chart | Each page's metadata and page score with the noise floor as its band |
| Pages table | Each page, its intent, both scores with bands, and the change since the previous run: up, down, level or not comparable |
| Page detail | The metadata as read, each term's rating, and the points available: each term's unearned share (1 − rating) and the intent discount, largest first |

## Your data and privacy

Everything you enter and every result is saved in your browser (IndexedDB) automatically, as it happens: each page's result, each run and each profile. There is nothing to save by hand, and you can keep as many profiles as you need; switch between them with the profile selector at the top. If you stop a run or close the tab, the pages already scored are kept in a run marked failed.

The server only adds your TypeSafe key to requests and fetches public pages; it keeps nothing.

Saved data belongs to one browser at one address. Another browser, a private window or another address (such as a deployment preview link) starts empty. Clearing your browser's site data deletes your profiles.

**Export file** writes a profile, with its runs, to a JSON file. Use it to keep a backup, to open the profile in another browser (**Import** in the setup screen), or as the `profileUrl` the MCP server reads.

## Using it from an AI agent (MCP)

The same engine is available as an MCP server at `/api/mcp` (Streamable HTTP). Connect with the header `Authorization: Bearer <key>`, where the key is one held in the deployment's `MCP_API_KEY` variable (a single key, or named keys such as `studio:…,claude:…`). The tools are the operations the web app uses:

| Tool | Does |
|---|---|
| `get_method` | Jev version, question version, noise floor, scale and level wording |
| `discover_pages` | A site's page URLs from its sitemap, with an optional path filter |
| `find_boilerplate` | Lines repeated across pages, to store in a profile |
| `read_page` | The exact text the scorer reads for a page |
| `score_page` | Scores a page or a draft text; optional runs and baseline |
| `test_revision` | Scores the current page and a revision of it in one call; send only the changed fields |
| `compare_results` | Compares two stored results without new Jev requests |
| `self_test` | Scores three practice texts with obvious answers |

`score_page` takes its inputs from the request, else from the page's entry in a profile (`profile`, or `profileUrl` pointing at an exported profile file), else from `baseline`. Every result is self-contained JSON: keep it, edit the page, and score again with the kept result as `baseline` to get up, down or level. Use `text` to score a draft before publishing it.

To check changes before they go live, use `test_revision` with `page` and `revision`: only the fields you changed (`title`, `description`, `ogTitle`, `ogDescription`, `jsonLd` or `body`). The reply holds the current score, the revised score and up, down or level for each. Pass its `current` back as `baseline` with the next revision and only the revision is scored. In the web app, open a page from the dashboard and select **Test a revision**: the live text loads for editing, and each try is listed with its change.

## Limits

- The score is relevance as judged by Jev. It is not a search ranking and does not measure visibility in AI answers.
- Jev does not check facts. A wrong price can still rate well.
- Scores compare only when the Jev version, question version, terms, intent and expected terms match.
- The level descriptions are part of the measure: changing their wording changes the scale.
