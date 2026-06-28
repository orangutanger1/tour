# Tour Guide — Onboarding & Auth Flow Redesign Design Spec

**Date:** 2026-06-27
**Status:** Design approved, ready for implementation planning
**Depends on:** Phase 2a auth foundation (`auth.tsx`, the auth gate in `app/_layout.tsx`),
Phase 2b ([[phase-2b-home-itinerary-state]]), the design system ([[design-system-state]]),
and the Phase 1 backend (`generate-itinerary`, `places.ts`, `llm.ts`).

## 0. Context

Device review of the shipped app surfaced flow/UX problems: a bare sign-in wall first,
route-name headers ("index"/"onboarding"), the signed-in email dumped at the bottom of home,
ambiguous budget/pace labels, a plain location field, and a 14-day cap. Research confirms
**delayed registration** (sign-in at the *end*, after the user feels value) beats an upfront
auth wall for conversion and retention. This spec restructures the flow accordingly and fixes
the UX issues. It spans mobile + two small backend changes.

## 1. Goal & Scope

Make the first run feel like a real product: explore and build a trip without an account, sign
in only to generate/save, with clear preference semantics and a polished sign-in screen.

**In scope:**
- **Delayed-registration flow:** public landing + onboarding; sign-in gate moved to the Generate step.
- **Auth gate restructure** in `app/_layout.tsx` (no global redirect-to-sign-in).
- **Sign-in screen redesign:** branded, Apple + Google buttons, official colored Google "G" logo.
- **Onboarding polish:** hide native headers; `$`/`$$`/`$$$` budget labels + descriptors; pace
  labelled by stops/day; **location autocomplete**; days presets + stepper, **cap 30**.
