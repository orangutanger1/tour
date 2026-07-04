# Pro Paywall (RevenueCat) + Account/Passport Fixes — Design

**Date:** 2026-07-03
**Status:** Approved

## Goal

Monetize itinerary generation with a freemium soft paywall backed by RevenueCat, and fix
three account/passport UI problems: oversized gallery title hiding the Edit button,
raw email shown oversized on the account screen, and no username on accounts.

## Decisions (user-approved)

| Decision | Choice |
|---|---|
| Monetization model | Freemium soft paywall |
| Free tier | 1 generated trip lifetime (edit/regenerate flows don't exist yet; if added later they must not count as a new generation) |
| Pro | Unlimited generations |
| Products | `pro_annual_3999` $39.99/yr, `pro_monthly_599` $5.99/mo |
| Entitlement | Single `pro` entitlement, `default` offering |
| Stores | iOS only at launch (Android later: add Play products to same RC project) |
| Enforcement | Client gate + server-side check in `generate-itinerary` |
| Paywall UI | Custom screen in Sunset Soft design system (not RevenueCat templated paywalls) |

## 1. RevenueCat configuration (dashboard, manual, one-time)

- App Store Connect: sign Paid Apps agreement; create subscription group "Pro" with
  `pro_annual_3999` ($39.99/yr) and `pro_monthly_599` ($5.99/mo).
- RevenueCat: project + iOS app, App Store Connect API key, import the two products,
  create entitlement `pro` attached to both, create offering `default` with `$rc_annual`
  and `$rc_monthly` packages.
- `app_user_id` = Supabase user id via `Purchases.logIn(session.user.id)` — makes
  entitlements verifiable server-side by user id.
- Secret API key stored as Supabase secret `REVENUECAT_SECRET_KEY`.

## 2. Mobile: purchases module

New dependency `react-native-purchases` (native module → **requires new EAS build**;
the pending AsyncStorage build requirement is folded into the same build).

`mobile/lib/purchases.ts`:
- `configurePurchases()` — `Purchases.configure({ apiKey: <public iOS SDK key> })`,
  called once at app root. Public SDK key ships in the app via `app.config.ts` extra
  (public by design, like the Supabase anon key).
- `logInPurchases(userId)` / `logOutPurchases()` — wired to auth session changes in
  `lib/auth`.
- `usePro(): { isPro, loading }` — hook reading CustomerInfo (`entitlements.active["pro"]`),
  subscribed to `Purchases.addCustomerInfoUpdateListener`.
- `getOffering()`, `purchase(pkg)`, `restore()` — thin wrappers returning updated
  CustomerInfo; purchase cancellation (`userCancelled`) is not an error.
- Module is import-guarded so jest/web never load the native module (same pattern as
  other native-dep guards in the repo).

## 3. Mobile: paywall screen + gate

`app/(app)/paywall.tsx` — Sunset Soft styled:
- Hero (gradient, app value prop), benefit bullets (unlimited trips, all future Pro
  features), two price cards — annual highlighted with "Save 44%" badge, monthly as
  anchor — CTA button, "Restore Purchases" link, Terms of Service + Privacy Policy
  links (App Store review requirement; docs already exist in `docs/`).
- On successful purchase or restore that yields `pro`: `router.back()` to resume the
  interrupted flow.

Gate (client): "Plan a trip" entry points on the Trips tab (`(tabs)/index.tsx`) route to
`/paywall` instead of `/onboarding` when `!isPro && tripCount >= 1`. Trip count from the
existing `listTrips` query (non-failed trips). Gate logic lives in a pure helper
`canStartNewTrip(tripCount, isPro)` in `lib/gate.ts` for testability.

## 4. Server enforcement

Client gates are bypassable and generation spends real LLM/Places money, so
`generate-itinerary` enforces too:

- New deps in `handler.ts`: `countTotalTrips(userId)` (all-time, non-failed) and
  `hasProEntitlement(userId)`.
- In `startGenerate`, alongside the existing `countTripsToday` 429 check: if
  `countTotalTrips >= 1 && !hasProEntitlement` → `402 { error: "pro required" }`.
- `hasProEntitlement` implementation in `index.ts`: RevenueCat REST
  `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}` with
  `Authorization: Bearer ${REVENUECAT_SECRET_KEY}`; true iff `entitlements.pro` active
  (expires_date null or in future). RC API failure → fail open (allow generation) so an
  RC outage never blocks paying users; log the error. One HTTP call on a 30s+ generation
  is negligible latency. No webhooks, no entitlement tables.
- Client `lib/api.ts` maps 402 to a typed error; caller routes to paywall.

## 5. Account screen: display name, email size, username

- Display name resolution (pure helper in `lib/profile.ts`):
  `user_metadata.full_name ?? user_metadata.name ?? email local-part` (e.g. `tashany`).
  Rendered as `heading`; email drops to `caption` below it. Covers Google, Apple, and
  email-OTP sign-ins.
- Username: migration `0007_username.sql` — `alter table profiles add column username
  text unique`. Client-side `ensureUsername(client, user)` called from the account
  screen: if profile has no username, generate `<firstname><4 random digits>`
  (lowercased first word of display name, non-alphanumerics stripped, e.g.
  `tashany4821`), upsert; on unique-violation retry with new digits (max 3 attempts).
  Shown on the account screen under the display name (`@tashany4821` styled `caption`).
  Wanderlog/Polarsteps-style; no user-facing rename flow yet (YAGNI).

## 6. Gallery/passport title fix

- `gallery.tsx` header: title `variant="title"` (28px) → `heading` (20px); left group
  (`Back` + title) gets `flex-1`; title gets `numberOfLines={1}` + `shrink` so long
  location names ("Kyoto, Kyoto Prefecture, Japan") truncate with ellipsis instead of
  pushing the Edit button off-screen.
- `AlbumSection.tsx` (passport list): title gets `numberOfLines={1}` + `shrink` so the
  photo-count caption stays visible.

## Error handling

- Purchase: `userCancelled` → silent return; other store errors → inline error text on
  paywall (design-system error color), no alerts.
- Restore with no purchases → inline "No purchases to restore".
- 402 from edge fn (client raced the gate) → route to paywall.
- RC REST outage server-side → fail open + `console.error`.
- Username collision → regenerate digits, 3 attempts, then leave null (retried next
  account-screen visit).

## Testing

- **jest:** `canStartNewTrip` matrix; username generator (first-name extraction,
  strip non-alphanumerics, digit suffix, collision retry); display-name fallback chain;
  api 402 mapping.
- **deno:** `startGenerate` 402 path (trip count ≥1, entitlement false), pass path for
  Pro and for first trip, fail-open path when entitlement check throws.
- **Device (manual):** sandbox purchase, restore, gate on trip #2, paywall UI. StoreKit
  untestable in jest.

## Out of scope

- Android/Play Store products, RevenueCat webhooks, promo codes, intro offers/free
  trial, lifetime product, username rename UI, gating photo storage.
