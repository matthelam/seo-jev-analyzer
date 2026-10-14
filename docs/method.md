# Method

## 1. Inputs

| Input | Content |
|---|---|
| Key terms | The site's search terms, one to three words each, covering the whole site. Every term sits in the expected top 10 of at least one page. Brand name and city excluded |
| Intent statements | One per page: the question the page must answer |
| Expected top 10 | An ordered list of 10 terms per page, drawn from the key terms |
| Page set | The URLs to score, from the sitemap, confirmed by a person |

A page with no intent statement or no expected top 10 cannot be scored.

## 2. Page text

1. Fetch the URL; follow redirects; reject non-HTML.
2. Metadata: page title, meta description, Open Graph title and description, and the text values of every JSON-LD block.
3. Body: the text inside `<main>`; else `role="main"`; else `<body>`. In every case remove invisible elements (`script`, `style`, `noscript`, `template`, `svg`, `iframe`, hidden) and site chrome (`header`, `nav`, `footer`, `aside` and their ARIA roles).
4. Boilerplate: remove every body line held in the profile's boilerplate list. The list holds lines found on 80% or more of the profile's ticked pages, and is found again when the set of ticked pages changes.
5. Send to Jev as one state with two named fields, `meta` and `body`.

## 3. Jev questions

Each page gets four requests: intent fit and term relevance, each on the metadata alone and on metadata plus body. The intent statement never reaches the term questions.

| Question | Type | Count | State | Levels (low to high) |
|---|---|---|---|---|
| Intent fit | Score | 1 | Page text and the intent statement | Does not address the intent · Mentions the topic without answering · Answers in part, key facts missing · Answers with most key facts · Answers fully and directly with the key facts |
| Term relevance | Score | One per term | Page text only | Not mentioned · Mentioned in passing · A supporting topic · A main topic · The page's central subject |

Ratings are normalised to 0 to 1 (score divided by 4).

## 3a. The score

Score = (sum of the ratings of the page's ten expected terms) × intent fit, 0 to 10. Computed separately for the metadata scope (metadata score) and the metadata-plus-body scope (page score). The profile score is the mean across pages.

## 4. Noise floor

1. Measured once per Jev version and question version, not per profile: 10 public pages, text frozen, 100 runs each on both scopes (the Jev Consistency Report).
2. Noise floor = 2 × the largest score SD found. For `jev-1.13.0` with `q1`: ± 0.19.
3. A model or question version without a measured floor is refused.
4. Self test: three practice texts with an obvious answer each must rank their target term first and score intent fit at 0.75 or above.

## 5. Scoring and comparison

1. Run all four requests once per page, or 2 to 10 times and take the mean (the SD is reported).
2. Metadata score and page score, each shown with the noise floor as its band.
3. A change between two scores averaging nA and nB runs is level when within the noise floor × √(1/nA + 1/nB): ± 0.274 for two single runs. Beyond it, up or down. Measured on the report data, two single runs of the noisiest page differ by more than 0.274 in 4.3% of pairs (0.3% on average across pages); a threshold of 0.194 would have flagged 16.9%.
4. Two results compare only when their fingerprints match: model version, question version, term list, intent statement and expected terms. Page text is not in the fingerprint; changing it is what a comparison measures.
5. Points available per page: each expected term's unearned share (1 − rating) and the intent discount (term sum × (1 − intent fit)), largest first.

## 6. Rules

| Rule | Requirement |
|---|---|
| Version lock | Every request names the pinned model. A response whose `model` field differs is refused |
| Comparison | Results compare only when their fingerprints match |
| One engine | The web app and the MCP server call the same engine operations; see `docs/architecture.md` |
| Read-only | The tool reads public pages and writes only to its own database |
