# Tour Guide App — Design Spec

**Date:** 2026-06-26
**Status:** Design locked, ready for implementation planning
**Location:** `/home/myen/tour` (greenfield)

## 1. Problem & Goal

A personal tour-guide mobile app. Given a **location** and a **trip length**, it
produces a personalized, local-feel itinerary: scenic spots, local food, and
on-route lodging, ordered to minimize travel time.

**Goal:** ship an MVP that nails the core loop. Scope ruthlessly — everything
not in the core loop is deferred.

**Core loop:**

```
location + trip length + preferences
  → fetch real POIs (Google Places)
  → LLM curates: select / cluster / order + write "why a local picks this" blurbs
  → Google Routes: real travel times + optimal order, anchored at lodging
  → day-by-day itinerary
```

## 2. Architecture

**Stack:**

- **Frontend:** React Native + Expo
- **Backend:** Supabase (auth + Postgres + edge functions)
- **External APIs:** Google Places, Google Routes, an LLM provider (see §4)

**Curation pipeline (Approach A):**

1. Fetch real POIs from Google Places, filtered by budget / interest / diet.
2. LLM selects, clusters, and orders POIs, and writes the local-voice blurbs.
3. Google Routes computes real travel times and the optimal stop order,
   anchored at the day's lodging.
4. Output: structured day-by-day itinerary stored as JSONB.

**Lodging is the on-route anchor.** Each day's plan is a loop based at the
lodging; deviation is minimized for travel-time optimization. MVP recommends
lodging and deep-links out (Booking/Airbnb). In-app booking is deferred.

## 3. Data Model (Postgres)

| Table | Columns |
|---|---|
| `users` | auth identity, default preferences |
| `trips` | location, dates, preferences snapshot, itinerary (JSONB), created_at |
| `cached_pois` | place_id, payload (JSONB), fetched_at (~30d TTL) |

`trips.preferences` is a snapshot so a trip is reproducible even if the user
later changes their defaults. `cached_pois` exists to cut Places cost — see §5.

## 4. LLM Provider Decision

**Provider is open — NOT locked to Anthropic.** This is a bench-and-pick
decision: compare candidates (e.g. Gemini Flash/Pro, GPT tier, Claude) on a
sample of real itineraries for cost, quality, structured-output support, and
latency. Gemini is worth a close look given we're already in the Google
ecosystem (Places/Routes).

**Tier:** curation is judgment + voice ("why a local picks this"), so default to
a **mid-tier** model, not the cheapest. Quality here = product feel.

**Isolation:** all curation goes through one thin function:

```
curateItinerary(pois, prefs) → itinerary
```

Swapping providers = rewriting that function body. **No multi-provider
abstraction** until two providers genuinely need to run live at once (YAGNI).

**Cost levers matter more than tier:**

- Prompt-cache the stable system prompt + POI payloads.
- One curation call per day-plan (not per-POI).
- Cache POIs 30d (`cached_pois`).

## 5. Routes

**MVP:** Google Routes for travel times and ordering, **plus** manual reorder
(drag stops) and user-added custom stops.

**Why manual override:** Google Routes is weak in niche / large / off-road
regions (India and China backroads, unindexed paths). Manual reorder covers the
"I know a better way" case cheaply.

**Deferred:** full crowdsourced / user-submitted routes with travel-time
overrides. This is the same "recruit local contributors later" bet — routes are
just another contribution type. Manual reorder now is a few lines; a
route-sourcing subsystem is a separate project.

## 6. UX / Screens (MVP set)

1. **Onboarding** — interests/vibe, budget, pace. Diet/accessibility are
   optional toggles, skippable (do not block onboarding).
2. **Trip create** — location + dates (or length). One screen.
3. **Generating** — loading screen with progress steps.
4. **Itinerary** — day-by-day, map + list toggle. The core screen.
5. **POI detail** — blurb, hours, deep-link out.
6. **Edit** — drag-reorder, add/remove/swap stop, regenerate a day.
7. **Lodging picker** — pick the anchor, deep-link Booking/Airbnb.
8. **Saved trips** — list of past trips.

Anything beyond these eight is deferred.

## 7. Error Handling / Edge Cases

| Case | Handling |
|---|---|
| Places returns thin / no results (rural, obscure) | Widen radius, then tell the user honestly ("limited data here") |
| LLM returns malformed output | Structured outputs + schema validation, retry once, then fail soft |
| **LLM hallucinates a POI not in the fetched set** | Constrain prompt to provided IDs; validate every output ID against the input set and drop unknowns. This is the trust boundary. |
| Routes can't route (islands, no roads) | Fall back to straight-line order + manual reorder, flag it to the user |
| No lodging on route | Relax radius, or prompt the user to pick manually |
| Quota / rate limit hit | Backoff + serve cache |
| Offline abroad (no signal) | Cache itinerary locally; read-only offline view |
| Regeneration spam | Per-user daily regeneration cap |

## 8. Cost / Rate Limits

- **Places** — billed per request *and per field*. Use field masks; request only
  needed fields. Cache 30d. Unmasked field requests are the biggest silent cost
  leak.
- **Routes** — matrix calls are N×N. Cap stops per day (~5–8). Bounds cost and is
  better UX regardless.
- **LLM** — prompt-cache system prompt + POI payload; one call per day-plan.
- **Per-user regeneration cap** — hard daily limit. Caps cost and abuse together.
- Google's free monthly credit likely covers MVP traffic.

## 9. Testing

- **`curateItinerary` golden tests** — sample POI sets in; assert valid schema,
  every output ID ∈ input set, and day count matches trip length. This is the
  money / logic / trust path and must have a check.
- Schema-validate every LLM response at runtime, not just in tests.
- No full E2E for MVP (YAGNI).

## 10. Monetization (note only — deferred)

- **Lodging affiliate** — Booking/Airbnb affiliate commission on the deep-links
  we already emit. Natural fit, zero extra UX, best first lever.
- Free tier (N trips/month) + paid unlimited — later.
- Do not build payments infrastructure until a model is chosen.

## 11. Deferred Scope (YAGNI)

In-app booking · crowdsourced routes / contributor system · multi-provider LLM
router · social / sharing / collaboration · full offline maps · push
notifications · i18n · payments infrastructure · anything beyond basic Supabase
auth.

## 12. Open Questions for Planning

- Which LLM provider wins the bench test (§4)?
- Exact preference schema (interest taxonomy, budget bands, pace levels).
- Itinerary JSONB schema (the contract `curateItinerary` must satisfy).
- Map rendering choice on React Native (Google Maps SDK vs alternative).
