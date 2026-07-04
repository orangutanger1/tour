# Pro Paywall (RevenueCat) + Account/Passport Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freemium paywall (1 free generated trip, Pro = unlimited via RevenueCat subscriptions) with server-side enforcement, plus account display-name/username and gallery-title UI fixes.

**Architecture:** Client gate (`canStartNewTrip`) routes trip #2 to a custom paywall screen backed by `react-native-purchases`; the `generate-itinerary` edge function independently enforces the limit by counting non-failed trips and checking the `pro` entitlement via RevenueCat REST (fail-open). Account screen gains OAuth display name + generated `@username` persisted in `profiles.username`.

**Tech Stack:** Expo SDK 56 / expo-router, NativeWind (Sunset Soft design system), react-native-purchases (iOS only at launch), Supabase (Postgres + Deno edge functions), jest + deno test.

**Spec:** `docs/superpowers/specs/2026-07-03-pro-paywall-account-fixes-design.md`

## Global Constraints

- Expo SDK 56: consult https://docs.expo.dev/versions/v56.0.0/ before using unfamiliar Expo APIs (repo AGENTS.md rule).
- All UI uses the existing design system (`mobile/components/ui`), never raw RN primitives with ad-hoc styles.
- Products: `pro_annual_3999` $39.99/yr, `pro_monthly_599` $5.99/mo. Entitlement id: `pro`. Offering: `default`. Free tier: **1** generated trip lifetime.
- iOS only at launch. `react-native-purchases` is a native module → **new EAS build required** before device testing (folded together with the already-pending AsyncStorage build).
- Server fails **open** on RevenueCat outage/missing secret — an entitlement-provider failure must never block generation.
- Do not push, deploy edge functions, or run `supabase db push` — those are user-gated manual steps (Task 9).
- Commands: mobile tests `cd mobile && npm test`, types `cd mobile && npx tsc --noEmit`, backend `cd supabase && deno test`.
- Commit after each task. Do not push.

---

### Task 1: Gallery + passport album title truncation

Long trip locations ("Kyoto, Kyoto Prefecture, Japan") at 28px push the gallery Edit button off-screen; passport album titles can crowd out the photo count. Pure layout fix — no logic, no new tests; existing suites guard regressions.

**Files:**
- Modify: `mobile/app/(app)/gallery.tsx:64-70`
- Modify: `mobile/components/ui/AlbumSection.tsx:12-15`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Shrink + truncate the gallery header title**

In `mobile/app/(app)/gallery.tsx`, replace the header block (lines 64-70):

```tsx
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
          <Text variant="heading" numberOfLines={1} className="shrink">{title}</Text>
        </View>
        <Button title={editing ? "Done" : "Edit"} variant="ghost" size="sm" onPress={() => setEditing((e) => !e)} />
      </View>
```

(Changes: title `variant="title"` → `heading`, left group gets `flex-1 mr-2`, title gets `numberOfLines={1}` + `shrink`.)

- [ ] **Step 2: Truncate passport album titles**

In `mobile/components/ui/AlbumSection.tsx`, replace the header row (lines 12-15):

```tsx
      <View className="flex-row items-baseline justify-between gap-3 mb-2">
        <Text variant="heading" numberOfLines={1} className="shrink">{title}</Text>
        <Text variant="caption">{photos.length} {photos.length === 1 ? "photo" : "photos"}</Text>
      </View>
```

- [ ] **Step 3: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/gallery.tsx mobile/components/ui/AlbumSection.tsx
git commit -m "fix(ui): truncate long trip titles so gallery Edit button stays visible"
```

---

### Task 2: Display-name helper + account screen identity block

Show the OAuth account name (Google/Apple `user_metadata`) as the headline instead of the raw email; email drops to caption size.

**Files:**
- Modify: `mobile/lib/profile.ts` (add `displayName`)
- Modify: `mobile/lib/profile.test.ts` (add tests)
- Modify: `mobile/app/(app)/account.tsx:33-39`

**Interfaces:**
- Consumes: nothing new.
- Produces: `displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): string` exported from `mobile/lib/profile.ts`. Task 3's `ensureUsername` calls it.

- [ ] **Step 1: Write failing tests**

Append to `mobile/lib/profile.test.ts`:

```ts
import { displayName } from "./profile";

