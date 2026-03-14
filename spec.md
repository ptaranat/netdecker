# Netdecker — Standard Metagame Tracker with Manapool Price Optimization

**Domain**: netdecker.app
**Repository**: github.com/ptaranat/netdecker

## Overview

Netdecker displays the top 5 Standard archetypes from major tabletop events, each with the highest-placing decklist and Manapool-optimized pricing. The app scrapes metagame data from mtgdecks.net and integrates with the Manapool API to provide one-click optimized purchasing.

## Architecture

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | SvelteKit (SSR) | Matches Manapool's stack (Svelte) |
| Runtime | Node.js | SvelteKit default, Railway-compatible |
| HTML Parsing | Cheerio | Server-side scraping of mtgdecks.net (SSR pages, no JS needed) |
| Database | None | In-memory cache with TTL |
| Deployment | Railway | User preference |

### High-Level Flow

```
User visits netdecker.app
        │
        ▼
SvelteKit server `load` function
        │
        ▼
Cache hit? ──yes──► Return cached data
        │
        no
        │
        ▼
1. Fetch metagame page from mtgdecks.net
2. Parse top 5 archetypes
3. For each archetype:
   a. Fetch archetype page
   b. Find highest-placing deck from a major paper event
   c. Fetch decklist page
   d. Parse mainboard (60) + sideboard (15)
4. For each decklist:
   a. Call Manapool POST /buyer/optimizer (model: "balanced")
5. Cache full result (1 hour TTL)
6. Return to client
```

## Data Sources

### mtgdecks.net — Metagame Data

**Metagame page**: `https://mtgdecks.net/Standard/metagame:recent-major-events-last-30-days`

This page uses the "Major Events (Last 30 days)" filter, pre-filtered to high-profile paper events. Sample size ~5,700 decks.

**Data to extract from metagame table** (top 5 rows, excluding "Rogue" archetype):

| Field | Source | Example |
|-------|--------|---------|
| Archetype name | Link text in "Name" column | "Izzet Lessons" |
| Archetype URL | Link href in "Name" column | `/Standard/izzet-lessons` |
| Meta share % | Text in "Meta Share" column | "11.26%" |
| Trend | Text in "Trend" column | "+7.97%" |
| Tier | Text in "Tier" column | "tier-1" |
| Deck count | Text in "Decks" column | "642" |

### mtgdecks.net — Archetype Page

**URL pattern**: `https://mtgdecks.net/Standard/{archetype-slug}`
**Example**: `https://mtgdecks.net/Standard/izzet-lessons`

The archetype page lists individual decklists in a table with columns: Rank, Name, Type, Event, Event Level, Players, Spiciness, Date, Price.

**Strategy for finding the best deck**:
- Sort by relevance (default sort) or by rank
- Select the first deck that placed at a major paper event (look for non-MTGO, non-MTGA event indicators)
- The event platform is indicated by an image with alt text like "MTGO - Magic Online" or "MTGA - Magic Arena" — skip those, pick the first paper result
- Extract the decklist URL (pattern: `/Standard/{deck-name}-decklist-by-{player}-{id}`)

**Fallback**: If no paper event deck is found in the first page of results, take the highest-ranked deck regardless of platform.

### mtgdecks.net — Decklist Page

**URL pattern**: `https://mtgdecks.net/Standard/{deck-name}-decklist-by-{player}-{id}`

**Decklist structure**:
- Page contains text "Maindeck (60)" followed by multiple `<table>` elements organized by card type (Creature, Artifact, Instant, Sorcery, Enchantment, Planeswalker, Land)
- Each card row contains: quantity (text node), card name (link text), price
- A separate `<table>` with columnheader "Sideboard [15]" contains sideboard cards in the same format

**Data to extract per card**:

| Field | Source | Example |
|-------|--------|---------|
| Quantity | Text node before link | "4" |
| Card name | Link text | "Gran-Gran" |
| Section | Table header | "mainboard" or "sideboard" |

**Deck metadata to extract**:
- Player name (from header: "Builder: {name}")
- Placement (e.g., "Top16 (4-2) 66%", "1st (5-0) 100%")
- Event name (e.g., "MTGO Standard Challenge 32 #12835309")
- Event platform (MTGO/MTGA/Paper — from image alt text)
- Date

## Manapool API Integration

**Base URL**: `https://manapool.com/api/v1`
**Auth**: Email header + access token header (stored in `.env`)
**OpenAPI spec**: Saved at `/openapi.json` in the manapool project root

### Endpoints Used

#### POST /buyer/optimizer

The primary integration point. Takes a cart of cards and returns an optimized purchase plan across multiple sellers.

**Request**:
```json
{
  "cart": [
    {
      "type": "mtg_single",
      "name": "Gran-Gran",
      "quantity_requested": 4,
      "language_ids": ["EN"],
      "finish_ids": ["NF"],
      "condition_ids": ["NM", "LP"]
    }
  ],
  "model": "balanced",
  "destination_country": "US"
}
```