- **Account screen:** email + Sign out (replaces home's bottom email).
- **Backend:** make pace real (`buildPrompt` stops/day guidance); new `places-autocomplete` edge
  function (anon-key + rate guard).

**Out of scope:** saved trips (separate 2c spec), itinerary editing, lodging, offline, dark mode,
the deferred "future polish" (custom art, animations, microinteractions).

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Sign-in placement | **End of onboarding** (delayed registration) | Research-backed; convert after value, not before |
| Auth gate | Public landing+onboarding; gate only the Generate action | Enables explore-first; sign-in returns to Generating |
| Budget | Already filters POI price; relabel `$ / $$ / $$$` + descriptor | Backend `BUDGET_CAP` already maps low/mid/high → price level |
| Pace | Relabel by stops/day **and** add stops/day rule to `buildPrompt` | Pace was inert (bare word in prompt); make labels honest |
| Location | Autocomplete via **`places-autocomplete` edge fn** (anon key + rate guard) | Keeps Places key off-device; runs pre-sign-in |
| Days cap | **30**, presets (3·5·7·10·14) + stepper | Covers nearly all trips; bounds per-generate cost |
| Sign-in UI | Apple mark + official colored Google "G" (asset) | Store-ready, recognizable |
| Headers | `headerShown: false` on the stack; in-screen affordances | Kills route-name titles |

## 3. Architecture

### 3.1 Flow & auth gate

```
Landing (index, public)
  -> "Plan a trip" -> Onboarding (public; prefs, location, days)
     -> "Generate":
          session?  yes -> tripFlow.generate(req) -> Generating -> Itinerary
                    no  -> tripFlow.prepare(req); router.push(sign-in)
                           sign-in success -> consume pending -> generate -> Generating -> Itinerary
Returning (session on launch) -> Landing (+ account access)
```

- **`app/_layout.tsx`** — remove the redirect that forces unauthenticated users to sign-in.
  Keep `AuthProvider`/fonts/providers. The app renders the requested route regardless of session;
  sign-in is reached explicitly. (Auth still protects *data*: the generate edge function and RLS
  reject unauthenticated calls — the client just no longer walls the UI.)
- **`lib/tripFlow.tsx`** — add a pending-request seam so onboarding's choices survive the sign-in
  hop:
  - `prepare(req: GenerateRequest): void` — store `pendingRequest`.
  - `pendingRequest: GenerateRequest | null`.
  - existing `generate`, `status`, `data`, `error`, `lastRequest`, `reset` unchanged.
- **`onboarding.tsx` "Generate"** — `const req = buildRequest(state)`. If `session` →
  `tripFlow.generate(req)` + `router.push("/generating")`. Else → `tripFlow.prepare(req)` +
  `router.push("/(auth)/sign-in")`. (Profile upsert moves out of onboarding — see below.)
- **`(auth)/sign-in.tsx`** — on auth success: if `tripFlow.pendingRequest` →
  `upsertProfile(supabase, prefs)` (best-effort) + `tripFlow.generate(pendingRequest)` +
  `router.replace("/generating")`. Else → `router.replace("/")`.
- **Profile upsert** moves from onboarding to the post-sign-in step (user isn't authed during
  onboarding). The prefs travel inside `pendingRequest.prefs`.

### 3.2 Screens

```
mobile/app/
  index... NOTE: landing + onboarding must be reachable without a session.
  (app)/_layout.tsx     # MODIFY: Stack headerShown:false
  (app)/index.tsx       # MODIFY: landing; hero + CTA; signed-in -> top-right avatar -> account
  (app)/onboarding.tsx  # MODIFY: relabels, autocomplete, days presets+stepper, gated Generate
  (app)/account.tsx     # NEW: email + Sign out
  (auth)/sign-in.tsx    # MODIFY: branded; Apple + Google(+logo); consumes pendingRequest
mobile/components/ui/
  Stepper.tsx           # NEW (optional): day count control (presets + +/-), or inline in onboarding
mobile/lib/
  places.ts             # NEW: autocompletePlaces(query, signal?) -> string[] (calls edge fn)
  places.test.ts        # NEW: request shape + parse (injected fetch)
  useDebouncedValue.ts  # NEW: debounce hook for the autocomplete field
  useDebouncedValue.test.ts # NEW (pure timer logic via jest fake timers)
mobile/assets/images/
  google-g.png          # NEW: official Google "G" logo asset
```

> Routing note: today landing/onboarding sit in the `(app)` group that the gate protected. Since
> the gate no longer redirects, the group name is irrelevant to access — these routes are reachable
> without a session. No route-folder move is required; only the gate logic changes.

### 3.3 Backend

- **`supabase/_shared/llm.ts buildPrompt`** — translate pace into an explicit instruction:
  `relaxed → 2–3 stops/day`, `balanced → 4–5`, `packed → 6–8`. Add a line like:
  `Aim for about {min}–{max} stops per day based on pace={pace}.`
- **`supabase/functions/places-autocomplete/`** (NEW) — `handler.ts` + `index.ts` mirroring the
  existing edge-function pattern (pure handler + thin Deno serve). Input `{ query: string }`;
  calls Google Places Autocomplete (`places:autocomplete`) with the backend `GOOGLE_PLACES_KEY`
  and a field mask; returns `{ suggestions: string[] }` (formatted place predictions, capped ~5).
  Authorized by the public anon key (Supabase verifies the JWT/anon by default). **Rate guard:**
  reject queries < 2 chars; cap suggestions; rely on Supabase's built-in per-function limits plus
  a short in-memory throttle keyed by IP (best-effort) to bound Google-key abuse.

**Component contracts:**
- `lib/places.ts` — `autocompletePlaces(opts: { query: string; baseUrl: string; anonKey: string; fetchImpl?: typeof fetch }): Promise<string[]>`. POSTs to `${baseUrl}/functions/v1/places-autocomplete`; returns the suggestion strings; `[]` for blank/short query; throws on non-2xx. Injectable `fetch` for tests (mirrors `lib/api.ts`).
- `lib/useDebouncedValue.ts` — `useDebouncedValue<T>(value: T, delayMs: number): T`. Standard debounce.
- `places-autocomplete handler` — `handleAutocomplete(body, deps): Promise<{status, body}>` where `deps.search(query) -> Promise<string[]>`; validates query length, maps errors to status codes (400 short query, 502 upstream failure).

## 4. Budget & Pace Semantics (user-facing copy)

- **Budget** (filters which POIs appear — already enforced by `BUDGET_CAP` in `places.ts`):
  - `$ Budget` — street food, free/cheap sights, hostels & budget stays (price ≤ inexpensive)
  - `$$ Comfortable` — casual restaurants, mix of paid sights, mid-range hotels (≤ moderate)
  - `$$$ Premium` — fine dining, splurge experiences, upscale stays (≤ very expensive)
- **Pace** (stops/day, enforced via `buildPrompt`):
  - `Relaxed` — 2–3 stops/day · slow mornings, long meals
  - `Balanced` — 4–5 stops/day · a full but comfortable day
  - `Packed` — 6–8 stops/day · see as much as possible

These map to the existing `Prefs` values (`low|mid|high`, `relaxed|balanced|packed`) — labels only;
no `Prefs` type change.

## 5. Configuration / Secrets

- No new client secret. The app already ships the Supabase URL + anon key; `places-autocomplete`
  reuses those. Google `GOOGLE_PLACES_KEY` stays a backend `supabase secret`.
- `google-g.png` is a public branding asset bundled in the app.
- Per Google brand guidelines: use the official multi-color "G" mark; "Continue with Google" text.

## 6. Testing

- **`places-autocomplete handler`** — unit: short query → 400; success maps predictions → strings;
  upstream failure → 502 (injected `search`/`fetch`).
- **`buildPrompt`** — assert the prompt includes the stops/day guidance for each pace value.
- **`lib/places.ts`** — unit: posts to the function URL with the anon key, parses suggestions,
  returns `[]` for short/blank, throws on non-2xx (injected `fetch`, mirrors `api.test.ts`).
- **`lib/useDebouncedValue.ts`** — unit with jest fake timers: emits the latest value after the delay.
- **Screens / flow** — thin; no RNTL. Verified by `tsc --noEmit` (0 errors) + device smoke:
  landing → onboarding (autocomplete suggests, days to 30) → Generate while signed out → sign-in
  (Apple + Google look right) → generating → itinerary; returning user lands on landing; account
  screen shows email + signs out.

## 7. Error & Edge-Case Handling

| Case | Handling |
|---|---|
| Generate tapped while signed out | Stash `pendingRequest`; route to sign-in; resume generate on success |
| User cancels sign-in (back) | Return to onboarding; `pendingRequest` retained so they can retry Generate |
| Sign-in succeeds with no pending request (returning user via landing) | `router.replace("/")` (landing) |
| Autocomplete query < 2 chars / blank | Client skips the call; returns no suggestions |
| Autocomplete network/upstream error | Silently fall back to free-text entry (no blocking error) |
| Autocomplete debounce | 300 ms debounce to limit calls + Google cost |
| Days outside 1..30 | Stepper/preset clamps; backend still validates `tripDays >= 1` |
| Profile upsert fails post-sign-in | Best-effort; generate proceeds (prefs ride in the request) |
| Pace honored loosely by LLM | Prompt guidance is a target, not a hard cap; acceptable |

## 8. Deferred (YAGNI / later)

Saved trips (separate spec) · itinerary editing · lodging · offline · dark mode · custom
art/animations/microinteractions · multi-field address autocomplete (we return formatted strings,
not place IDs — generate already geocodes by text) · email/password auth · account editing beyond
sign-out.