test("displayName prefers user_metadata.full_name", () => {
  expect(displayName({ email: "t@x.com", user_metadata: { full_name: "Tash Any", name: "Other" } })).toBe("Tash Any");
});

test("displayName falls back to user_metadata.name", () => {
  expect(displayName({ email: "t@x.com", user_metadata: { name: "Tash" } })).toBe("Tash");
});

test("displayName skips blank metadata names", () => {
  expect(displayName({ email: "tashany@gmail.com", user_metadata: { full_name: "  " } })).toBe("tashany");
});

test("displayName falls back to email local-part", () => {
  expect(displayName({ email: "tashany@gmail.com", user_metadata: {} })).toBe("tashany");
});

test("displayName falls back to Traveler with no data", () => {
  expect(displayName(null)).toBe("Traveler");
  expect(displayName({ email: "", user_metadata: {} })).toBe("Traveler");
});
```

(Merge the `import { displayName }` into the existing `./profile` import at the top of the file rather than adding a second import line.)

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/profile.test.ts`
Expected: FAIL — `displayName` is not exported.

- [ ] **Step 3: Implement `displayName`**

Append to `mobile/lib/profile.ts`:

```ts
// Human name for the account header: OAuth metadata (Google/Apple) first,
// then the email local-part for OTP sign-ins.
export function displayName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
): string {
  const meta = user?.user_metadata ?? {};
  const metaName = [meta.full_name, meta.name]
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (metaName) return metaName.trim();
  const local = user?.email?.split("@")[0];
  return local || "Traveler";
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Restyle the account identity card**

In `mobile/app/(app)/account.tsx`, add to the existing `./lib/profile` import:

```tsx
import { getGalleryStyle, setGalleryStyle, displayName, type GalleryStyle } from "../../lib/profile";
```

Replace the identity card (lines 33-39):

```tsx
      <Card className="flex-row items-center gap-3">
        <Icon name="person" size={20} color="#6B5560" />
        <View className="flex-1 gap-0.5">
          <Text variant="heading" numberOfLines={1}>{displayName(user)}</Text>
          {user?.email ? <Text variant="caption" numberOfLines={1}>{user.email}</Text> : null}
        </View>
      </Card>
```

(The "Signed in as" caption is replaced by the name itself; email is now caption-sized below.)

- [ ] **Step 6: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/profile.ts mobile/lib/profile.test.ts mobile/app/\(app\)/account.tsx
git commit -m "feat(account): show OAuth display name, email demoted to caption"
```

---

### Task 3: Generated username (migration + lib + account display)

Wanderlog/Polarsteps-style handle: first name + 4 random digits (e.g. `tashany4821`), generated once on account-screen visit, stored in `profiles.username` (unique).

**Files:**
- Create: `supabase/migrations/0007_username.sql`
- Modify: `mobile/lib/profile.ts` (add `generateUsername`, `ensureUsername`)
- Modify: `mobile/lib/profile.test.ts`
- Modify: `mobile/app/(app)/account.tsx`

**Interfaces:**
- Consumes: `displayName` from Task 2.
- Produces: `generateUsername(base: string, rand?: () => number): string` and `ensureUsername(client: SupabaseClient, user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }, rand?: () => number): Promise<string | null>` exported from `mobile/lib/profile.ts`. Nothing after this task depends on them.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_username.sql`:

```sql
-- supabase/migrations/0007_username.sql
-- Public handle, Wanderlog-style: firstname + 4 digits. Generated client-side
-- on first account visit; unique constraint is the collision arbiter.
alter table public.profiles
  add column if not exists username text unique;
```

(Applied later via user-gated `supabase db push` — Task 9.)

- [ ] **Step 2: Write failing tests**

Append to `mobile/lib/profile.test.ts` (extend the existing `./profile` import with `generateUsername, ensureUsername`):

```ts
test("generateUsername takes first name, lowercased, plus 4 digits", () => {
  expect(generateUsername("Tash Any", () => 0.4821)).toBe("tash4821");
});

test("generateUsername strips non-alphanumerics and pads digits", () => {
  expect(generateUsername("Й!  ", () => 0.0007)).toBe("traveler0007");
  expect(generateUsername("O'Brien Smith", () => 0.9999)).toBe("obrien9999");
});

