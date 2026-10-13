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
4. Site pass: remove any body line that appears on 80% or more of the selected pages.
5. Send to Jev as one state with two named fields, `meta` and `body`.

## 3. Jev questions

Each page gets two requests, so the intent statement never reaches the term questions.

| Question | Type | Count | State | Levels (low to high) |
|---|---|---|---|---|
| Intent fit | Score | 1 | Page text and the intent statement | Does not address the intent · Mentions the topic without answering · Answers in part, key facts missing · Answers with most key facts · Answers fully and directly with the key facts |
| Term relevance | Score | One per term | Page text only | Not mentioned · Mentioned in passing · A supporting topic · A main topic · The page's central subject |

Scores are normalised to 0 to 1 (score divided by 4).

## 4. Calibration

1. Run both requests 100 times per page, unchanged. No early exit.
2. For every page, intent and term pair: mean and standard deviation (SD) of the 100 scores.
3. Site SD = mean of all pair SDs, stored separately for intent fit and term relevance.
4. Flag any pair whose scores split into two clusters.
5. Question check: three practice texts with an obvious answer each must rank their target term first and score intent fit at 0.75 or above.
6. Store the calibration with the model version and a fingerprint of the terms, intents, expected lists, question text and page set.

## 5. Analysis

1. Run both requests once per selected page.
2. Intent score with its band: score ± 2 × site SD.
3. Term ranking sorted by score; each term shown with its band.
4. Adjacent terms whose gap is less than 2 × √2 × site SD are marked as tied.
5. Top-10 agreement: count of expected terms in the observed top 10 (0 to 10), plus their positions.

## 6. Rules

| Rule | Requirement |
|---|---|
| Version lock | Every request names the pinned model. A response whose `model` field differs is discarded and the calibration marked stale |
| Staleness | A change to the model version, terms, intents, expected lists, question text or page set marks the calibration stale. A stale project cannot analyse until recalibrated |
| No time expiry | Calibrations do not expire by age |
| Comparison | Results compare only when scored under the same calibration |
| Read-only | The tool reads public pages and writes only to its own database |