- `model`: Use `"balanced"` as default (fewer packages, less risk of shipping issues)
- `condition_ids`: Accept NM and LP for budget flexibility
- `finish_ids`: Default to NF (non-foil) for competitive play pricing
- Max 100 items per request — a 75-card decklist fits in one call (unique card names, not total quantity)

**Response**: Returns optimized cart with seller assignments, per-card pricing, shipping costs, and total cost. (Refer to openapi.json for full response schema.)

#### POST /card_info

Optional enrichment endpoint. Looks up card information by name.

**Request**:
```json
{
  "card_names": ["Gran-Gran", "Steam Vents"]
}
```

**Response**: Card details including Scryfall data. Useful for displaying card images or additional metadata.

### Auth Configuration

```env
MANAPOOL_EMAIL=<user-email>
MANAPOOL_ACCESS_TOKEN=<api-access-token>
```

Headers sent with every request:
```
email: <MANAPOOL_EMAIL>
access-token: <MANAPOOL_ACCESS_TOKEN>
```

## Caching Strategy

### In-Memory Cache

```typescript
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_TTL = 60 * 60 * 1000 // 1 hour in ms
```

- **Cache key**: Single key for the full metagame result (all 5 archetypes + decklists + optimizer results)
- **Invalidation**: TTL-based only. After 1 hour, next request triggers a full refresh.
- **Cold start**: First request after deploy will be slow (~10-15 seconds for all scraping + API calls). Subsequent requests within TTL are instant.
- **No persistence**: Cache resets on deploy or server restart. This is acceptable — the data changes at most daily.

## Error Handling

### Scraping Failures

| Scenario | Strategy |
|----------|----------|
| mtgdecks.net is down | Return stale cache if available, otherwise return a user-friendly error page |
| Cloudflare challenge on HTML pages | Retry once with delay; if persistent, return error. Monitor for pattern. |
| HTML structure changes | Parsing will fail gracefully — return partial results for archetypes that succeeded |
| Archetype page has no paper event decks | Fall back to highest-ranked deck regardless of platform |

### Manapool API Failures