function usernameClient(opts: {
  existing?: string | null;
  upsertErrors?: ({ code: string } | null)[];
  onUpsert?: (row: unknown) => void;
}): SupabaseClient {
  let call = 0;
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { username: opts.existing ?? null }, error: null }) }) }),
      upsert: async (row: unknown) => {
        opts.onUpsert?.(row);
        return { error: (opts.upsertErrors ?? [null])[Math.min(call++, (opts.upsertErrors ?? [null]).length - 1)] };
      },
    }),
  } as unknown as SupabaseClient;
}

const u1 = { id: "u1", email: "tashany@gmail.com", user_metadata: {} };

test("ensureUsername returns existing username without writing", async () => {
  let wrote = false;
  const client = usernameClient({ existing: "tash1111", onUpsert: () => { wrote = true; } });
  expect(await ensureUsername(client, u1)).toBe("tash1111");
  expect(wrote).toBe(false);
});

test("ensureUsername generates and upserts id + username", async () => {
  let row: unknown;
  const client = usernameClient({ onUpsert: (r) => { row = r; } });
  const name = await ensureUsername(client, u1, () => 0.1234);
  expect(name).toBe("tashany1234");
  expect(row).toEqual({ id: "u1", username: "tashany1234" });
});

test("ensureUsername retries on unique collision", async () => {
  const client = usernameClient({ upsertErrors: [{ code: "23505" }, null] });
  expect(await ensureUsername(client, u1)).toMatch(/^tashany\d{4}$/);
});

test("ensureUsername gives up after 3 collisions", async () => {
  const client = usernameClient({ upsertErrors: [{ code: "23505" }] });
  expect(await ensureUsername(client, u1)).toBeNull();
});

