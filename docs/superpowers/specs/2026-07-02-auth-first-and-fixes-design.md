# Auth-first entry + bug batch — design

Date: 2026-07-02. Approved by user in-session.

## Goals

1. First screen is sign up / log in (Apple, Google, Email). Onboarding (plan-a-trip)
   shown to new users only; existing users land on their trips.
2. Remove side-to-side shake when entering/advancing plan-a-trip pages.
3. Fix blank autocomplete suggestion rows (icon with no label) for countries like "Japan".
4. Fix "can't advance past destination step" (Continue hidden under keyboard).
5. Match Apple/Google auth button typography.
6. Faster image loading for albums, galleries, trip covers.

## Decisions

- **Facebook sign-in: skipped.** Requires a Facebook Developer app + Supabase provider
  config that doesn't exist. To add later: create FB app, enable Facebook provider in
  Supabase Auth settings, add a button to `(auth)/welcome.tsx` calling
  `signInWithIdToken({ provider: "facebook", ... })` via react-native-fbsdk-next.
- **Email auth: passwordless 6-digit OTP.** One flow covers sign-up and log-in; no
  password or forgot-password screens. Manual step: Supabase dashboard → Auth →
  Email Templates → Magic Link must include `{{ .Token }}`.
- **Anonymous plan-a-trip flow removed.** Supersedes the earlier gate-only-saved-trips
  decision. `tripFlow.prepare`/`pendingRequest` and the signed-out landing die.
- **New-user detection: trip count, not which button was pressed.** After any successful
  auth: 0 trips → `/onboarding`, else → home. Users forget whether they signed up before;
  OAuth can't distinguish sign-up from log-in anyway.

## Architecture

### Auth-first routing
- `app/(app)/_layout.tsx`: `loading` → null; `!session` → `<Redirect href="/(auth)/welcome" />`.
- `app/(auth)/_layout.tsx` (new): `session` → `<Redirect href="/" />` — signed-in users
  never see auth screens; also makes post-auth navigation automatic.
- `app/(auth)/welcome.tsx` (new): hero + Continue with Apple / Continue with Google /
  Sign up with email + "Already have an account? Log in" copy toggle (same actions,
  sign-up vs log-in is presentational).
- `app/(auth)/email.tsx` (new): phase 1 email input → `signInWithEmailOtp`; phase 2
  6-digit code → `verifyEmailOtp`.
- Post-auth: `postAuthRoute(tripCount)` in `lib/postAuth.ts` returns `/onboarding` or `/`;
  caller fetches trip count via existing `listTrips`.
- Deleted: `app/(auth)/sign-in.tsx`, `app/(app)/trip-create.tsx` (dead stub),
  `tripFlow.prepare`/`pendingRequest`, signed-out branch of tabs index.

### auth.tsx additions
- `signInWithEmailOtp(email)`: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
- `verifyEmailOtp(email, token)`: `supabase.auth.verifyOtp({ email, token, type: "email" })`.

### Buttons
Custom Apple button replaces native `AppleAuthenticationButton`: black pill, Ionicons
`logo-apple`, same Text variant/size as Google row. Shared `AuthProviderButton` in the
welcome screen file (one consumer).

## Bug fixes

- **Shake**: `onboarding.tsx` `FadeInRight.springify().damping(18)` is underdamped —
  oscillates horizontally. Replace with `FadeInRight.duration(200)`.
- **Blank suggestion rows**: backend verified returning labels; client filter
  `s.text && s.placeId` added defensively in `placesClient`; springify wobble suspected
  render culprit. Device re-check after fix.
- **Continue unreachable**: onboarding CTA moves outside the ScrollView into a pinned
  footer wrapped in `KeyboardAvoidingView` (iOS `padding`).
- **Slow images**: swap RN `Image` → `expo-image` in TripCard, PhotoStack, gallery grid
  + lightbox. `source={{ uri }}` + `cacheKey: storagePath` (stable across signed-URL
  token churn), `cachePolicy="memory-disk"`, `recyclingKey` in lists. Native dep —
  rides on the already-pending EAS build (expo-updates).

## Testing

- Jest: postAuthRoute; placesClient filter; tripFlow without prepare; existing suites updated.
- tsc clean. Device smoke after new EAS build (auth flows, autocomplete, image speed).