| Scenario | Strategy |
|----------|----------|
| 401 Unauthorized | Log error, display decklist without pricing, show message that pricing is unavailable |
| 429 Rate Limited | Respect retry-after header; for initial load, make optimizer calls sequentially with 500ms delay between calls |
| 5xx Server Error | Display decklist without pricing, show pricing unavailable message |
| Card name mismatch (optimizer can't find card) | Display the card without price, note it in the UI |

### General Principles

- Never let a single archetype failure break the entire page — display what succeeded
- Always show the decklist even if pricing fails
- Log all errors server-side for debugging
- No user-facing stack traces

## UI Design

### Single Page Layout

The app is a single page with 5 archetype sections. No routing needed beyond the index page.

### Per-Archetype Section

```
┌─────────────────────────────────────────────┐
│ #1 Izzet Lessons                            │
│ Meta share: 11.26% ▲ +7.97%  |  Tier 1     │
│ 642 decks in major events                   │
├─────────────────────────────────────────────┤
│ Best finish: 1st place by Gerschi           │
│ Event: Standard Challenge  |  10-Mar-2026   │
├─────────────────────────────────────────────┤
│ Mainboard (60)          │ Sideboard (15)    │
│                         │                   │
│ Creature (4)            │ 1 Three Steps ... │
│ 4 Gran-Gran             │ 2 Annul           │
│                         │ ...               │
│ Instant (20)            │                   │
│ 4 Abandon Attachments   │                   │
│ 4 Accumulate Wisdom     │                   │
│ ...                     │                   │
├─────────────────────────────────────────────┤
│ Optimized Price: $XXX.XX (balanced)         │
│ X sellers  |  X packages                    │
│ [Buy on Manapool]                           │
└─────────────────────────────────────────────┘
```

### Visual Aesthetic

Early 90s hacker / terminal aesthetic. Monospace throughout. Clean and minimal — not overdone.

- **Font**: Monospace system stack (`'Courier New', Courier, monospace` or a web font like JetBrains Mono / IBM Plex Mono)
- **ASCII art header**:
```
███    ██ ███████ ████████ ██████  ███████  ██████ ██   ██ ███████ ██████
████   ██ ██         ██    ██   ██ ██      ██      ██  ██  ██      ██   ██
██ ██  ██ █████      ██    ██   ██ █████   ██      █████   █████   ██████
██  ██ ██ ██         ██    ██   ██ ██      ██      ██  ██  ██      ██   ██
██   ████ ███████    ██    ██████  ███████  ██████ ██   ██ ███████ ██   ██
```
- **Color palette**: Dark background, green/amber/white text — think terminal output, not a modern SaaS dashboard
- **Borders**: ASCII box-drawing characters (`┌─┐│└─┘`) or simple `---` dividers
- **No icons, no gradients, no rounded corners** — raw text presentation
- **Data presentation**: Tables and lists rendered as monospace text, not styled cards

### Responsiveness

- Desktop: Side-by-side mainboard/sideboard
- Mobile: Stacked vertically, ASCII art scales down or is hidden
- Minimal CSS — monospace text does most of the visual work

## Project Structure

```
netdecker/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── scraper/
│   │   │   │   ├── metagame.ts      # Fetch + parse metagame page
│   │   │   │   ├── archetype.ts     # Fetch + parse archetype page
│   │   │   │   └── decklist.ts      # Fetch + parse decklist page
│   │   │   ├── manapool/
│   │   │   │   ├── client.ts        # Manapool API client (auth, base URL)
│   │   │   │   └── optimizer.ts     # POST /buyer/optimizer wrapper
│   │   │   ├── cache.ts             # In-memory TTL cache
│   │   │   └── pipeline.ts          # Orchestrates scrape → optimize → cache
│   │   └── types.ts                 # Shared TypeScript types
│   ├── routes/
│   │   └── +page.server.ts          # Server load function (entry point)
│   │   └── +page.svelte             # Main UI
│   └── app.html
├── static/
├── .env                              # MANAPOOL_EMAIL, MANAPOOL_ACCESS_TOKEN
├── svelte.config.js
├── package.json
└── spec.md
```

## Types

```typescript
interface Archetype {
  name: string
  slug: string
  url: string
  metaShare: number        // e.g., 11.26
  trend: number            // e.g., +7.97 or -1.50
  tier: string             // "tier-1", "tier-2"
  deckCount: number
}

interface Card {
  name: string
  quantity: number
}

interface Decklist {
  mainboard: Card[]
  sideboard: Card[]
  player: string
  placement: string        // e.g., "1st (5-0) 100%"
  event: string
  platform: string         // "Paper", "MTGO", "MTGA"
  date: string
  url: string
}

interface OptimizerResult {
  totalPrice: number
  sellerCount: number
  packageCount: number
  // Additional fields from optimizer response
}

interface ArchetypeWithDeck extends Archetype {
  decklist: Decklist
  optimizer: OptimizerResult | null  // null if API call failed
}
```

## Testing Plan

### Unit Tests

| Module | Test Cases |
|--------|-----------|
| `metagame.ts` | Parse a saved HTML snapshot of the metagame page; verify 5 archetypes extracted with correct names, meta shares, tiers, URLs |
| `archetype.ts` | Parse a saved HTML snapshot of an archetype page; verify correct deck URL selected; verify paper event prioritization over MTGO/MTGA |
| `decklist.ts` | Parse a saved HTML snapshot of a decklist page; verify correct card names, quantities, mainboard/sideboard split; verify metadata extraction (player, placement, event) |
| `cache.ts` | Verify cache hit within TTL; verify cache miss after TTL; verify cold start behavior |
| `optimizer.ts` | Verify correct request body formation from a Decklist; verify handling of API error responses |

### Integration Tests

| Test | Description |
|------|-------------|
| Manapool API auth | Verify credentials work with a simple `/card_info` call |
| Optimizer round-trip | Submit a known small decklist to optimizer, verify response structure |
| Full pipeline (live) | Run the complete scrape → optimize pipeline against live sites, verify end-to-end data integrity |

### Test Approach

- Save HTML snapshots of each page type (metagame, archetype, decklist) as fixtures
- Unit tests parse fixtures, not live pages — makes tests fast and deterministic
- One integration test suite for live verification (run manually, not in CI)
- Use Vitest (SvelteKit default test runner)

### Test Fixtures to Capture

```
tests/
├── fixtures/
│   ├── metagame.html              # Snapshot of major events metagame page
│   ├── archetype-izzet-lessons.html  # Snapshot of an archetype page
│   └── decklist-jussupinator.html    # Snapshot of a decklist page
└── unit/
    ├── metagame.test.ts
    ├── archetype.test.ts
    ├── decklist.test.ts
    ├── cache.test.ts
    └── optimizer.test.ts
```

## Environment Variables

```env
MANAPOOL_EMAIL=         # Manapool account email
MANAPOOL_ACCESS_TOKEN=  # Manapool API access token
CACHE_TTL=3600000       # Cache TTL in ms (default: 1 hour, optional override)
```

## Future Expansion

- **Top 10 archetypes**: Expand from 5 to 10, including tier-2 decks
- **Optimization model toggle**: Let users switch between `lowest_price`, `balanced`, `fewest_packages`
- **Format selector**: Support Pioneer, Modern, etc. (mtgdecks.net has the same URL structure for all formats)
- **Refresh button**: Allow manual cache invalidation
- **Card images**: Use Scryfall API or card_info endpoint for hover previews
