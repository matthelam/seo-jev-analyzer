# Architecture

## Principle

One engine performs every function. The web app and the MCP server are two front doors to the same engine, through the same operation definitions and the same input and output schemas. Nothing that decides a number exists in more than one place.

## Layers

| Layer | Folder | Holds | May depend on |
|---|---|---|---|
| Core | `src/core` | Pure domain logic: question wording, the score, points available, the noise floor and comparison, fingerprints, boilerplate removal, the profile document, schemas | Nothing outside the core (runs in the browser and on the server) |
| Ports | `src/engine/ports.ts` | Interfaces the engine needs from the outside world: `Judge`, `PageReader`, `SiteMapper`, `DocumentFetcher` | Core types |
| Engine | `src/engine` | Application service: one method per use case | Core, ports |
| Adapters | `src/adapters` | Implementations of the ports: TypeSafe Jev over HTTP, simulated Jev for tests, HTML page reader, sitemap reader, profile fetcher, configuration | Core, ports, Node and network |
| Delivery | `src/server`, `src/app/api` | The operation registry, the HTTP routes, the MCP server, authentication, the composition root that wires adapters into the engine | Engine, adapters, core |
| Client | `src/client` | Browser data store, HTTP client for the operations, the runner that scores a profile's pages and stores the results | Core, HTTP operations |
| UI | `src/ui`, `src/app` pages | React screens | Client, core |

Dependencies point inwards only. The engine receives its adapters through its constructor, so tests and the simulated mode swap them without touching the engine.

## Operations

`src/server/operations.ts` defines each operation once: name, description, input schema, output schema and handler. The HTTP route `/api/v1/{operation}` and the MCP tool of the same name are generated from that one list, so they cannot drift.

| Operation | HTTP | MCP tool | Does |
|---|---|---|---|
| Method | `POST /api/v1/get_method` | `get_method` | Model version, question version, noise floor, scale, level wording, limits |
| Discover pages | `POST /api/v1/discover_pages` | `discover_pages` | Reads a site's sitemap; optional path filter |
| Find boilerplate | `POST /api/v1/find_boilerplate` | `find_boilerplate` | Lines repeated on 80% or more of the given pages |
| Read page | `POST /api/v1/read_page` | `read_page` | The text the scorer reads for a URL: metadata and main body, boilerplate removed |
| Score page | `POST /api/v1/score_page` | `score_page` | Scores a URL or supplied text; optional runs, scopes and baseline |
| Compare results | `POST /api/v1/compare_results` | `compare_results` | Compares two stored results without new Jev requests |
| Self test | `POST /api/v1/self_test` | `self_test` | Scores three practice texts with obvious answers |

## Score page

Inputs come from, in order of precedence: fields in the request; the page's entry in a profile (`profile` inline or `profileUrl`); the inputs carried by `baseline`.

| Input | Meaning |
|---|---|
| `page` | Absolute URL, or a path resolved against the profile's domain |
| `text` | Metadata and body to score instead of fetching the page (drafts) |
| `intent`, `expected`, `terms` | Intent statement, 10 expected terms in order, full term list |
| `profile` / `profileUrl` | A profile document, inline or at a URL |
| `boilerplate` | Lines to remove from the body; defaults to the profile's list |
| `runs` | 1 to 10; default 1 |
| `scopes` | `meta`, `page` or both; default both |
| `baseline` | An earlier result; the reply then includes the comparison |

The result is self-contained: it carries its inputs, model, question version, fingerprint and text hash, so any result can be passed back later as a baseline.

## Noise floor

Per-profile calibration is replaced by one noise floor per Jev version and question version, measured once and published with its evidence (the Jev Consistency Report). For `jev-1.13.0` with questions `q1` the floor is ±0.194: the band of one single-run score. A change between two scores is level within floor × √(1/nA + 1/nB), ±0.274 for two single runs. A model or question version without a measured floor is refused.

## Comparability

Two results are comparable when their fingerprints match. The fingerprint covers the model, question version, term list, intent statement and expected terms. The page text is not in the fingerprint: changing the text is what a before-and-after comparison measures.

## Storage

The server stores nothing. The browser stores profiles, runs and results in IndexedDB. A profile exports as a profile document, the same format `profileUrl` reads.

## Access

| Caller | Gate |
|---|---|
| Web app and its HTTP calls | Password cookie (`APP_PASSWORD`), or a platform gate with `APP_AUTH=platform` |
| MCP and scripts | `Authorization: Bearer <key>`; `MCP_API_KEY` holds one key or named keys (`name:key,…`); MCP is off when it is unset |
