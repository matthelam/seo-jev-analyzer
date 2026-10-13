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

## Calibration and bands

Jev's answers vary very slightly between identical runs. When a profile is set up, calibration runs every page 100 times, unchanged, and measures the standard deviation (SD) of each page's score. Every later score is shown with a band of ± 2 SD. Two scores whose bands overlap are treated as level.

A calibration belongs to one Jev version and one set of inputs. Changing the model version, the terms, an intent statement, an expected list, the question wording or the page set marks it stale, and the profile must be recalibrated before new runs. Calibrations do not expire with age.

## Setting up a profile

Start from the Dashboard. You can also import a profile file exported from this app, or load the Boulderfest example to see a complete profile.

1. **Domain and sitemap.** Enter the site address. The tool reads `robots.txt` for a sitemap, or `/sitemap.xml`, or a sitemap address you paste.
2. **Pages.** Type a path to filter the list; every URL that starts with what you type stays. Tick the pages to score.
3. **Terms and intents.** Paste the site's search terms, one per line. For each page, enter its intent statement and its ten expected terms in order.
4. **Calibrate.** First checks the question wording on three practice texts, then runs every page 100 times on both scores. You can pause, close the tab and resume.

To change a profile later, select **Edit profile** on the Dashboard. Any change to the terms, intents, expected lists or pages marks the calibration stale.

## Reading the Dashboard

| Element | Shows |
|---|---|
| Calibration banner | When and with which Jev version the profile was calibrated, the site band, and when the profile was last exported |
| Score cards | Profile metadata score, profile page score, and points available |
| Band chart | Each page's metadata and page score with its band |
| Pages table | Each page, its intent, both scores with bands, and the change since the previous comparable run |
| Page detail | The metadata as read, each term's rating, and the points available: each term's unearned share (1 − rating) and the intent discount, largest first |

## Your data and privacy

Everything you enter and every result is stored in your browser (IndexedDB) and nowhere else. The server only adds your TypeSafe key to requests and fetches public pages; it keeps nothing. Clearing your browser's site data deletes your profiles, so export each profile to a JSON file after calibrating. An exported file can be imported in any browser.

## Limits

- The score is relevance as judged by Jev. It is not a search ranking and does not measure visibility in AI answers.
- Jev does not check facts. A wrong price can still rate well.
- Scores compare only between runs under the same calibration.
- The level descriptions are part of the measure: changing their wording changes the scale.