test("ensureUsername throws on non-collision error", async () => {
  const client = usernameClient({ upsertErrors: [{ code: "42501" }] });
  await expect(ensureUsername(client, u1)).rejects.toBeTruthy();
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd mobile && npx jest lib/profile.test.ts`
Expected: FAIL — `generateUsername`/`ensureUsername` not exported.

- [ ] **Step 4: Implement**

Append to `mobile/lib/profile.ts`:

```ts
export function generateUsername(base: string, rand: () => number = Math.random): string {
  const first = base.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") || "traveler";
  const digits = String(Math.floor(rand() * 10000)).padStart(4, "0");
  return `${first}${digits}`;
}

// Generate-once handle. Unique constraint arbitrates collisions: retry with
// fresh digits, give up after 3 (retried on the next account visit).
export async function ensureUsername(
  client: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  rand?: () => number,
): Promise<string | null> {
  const { data } = await client.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const existing = (data as { username?: string | null } | null)?.username;
  if (existing) return existing;
  for (let i = 0; i < 3; i++) {
    const candidate = generateUsername(displayName(user), rand);
    const { error } = await client.from("profiles").upsert({ id: user.id, username: candidate });
    if (!error) return candidate;
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd mobile && npx jest lib/profile.test.ts`
Expected: PASS.

- [ ] **Step 6: Show `@username` on the account screen**

In `mobile/app/(app)/account.tsx`: extend the profile import with `ensureUsername`, then add below the `styleQ` query:

```tsx
  const usernameQ = useQuery({
    queryKey: ["username"],
    queryFn: () => ensureUsername(supabase, user!),
    enabled: !!user,
  });
```

In the identity card from Task 2, insert the handle between name and email:

```tsx
        <View className="flex-1 gap-0.5">
          <Text variant="heading" numberOfLines={1}>{displayName(user)}</Text>
          {usernameQ.data ? <Text variant="caption" className="text-accent">@{usernameQ.data}</Text> : null}
          {user?.email ? <Text variant="caption" numberOfLines={1}>{user.email}</Text> : null}
        </View>
```

- [ ] **Step 7: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0007_username.sql mobile/lib/profile.ts mobile/lib/profile.test.ts mobile/app/\(app\)/account.tsx
git commit -m "feat(account): generated @username (firstname + 4 digits, unique)"
```

---

### Task 4: Server paywall check in `startGenerate` (TDD)

Free tier enforced where money is spent: after 1 non-failed trip, generation requires the `pro` entitlement. Fail-open on provider errors.

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts` (StartDeps + startGenerate, near lines 42-47 and 240-253)
- Modify: `supabase/functions/generate-itinerary/handler_test.ts` (baseDeps + new tests)

**Interfaces:**
- Consumes: existing `startGenerate` / `StartDeps`.
- Produces: `FREE_TRIP_LIMIT = 1` exported constant; new `StartDeps` members `countTotalTrips(userId: string): Promise<number>` and `hasProEntitlement(userId: string): Promise<boolean>`; new response `{ status: 402, body: { error: "pro required" } }`. Task 5 implements the deps; Task 7 handles 402 client-side.

- [ ] **Step 1: Extend `baseDeps` and write failing tests**

In `supabase/functions/generate-itinerary/handler_test.ts`, add to the `baseDeps` return object (after `countTripsToday`):

```ts
    countTotalTrips: () => Promise.resolve(0),
    hasProEntitlement: () => Promise.resolve(false),
```

Add to the import from `./handler.ts`: `FREE_TRIP_LIMIT`.

Append tests:

```ts
Deno.test("free limit reached without pro → 402 and no pending row", async () => {
  let created = false;
  const deps = baseDeps({
    countTotalTrips: () => Promise.resolve(FREE_TRIP_LIMIT),
    createPendingTrip: () => { created = true; return Promise.resolve("t"); },
  });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 402);
  assertEquals((r.body as { error: string }).error, "pro required");
  assertEquals(created, false);
});

Deno.test("free limit reached with pro entitlement → 202", async () => {
  const deps = baseDeps({
    countTotalTrips: () => Promise.resolve(5),
    hasProEntitlement: () => Promise.resolve(true),
  });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 202);
});

Deno.test("entitlement check failure fails open → 202", async () => {
  const deps = baseDeps({
    countTotalTrips: () => Promise.resolve(5),
    hasProEntitlement: () => Promise.reject(new Error("rc down")),
  });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 202);
});

Deno.test("first trip needs no entitlement → 202", async () => {
  let checked = false;
  const deps = baseDeps({
    countTotalTrips: () => Promise.resolve(0),
    hasProEntitlement: () => { checked = true; return Promise.resolve(false); },
  });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 202);
  assertEquals(checked, false);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd supabase && deno test functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `FREE_TRIP_LIMIT` not exported / `countTotalTrips` missing from `StartDeps` (type error).

- [ ] **Step 3: Implement in handler.ts**

Add to `StartDeps` (after `countTripsToday`):

```ts
  countTotalTrips(userId: string): Promise<number>;   // all-time, excludes failed rows
  hasProEntitlement(userId: string): Promise<boolean>; // may throw — caller fails open
```

Export next to `DAILY_CAP`:

```ts
export const FREE_TRIP_LIMIT = 1;
```

In `startGenerate`, after the `DAILY_CAP` 429 return and before `createPendingTrip`:

```ts
  if ((await deps.countTotalTrips(userId)) >= FREE_TRIP_LIMIT) {
    let pro = true; // fail open: an entitlement-provider outage must never block generation
    try {
      pro = await deps.hasProEntitlement(userId);
    } catch (e) {
      console.error("entitlement check failed (allowing):", e instanceof Error ? e.message : e);
    }
    if (!pro) return { status: 402, body: { error: "pro required" } };
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd supabase && deno test`
Expected: all PASS (new tests + 112 existing).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(paywall): enforce 1 free trip in startGenerate, 402 without pro entitlement"
```

---

### Task 5: Wire real deps in `index.ts` (trip count + RevenueCat REST)

IO shell only — logic was tested in Task 4; the repo has no index.ts test harness (existing convention).

**Files:**
- Modify: `supabase/functions/generate-itinerary/index.ts` (env at ~line 15, deps at ~line 36)

**Interfaces:**
- Consumes: `StartDeps.countTotalTrips` / `hasProEntitlement` shapes from Task 4.
- Produces: env var contract `REVENUECAT_SECRET_KEY` (Supabase secret, provisioned in Task 9).

- [ ] **Step 1: Implement deps**

In `supabase/functions/generate-itinerary/index.ts`, add after the other env reads (note: `?? ""` not `!` — the secret is optional until provisioned; missing key must fail open, not crash the function):

```ts
const RC_SECRET = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";
```

Add to the `deps: StartDeps` object, after `countTripsToday`:

```ts
    countTotalTrips: async (uid) => {
      const { count } = await admin
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .neq("status", "failed");
      return count ?? 0;
    },
    // app_user_id === Supabase user id (Purchases.logIn). Throws on any
    // problem — startGenerate fails open, so an unset secret or RC outage
    // never blocks generation.
    hasProEntitlement: async (uid) => {
      if (!RC_SECRET) throw new Error("REVENUECAT_SECRET_KEY not set");
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${RC_SECRET}` },
      });
      if (!res.ok) throw new Error(`revenuecat ${res.status}`);
      const body = await res.json() as {
        subscriber?: { entitlements?: Record<string, { expires_date: string | null }> };
      };
      const ent = body.subscriber?.entitlements?.pro;
      return !!ent && (ent.expires_date === null || Date.parse(ent.expires_date) > Date.now());
    },
```

- [ ] **Step 2: Verify types + suites**

Run: `cd supabase && deno check functions/generate-itinerary/index.ts && deno test`
Expected: no type errors, all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-itinerary/index.ts
git commit -m "feat(paywall): trip-count + RevenueCat entitlement deps in generate-itinerary"
```

---

### Task 6: Purchases module + app wiring

`react-native-purchases` SDK behind a small module: configure at app root, log in/out with Supabase auth, expose `usePro` / offering / purchase / restore. iOS-guarded so web and jest never touch the native module.

**Files:**
- Modify: `mobile/package.json` (new dependency)
- Create: `mobile/lib/purchases.ts`
- Modify: `mobile/app.config.ts` (extra key)
- Modify: `mobile/app/_layout.tsx` (configure)
- Modify: `mobile/lib/auth.tsx` (logIn/logOut wiring)

**Interfaces:**
- Consumes: `extra.revenuecatIosKey` from app config (public SDK key, like the Supabase anon key).
- Produces (all from `mobile/lib/purchases.ts`, used by Tasks 7-8):
  - `configurePurchases(): void`
  - `logInPurchases(userId: string): Promise<void>` / `logOutPurchases(): Promise<void>`
  - `usePro(): { isPro: boolean }`
  - `getProPackages(): Promise<PurchasesPackage[]>`
  - `purchasePro(pkg: PurchasesPackage): Promise<boolean>` — false on user cancel, throws on store error
  - `restorePro(): Promise<boolean>`

- [ ] **Step 1: Install the SDK**

Run: `cd mobile && npx expo install react-native-purchases`
Expected: dependency added to package.json. (Native module — device testing needs the Task 9 EAS build; nothing else in dev breaks.)

- [ ] **Step 2: Add the public SDK key to app config**

In `mobile/app.config.ts` `extra`, after `googleIosClientId`:

```ts
    revenuecatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
```

- [ ] **Step 3: Create the purchases module**

Create `mobile/lib/purchases.ts`:

```ts
// mobile/lib/purchases.ts
// RevenueCat wrapper. iOS-only at launch; every entry point no-ops when not
// configured (web, jest, missing key) so callers never need platform checks.
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";

const extra = Constants.expoConfig?.extra as { revenuecatIosKey?: string };

let configured = false;

export function configurePurchases(): void {
  if (configured || Platform.OS !== "ios" || !extra.revenuecatIosKey) return;
  Purchases.configure({ apiKey: extra.revenuecatIosKey });
  configured = true;
}

// app_user_id = Supabase user id, so the edge function can verify entitlements.
export async function logInPurchases(userId: string): Promise<void> {
  if (!configured) return;
  await Purchases.logIn(userId).catch((e) => console.warn("purchases logIn failed:", e));
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  await Purchases.logOut().catch(() => { /* already anonymous — fine */ });
}

function hasPro(info: CustomerInfo): boolean {
  return !!info.entitlements.active["pro"];
}

export function usePro(): { isPro: boolean } {
  const [isPro, setIsPro] = useState(false);
  useEffect(() => {
    if (!configured) return;
    let mounted = true;
    const update = (info: CustomerInfo) => { if (mounted) setIsPro(hasPro(info)); };
    Purchases.getCustomerInfo().then(update).catch(() => {});
    Purchases.addCustomerInfoUpdateListener(update);
    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener(update);
    };
  }, []);
  return { isPro };
}

export async function getProPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

// true → entitlement active, close the paywall. false → user cancelled.
export async function purchasePro(pkg: PurchasesPackage): Promise<boolean> {
  const before = configured; // ponytail: belt-and-braces; purchase without configure throws anyway
  if (!before) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasPro(customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restorePro(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return hasPro(info);
}
```

- [ ] **Step 4: Configure at app root**

In `mobile/app/_layout.tsx`, add import and one module-scope call (runs once at bundle load, before any component mounts):

```tsx
import { configurePurchases } from "../lib/purchases";

configurePurchases();
```

Place the call next to the existing module-scope setup (after the `persister` line).

- [ ] **Step 5: Wire auth session changes**

In `mobile/lib/auth.tsx`, import:

```tsx
import { logInPurchases, logOutPurchases } from "./purchases";
```

Replace the `useEffect` body's two session handlers (lines 30-35):

```tsx
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) logInPurchases(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) logInPurchases(s.user.id);
      else logOutPurchases();
    });
    return () => sub.subscription.unsubscribe();
```

- [ ] **Step 6: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS (no test imports the native module; guards keep jest clean).

- [ ] **Step 7: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/lib/purchases.ts mobile/app.config.ts mobile/app/_layout.tsx mobile/lib/auth.tsx
git commit -m "feat(paywall): react-native-purchases module wired to auth + app root"
```

---

### Task 7: Client gate + 402 handling (TDD)

Trip #2 without Pro routes to the paywall instead of onboarding; a raced 402 from the server lands on the same screen.

**Files:**
- Create: `mobile/lib/gate.ts`
- Create: `mobile/lib/gate.test.ts`
- Modify: `mobile/app/(app)/(tabs)/index.tsx` (both "Plan a trip" buttons)
- Modify: `mobile/app/(app)/generating.tsx:39-52` (402 branch)

**Interfaces:**
- Consumes: `usePro` from Task 6; `TripSummary.status` from `lib/trips`; `useTripFlow().error` (`ApiError` with `.status`).
- Produces: `canStartNewTrip(tripCount: number, isPro: boolean): boolean` and `FREE_TRIP_LIMIT` from `mobile/lib/gate.ts`; route contract: paywall lives at `/paywall` (Task 8 creates the screen — this task can land first; the route 404s only in the not-yet-shippable gap between commits).

- [ ] **Step 1: Write failing tests**

Create `mobile/lib/gate.test.ts`:

```ts
import { canStartNewTrip, FREE_TRIP_LIMIT } from "./gate";

test("free user under the limit can start", () => {
  expect(canStartNewTrip(0, false)).toBe(true);
});

test("free user at the limit cannot start", () => {
  expect(canStartNewTrip(FREE_TRIP_LIMIT, false)).toBe(false);
  expect(canStartNewTrip(5, false)).toBe(false);
});

test("pro user always can start", () => {
  expect(canStartNewTrip(0, true)).toBe(true);
  expect(canStartNewTrip(99, true)).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement gate**

Create `mobile/lib/gate.ts`:

```ts
// mobile/lib/gate.ts
// Client mirror of the server rule in generate-itinerary/handler.ts
// (FREE_TRIP_LIMIT + pro entitlement). Server is authoritative; this only
// decides which screen to show.
export const FREE_TRIP_LIMIT = 1;

export function canStartNewTrip(tripCount: number, isPro: boolean): boolean {
  return isPro || tripCount < FREE_TRIP_LIMIT;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate the Trips tab**

In `mobile/app/(app)/(tabs)/index.tsx`, add imports:

```tsx
import { usePro } from "../../../lib/purchases";
import { canStartNewTrip } from "../../../lib/gate";
```

Inside `Trips()`, after the `coverFor` helper:

```tsx
  const { isPro } = usePro();
  // failed trips never produced an itinerary — they don't consume the free slot
  const tripCount = (trips ?? []).filter((t) => t.status !== "failed").length;
  const startTrip = () =>
    router.push(canStartNewTrip(tripCount, isPro) ? "/onboarding" : "/paywall");
```

Change **both** "Plan a trip" buttons (empty state ~line 82 and list state ~line 103) to:

```tsx
<Button title="Plan a trip" size="lg" variant="gradient" onPress={startTrip} />
```

- [ ] **Step 6: Handle 402 on the generating screen**

In `mobile/app/(app)/generating.tsx`, replace the error-state action block (the two buttons inside the `status === "error"` branch, lines 46-49):

```tsx
        <View className="gap-3 pt-3 border-t border-border bg-bg -mx-6 px-6" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          {error?.status === 402 ? (
            <Button title="Go Pro" size="lg" variant="gradient" onPress={() => router.replace("/paywall")} />
          ) : (
            <Button title="Try again" size="lg" onPress={() => lastRequest && generate(lastRequest)} />
          )}
          <Button title="Edit trip" variant="ghost" onPress={() => router.replace("/onboarding")} />
        </View>
```

And make the 402 message human — above the buttons, replace the message `<Text>` (line 44):

```tsx
          <Text variant="body" className="text-center text-ink-muted">
            {error?.status === 402
              ? "You've used your free trip. Go Pro for unlimited itineraries."
              : error?.message ?? "Something went wrong."}
          </Text>
```

- [ ] **Step 7: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/lib/gate.ts mobile/lib/gate.test.ts mobile/app/\(app\)/\(tabs\)/index.tsx mobile/app/\(app\)/generating.tsx
git commit -m "feat(paywall): gate second trip client-side; route 402 to paywall"
```

---

### Task 8: Paywall screen

Custom Sunset Soft paywall: gradient hero, benefits, two price cards (annual highlighted), CTA, restore, legal links. Expo Router auto-registers the route as `/paywall`.

**Files:**
- Create: `mobile/app/(app)/paywall.tsx`

**Interfaces:**
- Consumes: `getProPackages` / `purchasePro` / `restorePro` from Task 6; `Screen, Text, Button, Icon, PressableScale, Loading, SUNSET` from `components/ui`; `expo-web-browser` (already a dependency).
- Produces: route `/paywall` used by Task 7.

- [ ] **Step 1: Create the screen**

Create `mobile/app/(app)/paywall.tsx`:

```tsx
// mobile/app/(app)/paywall.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import type { PurchasesPackage } from "react-native-purchases";
import { getProPackages, purchasePro, restorePro } from "../../lib/purchases";
import { Screen, Text, Button, Icon, PressableScale, Loading, SUNSET } from "../../components/ui";

// ponytail: repo docs as legal pages; swap for hosted URLs before App Store submission (see plan Task 9)
const TERMS_URL = "https://github.com/orangutanger1/tour/blob/main/docs/terms-of-service.md";
const PRIVACY_URL = "https://github.com/orangutanger1/tour/blob/main/docs/privacy-policy.md";

const BENEFITS = [
  "Unlimited trip itineraries",
  "Smart day-by-day routes and timing",
  "All future Pro features included",
];

function PlanCard({ pkg, active, onPress }: { pkg: PurchasesPackage; active: boolean; onPress: () => void }) {
  const annual = pkg.packageType === "ANNUAL";
  return (
    <PressableScale
      onPress={onPress}
      className={`flex-1 rounded-xl border-2 p-4 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
    >
      <View className="h-6 mb-1">
        {annual ? (
          <View className="self-start px-2 py-0.5 rounded-pill bg-accent">
            <Text variant="label" className="text-ink-inverse text-[11px]">SAVE 44%</Text>
          </View>
        ) : null}
      </View>
      <Text variant="heading">{annual ? "Annual" : "Monthly"}</Text>
      <Text variant="caption">{pkg.product.priceString} / {annual ? "year" : "month"}</Text>
    </PressableScale>
  );
}

export default function Paywall() {
  const router = useRouter();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        setSelected(pkgs.find((p) => p.packageType === "ANNUAL")?.identifier ?? pkgs[0]?.identifier ?? null);
      })
      .catch(() => setError("Couldn't load plans. Check your connection and try again."));
  }, []);

  async function buy() {
    const pkg = packages?.find((p) => p.identifier === selected);
    if (!pkg) return;
    setBusy(true);
    setError(null);
    try {
      if (await purchasePro(pkg)) router.back();
    } catch {
      setError("Purchase failed — you weren't charged. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    setBusy(true);
    setError(null);
    try {
      if (await restorePro()) router.back();
      else setError("No purchases to restore.");
    } catch {
      setError("Restore failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View className="flex-row justify-end">
        <Button title="Not now" variant="ghost" size="sm" onPress={() => router.back()} />
      </View>

      <LinearGradient
        colors={SUNSET}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 24 }}
      >
        <Icon name="sparkles" size={28} color="#FFFFFF" />
        <Text variant="title" className="text-ink-inverse mt-2">Tour Pro</Text>
        <Text variant="body" className="text-ink-inverse opacity-90">
          Your first trip was on us. Go Pro for every trip after.
        </Text>
      </LinearGradient>

      <View className="gap-3">
        {BENEFITS.map((b) => (
          <View key={b} className="flex-row items-center gap-3">
            <Icon name="checkmark-circle" size={20} color="#E11D48" />
            <Text variant="body">{b}</Text>
          </View>
        ))}
      </View>

      {packages === null && !error ? (
        <Loading label="Loading plans…" />
      ) : (
        <View className="flex-row gap-3">
          {(packages ?? []).map((pkg) => (
            <PlanCard key={pkg.identifier} pkg={pkg} active={pkg.identifier === selected} onPress={() => setSelected(pkg.identifier)} />
          ))}
        </View>
      )}

      {error ? <Text variant="caption" className="text-error text-center">{error}</Text> : null}

      <Button title="Start Pro" size="lg" variant="gradient" loading={busy} disabled={!selected} onPress={buy} />

      <PressableScale onPress={onRestore} disabled={busy} className="items-center py-2">
        <Text variant="label" className="text-accent">Restore Purchases</Text>
      </PressableScale>

      <View className="flex-row justify-center gap-4 pb-4">
        <PressableScale onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
          <Text variant="caption" className="underline">Terms</Text>
        </PressableScale>
        <PressableScale onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
          <Text variant="caption" className="underline">Privacy</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/paywall.tsx
git commit -m "feat(paywall): Tour Pro paywall screen (annual/monthly, restore, legal links)"
```

---

### Task 9: Manual provisioning checklist (user-gated — do NOT automate)

Everything code-side is done after Task 8; nothing below runs from this repo without the user. Present this list to the user at finish-branch time.

- [ ] **App Store Connect** (user): sign the Paid Applications agreement (Business → Agreements); create subscription group "Pro" with `pro_annual_3999` ($39.99/year) and `pro_monthly_599` ($5.99/month); fill localized display names/descriptions.
- [ ] **RevenueCat dashboard** (user): create project + iOS app for `com.tour.local`; connect an App Store Connect API key; import both products; create entitlement `pro` attached to both; create offering `default` with annual + monthly packages.
- [ ] **Keys** (user):
  - Public iOS SDK key → EAS env var `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (preview + production) and local `.env`.
  - Secret API key → `supabase secrets set REVENUECAT_SECRET_KEY=sk_...`
- [ ] **Deploy** (user-gated): `supabase db push` (migration 0007) and `supabase functions deploy generate-itinerary` — also picks up the pending round-trip fix (063b062) noted in memory.
- [ ] **Legal pages** (user): fill in `[DATE]` / `[Your Legal Name]` placeholders in `docs/privacy-policy.md` + `docs/terms-of-service.md`; make them publicly reachable (public repo or GitHub Pages) — App Store review follows the paywall's Terms/Privacy links. If final URLs differ from the GitHub links in `paywall.tsx`, update them.
- [ ] **EAS build** (user): new build required (react-native-purchases + the pending AsyncStorage native dep). `eas build --profile preview --platform ios`.
- [ ] **Sandbox smoke test** (user + Claude): sandbox Apple ID → buy annual on trip #2 gate → generation unblocked; restore purchases on a reinstall; cancel mid-purchase → paywall stays, no error alert; server 402 by calling generate-itinerary directly with a free account that has 1 trip.

---

## Self-review notes

- **Spec coverage:** model/products (Tasks 6, 9), client gate (7), server enforcement (4, 5), paywall UI (8), display name + email size (2), username (3), gallery/passport titles (1), error handling (4 fail-open, 7 402-UX, 8 cancel/restore), testing (jest in 2/3/7, deno in 4, device in 9). Out-of-scope items from spec untouched. ✔
- **402 client mapping:** already handled by existing `ApiError(status)` in `lib/api.ts:52-58` — no api.ts change needed; Task 7 consumes `error.status`.
- **Type consistency:** `FREE_TRIP_LIMIT` exists twice by design — server (`handler.ts`, authoritative) and client (`lib/gate.ts`, screen routing); the gate.ts comment cross-references. `countTotalTrips`/`hasProEntitlement` signatures match between Tasks 4 and 5. `usePro/getProPackages/purchasePro/restorePro` names match between Tasks 6, 7, 8.
- **Ordering:** Task 7 references route `/paywall` created in Task 8 — acceptable: nothing ships between commits; swap order if executing with device smoke between tasks.
