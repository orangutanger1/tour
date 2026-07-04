# Discover Page (Home Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polarsteps-style Discover tab — curated destination sections (For You, tags, themes, continents) with images, a destination detail screen that feeds onboarding, glass surfaces, and smooth press animation.

**Architecture:** Bundled static dataset (`lib/destinations.ts`) is the day-1 content and react-query `initialData`; a `destinations` Supabase table (select-only RLS) overrides it when non-empty. All selection/filter logic is pure functions in `lib/discover.ts` (unit-tested). Three screens: the tab, a filtered list, a detail screen. Press feedback via core RN `Animated` (never reanimated on touchables); glass via `expo-blur`.

**Tech Stack:** Expo SDK 56 (read https://docs.expo.dev/versions/v56.0.0/ before writing Expo code — per `mobile/AGENTS.md`), expo-router, NativeWind, @tanstack/react-query, expo-image, expo-linear-gradient, expo-blur (new dep), jest-expo, Supabase.

**Spec:** `docs/superpowers/specs/2026-07-04-discover-page-design.md`

## Global Constraints

- Working dir for mobile commands: `/home/myen/tour/mobile`. Tests: `npm test`. Types: `npx tsc --noEmit`.
- **Never** put `className` on `Animated.*`/reanimated components and never call `cssInterop` outside `components/ui/Photo.tsx` — `lib/noAnimatedClassName.test.ts` enforces both; it must stay green.
- No reanimated in any touch path (device bug). Press feedback = core RN `Animated` only.
- Use existing design-system components (`components/ui`): `Screen`, `Text`, `Button`, `Chip`, `Card`, `EmptyState`, `Photo`, gradients from `ui/gradients.ts`. Fonts/styles via NativeWind classes matching existing screens.
- Project test pattern: logic-only jest tests on `lib/` (no render-test infra — screens verified by `tsc` + device smoke).
- Migration number: `0008_destinations.sql` (0007 is taken). Do NOT run `db push` (deploy happens later, with the pending EAS build).
- New dependency allowed: `expo-blur` only.
- Commit after every green task. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Curated destination dataset

**Files:**
- Create: `mobile/lib/destinations.ts`
- Create: `mobile/lib/destinations.test.ts`
- Create: `mobile/scripts/check-image-urls.mjs`

**Interfaces:**
- Produces: `type Theme`, `type Tag`, `type Continent`, `interface Destination`, `const DESTINATIONS: Destination[]`, `const THEMES: Theme[]`, `const TAGS: Tag[]`, `const CONTINENTS: Continent[]` — consumed by every later task.

- [ ] **Step 1: Write the failing invariants test**

`mobile/lib/destinations.test.ts`:

```ts
import { DESTINATIONS, THEMES, TAGS, CONTINENTS, type Destination } from "./destinations";

test("dataset is non-trivial and ids are unique slugs", () => {
  expect(DESTINATIONS.length).toBeGreaterThanOrEqual(48);
  const ids = DESTINATIONS.map((d) => d.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
});

test("every destination has valid fields", () => {
  for (const d of DESTINATIONS) {
    expect(d.name.length).toBeGreaterThan(0);
    expect(d.country.length).toBeGreaterThan(0);
    expect(d.countryCode).toMatch(/^[A-Z]{2}$/);
    expect(CONTINENTS).toContain(d.continent);
    expect(d.themes.length).toBeGreaterThanOrEqual(1);
    expect(d.themes.length).toBeLessThanOrEqual(3);
    for (const t of d.themes) expect(THEMES).toContain(t);
    expect(d.tags.length).toBeLessThanOrEqual(2);
    for (const t of d.tags) expect(TAGS).toContain(t);
    expect(d.blurb.length).toBeGreaterThan(20);
    expect(d.highlights.length).toBeGreaterThanOrEqual(3);
    expect(d.highlights.length).toBeLessThanOrEqual(5);
    expect(d.imageUrl).toMatch(/^https:\/\//);
    expect(Math.abs(d.lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(d.lng)).toBeLessThanOrEqual(180);
  }
});

test("coverage: themes ≥5 each, continents ≥4 each, tags ≥8 each, ≥12 countries", () => {
  const count = (pred: (d: Destination) => boolean) => DESTINATIONS.filter(pred).length;
  for (const theme of THEMES) expect(count((d) => d.themes.includes(theme))).toBeGreaterThanOrEqual(5);
  for (const c of CONTINENTS) expect(count((d) => d.continent === c)).toBeGreaterThanOrEqual(4);
  for (const tag of TAGS) expect(count((d) => d.tags.includes(tag))).toBeGreaterThanOrEqual(8);
  expect(new Set(DESTINATIONS.map((d) => d.countryCode)).size).toBeGreaterThanOrEqual(12);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/myen/tour/mobile && npx jest lib/destinations.test.ts`
Expected: FAIL — `Cannot find module './destinations'`

- [ ] **Step 3: Write the dataset**

`mobile/lib/destinations.ts` — types + ~48 curated entries. Exact shape:

```ts
// mobile/lib/destinations.ts
// Curated Discover content. Bundled fallback + day-1 data; the `destinations`
// Supabase table overrides it when non-empty (see lib/discover.ts).
export const THEMES = ["nature", "adventure", "culture", "food", "wildlife", "city", "beach"] as const;
export type Theme = (typeof THEMES)[number];

export const TAGS = ["popular", "trending", "underRadar"] as const;
export type Tag = (typeof TAGS)[number];

export const CONTINENTS = ["africa", "asia", "europe", "north-america", "oceania", "south-america"] as const;
export type Continent = (typeof CONTINENTS)[number];

export interface Destination {
  id: string;             // slug, e.g. "kyoto-japan"
  name: string;
  country: string;
  countryCode: string;    // ISO-3166 alpha-2, uppercase — drives emoji flag
  continent: Continent;
  themes: Theme[];        // 1–3
  tags: Tag[];            // 0–2
  blurb: string;          // 1–2 sentences
  highlights: string[];   // 3–5
  imageUrl: string;       // https, verified by scripts/check-image-urls.mjs
  lat: number;
  lng: number;
}

export const DESTINATIONS: Destination[] = [
  {
    id: "kyoto-japan",
    name: "Kyoto",
    country: "Japan",
    countryCode: "JP",
    continent: "asia",
    themes: ["culture", "food"],
    tags: ["popular"],
    blurb: "Japan's old imperial capital: thousands of temples, lantern-lit lanes, and kaiseki dining beneath the maples.",
    highlights: ["Fushimi Inari torii gates", "Arashiyama bamboo grove", "Gion at dusk", "Kinkaku-ji"],
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Kinkaku-ji%20in%20November%202016%20-02.jpg?width=900",
    lat: 35.0116,
    lng: 135.7681,
  },
  {
    id: "faroe-islands-denmark",
    name: "Faroe Islands",
    country: "Denmark",
    countryCode: "FO",
    continent: "europe",
    themes: ["nature", "adventure"],
    tags: ["underRadar"],
    blurb: "Eighteen storm-carved islands where waterfalls pour straight into the Atlantic and sheep outnumber people.",
    highlights: ["Múlafossur waterfall", "Sørvágsvatn cliff lake", "Puffin colonies on Mykines"],
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/M%C3%BAlafossur%2C%20G%C3%A1sadalur%2C%20V%C3%A1gar%2C%20Faroe%20Islands.jpg?width=900",
    lat: 62.0,
    lng: -6.79,
  },
  {
    id: "oaxaca-mexico",
    name: "Oaxaca",
    country: "Mexico",
    countryCode: "MX",
    continent: "north-america",
    themes: ["food", "culture"],
    tags: ["trending"],
    blurb: "Mexico's food capital — smoky moles, mezcal palenques, and Zapotec ruins above a baroque colonial core.",
    highlights: ["Mercado 20 de Noviembre", "Monte Albán", "Mezcal tastings", "Hierve el Agua"],
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Oaxaca%20-%20Templo%20de%20Santo%20Domingo.jpg?width=900",
    lat: 17.0732,
    lng: -96.7266,
  },
  // …~45 more in this exact shape. Fill until lib/destinations.test.ts passes:
  // every theme ≥5 entries, every continent ≥4, every tag ≥8, ≥12 country codes,
  // total ≥48. Spread tags so each section reads distinct (a destination may be
  // untagged). Image URLs: Wikimedia Commons "Special:FilePath/<File name>.jpg?width=900"
  // (URL-encode the file name) — pick well-known Commons photos of each place;
  // Step 5's script verifies every URL actually resolves to an image.
];
```

The three examples above are complete and real; the remaining ~45 must satisfy the invariants test. Aim for recognizable spread: Europe/Asia heavy hitters (Paris, Rome, Barcelona, Bangkok, Bali…), genuine under-the-radar picks (Albania, Georgia, Laos, Slovenia…), safari/wildlife (Kenya, Tanzania, Galápagos, Kruger), beaches (Maldives, Zanzibar, Algarve), cities (Tokyo, NYC, Buenos Aires, Cape Town), Oceania (Queenstown, Sydney, Fiji, Tasmania).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/myen/tour/mobile && npx jest lib/destinations.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write and run the image-URL checker**

`mobile/scripts/check-image-urls.mjs`:

```js
// Verifies every imageUrl in lib/destinations.ts resolves to an image.
// Run: node scripts/check-image-urls.mjs   (from mobile/)
import { readFileSync } from "fs";

const src = readFileSync(new URL("../lib/destinations.ts", import.meta.url), "utf8");
const urls = [...src.matchAll(/imageUrl:\s*"([^"]+)"/g)].map((m) => m[1]);
const bad = [];
for (const u of urls) {
  const r = await fetch(u).catch(() => null);
  const type = r?.headers.get("content-type") ?? "";
  if (!r?.ok || !type.startsWith("image/")) bad.push(`${u} → ${r ? `${r.status} ${type}` : "fetch failed"}`);
}
console.log(`${urls.length - bad.length}/${urls.length} image URLs OK`);
if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
```

Run: `cd /home/myen/tour/mobile && node scripts/check-image-urls.mjs`
Expected: `48/48 image URLs OK` (or higher), exit 0. Replace any failing URL with a different Commons file and re-run until clean.

- [ ] **Step 6: Full suite + commit**

Run: `cd /home/myen/tour/mobile && npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add mobile/lib/destinations.ts mobile/lib/destinations.test.ts mobile/scripts/check-image-urls.mjs
git commit -m "feat(discover): curated destination dataset with invariant tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Discover selection/filter logic

**Files:**
- Create: `mobile/lib/discover.ts`
- Create: `mobile/lib/discover.test.ts`

**Interfaces:**
- Consumes: `Destination`, `Theme`, `Tag`, `Continent`, `DESTINATIONS`, `THEMES`, `TAGS`, `CONTINENTS` from `./destinations` (Task 1).
- Produces (consumed by Tasks 5–7):
  - `INTEREST_THEMES: Record<string, Theme[]>`
  - `forYou(all: Destination[], interests: string[], n?: number): Destination[]`
  - `byTag(all: Destination[], tag: Tag): Destination[]`
  - `byTheme(all: Destination[], theme: Theme): Destination[]`
  - `byContinent(all: Destination[], continent: Continent): Destination[]`
  - `byCountry(all: Destination[], countryCode: string): Destination[]`
  - `countries(all: Destination[]): { country: string; countryCode: string }[]`
  - `flagEmoji(countryCode: string): string`
  - `mapRemoteRow(row: Record<string, unknown>): Destination | null`
  - `fetchDestinations(client: SupabaseClient): Promise<Destination[]>`

- [ ] **Step 1: Write the failing tests**

`mobile/lib/discover.test.ts`:

```ts
import type { Destination } from "./destinations";
import {
  INTEREST_THEMES, forYou, byTag, byTheme, byContinent, byCountry,
  countries, flagEmoji, mapRemoteRow, fetchDestinations,
} from "./discover";
import { INTERESTS } from "./onboarding";

const d = (over: Partial<Destination>): Destination => ({
  id: "x", name: "X", country: "Xland", countryCode: "XX", continent: "asia",
  themes: ["city"], tags: [], blurb: "b", highlights: ["h"], imageUrl: "https://x", lat: 0, lng: 0,
  ...over,
});

test("INTEREST_THEMES covers every onboarding interest", () => {
  for (const i of INTERESTS) expect(INTEREST_THEMES[i]?.length).toBeGreaterThan(0);
});

test("forYou ranks by theme overlap, tagged first on ties, stable order", () => {
  const all = [
    d({ id: "a", themes: ["city"] }),                          // 1 match, untagged
    d({ id: "b", themes: ["city", "culture"] }),               // 2 matches
    d({ id: "c", themes: ["city"], tags: ["popular"] }),       // 1 match, tagged
    d({ id: "z", themes: ["beach"] }),                         // 0 matches
  ];
  expect(forYou(all, ["nightlife", "history"]).map((x) => x.id)).toEqual(["b", "c", "a"]);
});

test("forYou caps at n", () => {
  const all = Array.from({ length: 12 }, (_, i) => d({ id: `d${i}`, themes: ["city"] }));
  expect(forYou(all, ["nightlife"], 8)).toHaveLength(8);
});

test("forYou falls back to popular on no interests or no matches", () => {
  const all = [d({ id: "pop", tags: ["popular"] }), d({ id: "plain" })];
  expect(forYou(all, []).map((x) => x.id)).toEqual(["pop"]);
  expect(forYou([d({ id: "pop", themes: ["beach"], tags: ["popular"] })], ["food"]).map((x) => x.id)).toEqual(["pop"]);
});

test("filters", () => {
  const all = [
    d({ id: "a", tags: ["trending"], themes: ["food"], continent: "europe", countryCode: "IT" }),
    d({ id: "b", tags: ["popular"], themes: ["beach"], continent: "asia", countryCode: "TH" }),
  ];
  expect(byTag(all, "trending").map((x) => x.id)).toEqual(["a"]);
  expect(byTheme(all, "beach").map((x) => x.id)).toEqual(["b"]);
  expect(byContinent(all, "europe").map((x) => x.id)).toEqual(["a"]);
  expect(byCountry(all, "TH").map((x) => x.id)).toEqual(["b"]);
});

test("countries dedupes in dataset order", () => {
  const all = [
    d({ id: "a", country: "Italy", countryCode: "IT" }),
    d({ id: "b", country: "Japan", countryCode: "JP" }),
    d({ id: "c", country: "Italy", countryCode: "IT" }),
  ];
  expect(countries(all)).toEqual([
    { country: "Italy", countryCode: "IT" },
    { country: "Japan", countryCode: "JP" },
  ]);
});

test("flagEmoji", () => {
  expect(flagEmoji("JP")).toBe("🇯🇵");
  expect(flagEmoji("it")).toBe("🇮🇹");
});

test("mapRemoteRow maps snake_case, filters unknown enums, drops invalid rows", () => {
  const row = {
    id: "rio-brazil", name: "Rio", country: "Brazil", country_code: "BR",
    continent: "south-america", themes: ["beach", "bogus"], tags: ["popular", "bogus"],
    blurb: "b", highlights: ["h"], image_url: "https://img", lat: -22.9, lng: -43.2,
  };
  expect(mapRemoteRow(row)).toEqual({
    id: "rio-brazil", name: "Rio", country: "Brazil", countryCode: "BR",
    continent: "south-america", themes: ["beach"], tags: ["popular"],
    blurb: "b", highlights: ["h"], imageUrl: "https://img", lat: -22.9, lng: -43.2,
  });
  expect(mapRemoteRow({ ...row, continent: "atlantis" })).toBeNull();
  expect(mapRemoteRow({ ...row, themes: ["bogus"] })).toBeNull();
  expect(mapRemoteRow({ ...row, image_url: null })).toBeNull();
});

function mockClient(rows: unknown[] | null, error: unknown = null) {
  const order2 = jest.fn().mockResolvedValue({ data: rows, error });
  const order1 = jest.fn().mockReturnValue({ order: order2 });
  return { from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order: order1 }) }) } as never;
}

test("fetchDestinations returns mapped remote rows when non-empty", async () => {
  const rows = [{
    id: "rio-brazil", name: "Rio", country: "Brazil", country_code: "BR",
    continent: "south-america", themes: ["beach"], tags: [],
    blurb: "b", highlights: ["h"], image_url: "https://img", lat: 1, lng: 2,
  }];
  const out = await fetchDestinations(mockClient(rows));
  expect(out.map((x) => x.id)).toEqual(["rio-brazil"]);
});

test("fetchDestinations falls back to bundle when remote empty or all-invalid", async () => {
  const { DESTINATIONS } = await import("./destinations");
  expect(await fetchDestinations(mockClient([]))).toBe(DESTINATIONS);
  expect(await fetchDestinations(mockClient([{ id: "junk" }]))).toBe(DESTINATIONS);
});

test("fetchDestinations throws on query error", async () => {
  await expect(fetchDestinations(mockClient(null, { message: "boom" }))).rejects.toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/myen/tour/mobile && npx jest lib/discover.test.ts`
Expected: FAIL — `Cannot find module './discover'`

- [ ] **Step 3: Write the implementation**

`mobile/lib/discover.ts`:

```ts
// mobile/lib/discover.ts
// Pure selection/filter logic for the Discover tab, plus the remote override
// reader. Screens stay thin; everything here is unit-tested.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DESTINATIONS, THEMES, TAGS, CONTINENTS,
  type Destination, type Theme, type Tag, type Continent,
} from "./destinations";

// Onboarding interests → destination themes.
export const INTEREST_THEMES: Record<string, Theme[]> = {
  scenic: ["nature", "beach"],
  outdoors: ["adventure", "nature"],
  food: ["food"],
  history: ["culture"],
  art: ["culture", "city"],
  nightlife: ["city"],
  shopping: ["city"],
};

export function forYou(all: Destination[], interests: string[], n = 8): Destination[] {
  const wanted = new Set(interests.flatMap((i) => INTEREST_THEMES[i] ?? []));
  const scored = all
    .map((dest, idx) => ({ dest, idx, score: dest.themes.filter((t) => wanted.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.dest.tags.length > 0) - Number(a.dest.tags.length > 0) ||
      a.idx - b.idx,
    )
    .map((x) => x.dest);
  return (scored.length > 0 ? scored : byTag(all, "popular")).slice(0, n);
}

export const byTag = (all: Destination[], tag: Tag) => all.filter((d) => d.tags.includes(tag));
export const byTheme = (all: Destination[], theme: Theme) => all.filter((d) => d.themes.includes(theme));
export const byContinent = (all: Destination[], continent: Continent) => all.filter((d) => d.continent === continent);
export const byCountry = (all: Destination[], countryCode: string) => all.filter((d) => d.countryCode === countryCode);

export function countries(all: Destination[]): { country: string; countryCode: string }[] {
  const seen = new Set<string>();
  return all
    .filter((d) => (seen.has(d.countryCode) ? false : (seen.add(d.countryCode), true)))
    .map((d) => ({ country: d.country, countryCode: d.countryCode }));
}

// "JP" → 🇯🇵 (regional indicator symbols).
export function flagEmoji(countryCode: string): string {
  return [...countryCode.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

const THEME_SET = new Set<string>(THEMES);
const TAG_SET = new Set<string>(TAGS);
const CONTINENT_SET = new Set<string>(CONTINENTS);

// Forward-compat guard: unknown themes/tags are filtered out; a row that ends up
// themeless, or with an unknown continent / missing required field, is dropped.
export function mapRemoteRow(row: Record<string, unknown>): Destination | null {
  const r = row as Record<string, any>;
  const themes = (Array.isArray(r.themes) ? r.themes : []).filter((t: string) => THEME_SET.has(t)) as Theme[];
  const tags = (Array.isArray(r.tags) ? r.tags : []).filter((t: string) => TAG_SET.has(t)) as Tag[];
  if (!r.id || !r.name || !r.country || !r.country_code || !r.image_url) return null;
  if (!CONTINENT_SET.has(r.continent) || themes.length === 0) return null;
  return {
    id: r.id, name: r.name, country: r.country, countryCode: r.country_code,
    continent: r.continent, themes, tags,
    blurb: r.blurb ?? "", highlights: Array.isArray(r.highlights) ? r.highlights : [],
    imageUrl: r.image_url, lat: r.lat ?? 0, lng: r.lng ?? 0,
  };
}

// Remote overrides bundle only when it yields ≥1 valid row.
export async function fetchDestinations(client: SupabaseClient): Promise<Destination[]> {
  const { data, error } = await client.from("destinations").select("*").order("position").order("id");
  if (error) throw error;
  const rows = (data ?? []).map(mapRemoteRow).filter((d): d is Destination => d !== null);
  return rows.length > 0 ? rows : DESTINATIONS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/myen/tour/mobile && npx jest lib/discover.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Full suite + commit**

Run: `cd /home/myen/tour/mobile && npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add mobile/lib/discover.ts mobile/lib/discover.test.ts
git commit -m "feat(discover): selection, filter, and remote-override logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `destinations` table migration

**Files:**
- Create: `supabase/migrations/0008_destinations.sql`

**Interfaces:**
- Produces: `public.destinations` table matching `mapRemoteRow`'s expected columns (Task 2). Not deployed now — `db push` happens at the pending deploy.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0008_destinations.sql`:

```sql
-- Discover content override. Empty by default: the app bundles a static
-- dataset and only switches to these rows when at least one exists.
-- Content is managed via service-role SQL inserts; clients read only.
create table if not exists public.destinations (
  id text primary key,
  name text not null,
  country text not null,
  country_code text not null,
  continent text not null,
  themes text[] not null default '{}',
  tags text[] not null default '{}',
  blurb text not null default '',
  highlights text[] not null default '{}',
  image_url text not null,
  lat double precision not null default 0,
  lng double precision not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.destinations enable row level security;

create policy "destinations readable by authenticated users"
  on public.destinations for select to authenticated using (true);
-- No insert/update/delete policies: writes go through the service role only.
```

- [ ] **Step 2: Sanity-check against the reader**

Confirm every column referenced in `mapRemoteRow` (Task 2) exists: `id, name, country, country_code, continent, themes, tags, blurb, highlights, image_url, lat, lng` — plus `position` used in `fetchDestinations`'s `.order("position")`. Do NOT run `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_destinations.sql
git commit -m "feat(discover): destinations table, select-only RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: GlassPress + expo-blur

**Files:**
- Create: `mobile/components/ui/GlassPress.tsx`
- Modify: `mobile/components/ui/index.ts` (add export)
- Modify: `mobile/package.json` (via `npx expo install expo-blur`)

**Interfaces:**
- Produces: `GlassPress({ children, onPress, className?, style?, disabled? })` — smooth scale/opacity press wrapper used by Tasks 5–7. `expo-blur`'s `BlurView` becomes importable app-wide.

- [ ] **Step 1: Install expo-blur**

Run: `cd /home/myen/tour/mobile && npx expo install expo-blur`
Expected: `expo-blur@~56.x` added to package.json dependencies. (Native dep — needs the already-pending NEW EAS build; do not attempt OTA.)

- [ ] **Step 2: Write GlassPress**

`mobile/components/ui/GlassPress.tsx`:

```tsx
// mobile/components/ui/GlassPress.tsx
// Smooth, non-bouncy press feedback: timing (not spring) to scale 0.97 +
// opacity 0.9. Core RN Animated only — reanimated-wrapped touchables drop
// NativeWind className on device (see lib/noAnimatedClassName.test.ts), so
// className lives on the plain Pressable and the animated node styles via
// `style` alone.
import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, type StyleProp, type ViewStyle } from "react-native";

export function GlassPress({ children, onPress, className, style, disabled }: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const pressed = useRef(new Animated.Value(0)).current;
  const animate = (toValue: number, duration: number) =>
    Animated.timing(pressed, { toValue, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const scale = pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const opacity = pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animate(1, 120)}
      onPressOut={() => animate(0, 180)}
      className={className}
    >
      <Animated.View style={[{ transform: [{ scale }], opacity }, style]}>{children}</Animated.View>
    </Pressable>
  );
}
```

Add to `mobile/components/ui/index.ts` alongside the existing exports:

```ts
export { GlassPress } from "./GlassPress";
```

- [ ] **Step 3: Verify guard + types stay green**

Run: `cd /home/myen/tour/mobile && npx jest lib/noAnimatedClassName.test.ts && npx tsc --noEmit`
Expected: PASS — GlassPress has no `className` on `Animated.View` and no `cssInterop` call.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ui/GlassPress.tsx mobile/components/ui/index.ts mobile/package.json mobile/package-lock.json
git commit -m "feat(ui): GlassPress smooth press animation; add expo-blur

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Discover tab screen

**Files:**
- Create: `mobile/assets/images/logo.png` (copy from `/mnt/c/Users/matth/Downloads/logo.png`)
- Create: `mobile/components/DiscoverCards.tsx`
- Modify: `mobile/app/(app)/(tabs)/discover.tsx` (replace stub)

**Interfaces:**
- Consumes: Task 1 types/data, Task 2 functions, Task 4 `GlassPress`, `BlurView` from `expo-blur`, `Photo`/`Text`/`Screen` from `components/ui`.
- Produces: `DestinationCard({ d, size, onPress })` and `TileCard({ label, imageUrl, onPress, emoji? })` in `DiscoverCards.tsx` — reused by Task 6. Navigates to `/discover-list` (Task 6) and `/destination-detail` (Task 7); those routes exist after their tasks — build order tolerates the forward reference (expo-router resolves at press time, and Tasks 6–7 land before any device run).

- [ ] **Step 1: Copy the logo asset**

Run: `cp /mnt/c/Users/matth/Downloads/logo.png /home/myen/tour/mobile/assets/images/logo.png && ls -la /home/myen/tour/mobile/assets/images/logo.png`
Expected: file exists, non-zero size.

- [ ] **Step 2: Write the shared cards**

`mobile/components/DiscoverCards.tsx`:

```tsx
// mobile/components/DiscoverCards.tsx
// Card primitives shared by the Discover tab and the filtered list screen.
import type { ReactNode } from "react";
import { View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { Destination, Tag } from "../lib/destinations";
import { flagEmoji } from "../lib/discover";
import { GlassPress, Photo, Text } from "./ui";

export const TAG_LABEL: Record<Tag, string> = {
  popular: "Popular",
  trending: "Trending",
  underRadar: "Under the radar",
};

const SCRIM = ["transparent", "rgba(26,14,18,0.72)"] as const;
// Third-party components (LinearGradient, BlurView) are not NativeWind-interop'd:
// style objects only. Photo IS interop'd (see Photo.tsx), so className is fine there.
export const ABS_FILL = { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 } as const;

// Glass pill (BlurView) used for tag badges and flag chips.
// NB: BlurView is third-party — NativeWind does NOT interop it, so className
// would be silently dropped; style only (and cssInterop is banned outside Photo).
export function GlassPill({ children }: { children: ReactNode }) {
  return (
    <BlurView intensity={30} tint="light" style={{ borderRadius: 999, overflow: "hidden" }}>
      <View className="px-3 py-1.5 flex-row items-center gap-1.5 bg-white/25">{children}</View>
    </BlurView>
  );
}

export function DestinationCard({ d, size, onPress }: { d: Destination; size: "lg" | "md"; onPress: () => void }) {
  const dims = size === "lg" ? "w-64 h-80" : "w-40 h-56";
  return (
    <GlassPress onPress={onPress}>
      <View className={`${dims} rounded-xl overflow-hidden bg-surface shadow-card`}>
        <Photo uri={d.imageUrl} cacheKey={d.id} className="absolute inset-0 w-full h-full" />
        <LinearGradient colors={SCRIM} style={ABS_FILL} />
        {d.tags[0] ? (
          <View className="absolute top-3 left-3">
            <GlassPill>
              <Text variant="label" className="text-white">{TAG_LABEL[d.tags[0]]}</Text>
            </GlassPill>
          </View>
        ) : null}
        <View className="absolute bottom-3 left-3 right-3">
          <Text variant={size === "lg" ? "heading" : "label"} className="text-white" numberOfLines={1}>{d.name}</Text>
          <Text variant="caption" className="text-white/85" numberOfLines={1}>
            {flagEmoji(d.countryCode)} {d.country}
          </Text>
        </View>
      </View>
    </GlassPress>
  );
}

// Theme / continent tile: image background + centered label.
export function TileCard({ label, imageUrl, onPress }: { label: string; imageUrl?: string; onPress: () => void }) {
  return (
    <GlassPress onPress={onPress}>
      <View className="w-36 h-24 rounded-xl overflow-hidden bg-surface shadow-card items-center justify-center">
        {imageUrl ? <Photo uri={imageUrl} cacheKey={`tile-${label}`} className="absolute inset-0 w-full h-full" /> : null}
        <LinearGradient colors={SCRIM} style={ABS_FILL} />
        <Text variant="label" className="text-white">{label}</Text>
      </View>
    </GlassPress>
  );
}
```

- [ ] **Step 3: Replace the Discover stub**

`mobile/app/(app)/(tabs)/discover.tsx`:

```tsx
// mobile/app/(app)/(tabs)/discover.tsx
// Polarsteps-style explore: bundled dataset renders instantly (initialData);
// the destinations table overrides it when non-empty.
import type { ReactElement, ReactNode } from "react";
import { View, FlatList, Image } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { getProfile } from "../../../lib/profile";
import { DESTINATIONS, THEMES, CONTINENTS, type Destination, type Theme, type Continent } from "../../../lib/destinations";
import { fetchDestinations, forYou, byTag, byTheme, byContinent, countries, flagEmoji } from "../../../lib/discover";
import { Screen, Text, GlassPress } from "../../../components/ui";
import { DestinationCard, TileCard, GlassPill } from "../../../components/DiscoverCards";

const THEME_LABEL: Record<Theme, string> = {
  nature: "Nature", adventure: "Adventure", culture: "Culture", food: "Food",
  wildlife: "Wildlife", city: "City", beach: "Beach",
};
const CONTINENT_LABEL: Record<Continent, string> = {
  africa: "Africa", asia: "Asia", europe: "Europe",
  "north-america": "North America", oceania: "Oceania", "south-america": "South America",
};

function Carousel<T>({ data, keyOf, render }: { data: T[]; keyOf: (item: T) => string; render: (item: T) => ReactElement }) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={keyOf}
      renderItem={({ item }) => render(item)}
      showsHorizontalScrollIndicator={false}
      className="-mx-6"
      contentContainerClassName="px-6 gap-3"
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

export default function Discover() {
  const router = useRouter();
  const { data: all } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => fetchDestinations(supabase),
    initialData: DESTINATIONS,
  });
  const { data: prefs } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile(supabase) });

  const openDetail = (d: Destination) => router.push({ pathname: "/destination-detail", params: { id: d.id } });
  const openList = (type: string, value: string) => router.push({ pathname: "/discover-list", params: { type, value } });

  const card = (size: "lg" | "md") => (d: Destination) => <DestinationCard d={d} size={size} onPress={() => openDetail(d)} />;

  return (
    <Screen scroll className="pb-32 gap-6">
      <View className="flex-row items-center gap-3">
        <Image source={require("../../../assets/images/logo.png")} style={{ width: 32, height: 32 }} />
        <Text variant="display">Discover</Text>
      </View>

      <Carousel
        data={countries(all)}
        keyOf={(c) => c.countryCode}
        render={(c) => (
          <GlassPress onPress={() => openList("country", c.countryCode)}>
            <GlassPill>
              <Text variant="label">{flagEmoji(c.countryCode)} {c.country}</Text>
            </GlassPill>
          </GlassPress>
        )}
      />

      <Section title="For you">
        <Carousel data={forYou(all, prefs?.interests ?? [])} keyOf={(d) => d.id} render={card("lg")} />
      </Section>

      <Section title="Under the radar">
        <Carousel data={byTag(all, "underRadar")} keyOf={(d) => d.id} render={card("md")} />
      </Section>

      <Section title="Browse by theme">
        <Carousel
          data={[...THEMES]}
          keyOf={(t) => t}
          render={(t) => <TileCard label={THEME_LABEL[t]} imageUrl={byTheme(all, t)[0]?.imageUrl} onPress={() => openList("theme", t)} />}
        />
      </Section>

      <Section title="Popular">
        <Carousel data={byTag(all, "popular")} keyOf={(d) => d.id} render={card("md")} />
      </Section>

      <Section title="Trending this month">
        <Carousel data={byTag(all, "trending")} keyOf={(d) => d.id} render={card("md")} />
      </Section>

      <Section title="Browse by continent">
        <Carousel
          data={[...CONTINENTS]}
          keyOf={(c) => c}
          render={(c) => <TileCard label={CONTINENT_LABEL[c]} imageUrl={byContinent(all, c)[0]?.imageUrl} onPress={() => openList("continent", c)} />}
        />
      </Section>
    </Screen>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd /home/myen/tour/mobile && npx tsc --noEmit && npm test`
Expected: tsc clean; all jest suites (incl. `noAnimatedClassName`) green. Note: `/destination-detail` and `/discover-list` don't exist until Tasks 6–7 — expo-router's typed routes are not enabled in this repo, so tsc does not flag the forward references.

- [ ] **Step 5: Commit**

```bash
git add mobile/assets/images/logo.png mobile/components/DiscoverCards.tsx "mobile/app/(app)/(tabs)/discover.tsx"
git commit -m "feat(discover): explore tab with For You, tags, themes, continents

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Filtered list screen

**Files:**
- Create: `mobile/app/(app)/discover-list.tsx`

**Interfaces:**
- Consumes: Task 2 filters + `flagEmoji`, Task 5 `DestinationCard`, route params `{ type: "country" | "theme" | "continent" | "tag"; value: string }`.
- Produces: `/discover-list` route used by the Discover tab.

- [ ] **Step 1: Write the screen**

`mobile/app/(app)/discover-list.tsx`:

```tsx
// mobile/app/(app)/discover-list.tsx
// One screen serves every Discover filter (country / theme / continent / tag):
// 2-column grid of destination cards.
import { View, FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { DESTINATIONS, type Destination, type Theme, type Tag, type Continent } from "../../lib/destinations";
import { fetchDestinations, byCountry, byTheme, byContinent, byTag, flagEmoji } from "../../lib/discover";
import { Screen, Text, EmptyState, Icon, GlassPress } from "../../components/ui";
import { DestinationCard, TAG_LABEL } from "../../components/DiscoverCards";

const TITLE_CASE = (s: string) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function DiscoverList() {
  const router = useRouter();
  const { type, value } = useLocalSearchParams<{ type?: string; value?: string }>();
  const { data: all } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => fetchDestinations(supabase),
    initialData: DESTINATIONS,
  });

  let list: Destination[] = [];
  let title = "Discover";
  if (type === "country" && value) {
    list = byCountry(all, value);
    title = `${flagEmoji(value)} ${list[0]?.country ?? value}`;
  } else if (type === "theme" && value) {
    list = byTheme(all, value as Theme);
    title = TITLE_CASE(value);
  } else if (type === "continent" && value) {
    list = byContinent(all, value as Continent);
    title = TITLE_CASE(value);
  } else if (type === "tag" && value) {
    list = byTag(all, value as Tag);
    title = TAG_LABEL[value as Tag] ?? TITLE_CASE(value);
  }

  return (
    <Screen>
      <View className="flex-row items-center gap-3 mb-4">
        <GlassPress onPress={() => router.back()}>
          <View className="w-10 h-10 rounded-pill bg-surface items-center justify-center shadow-card">
            <Ionicons name="chevron-back" size={20} color="#1A0E12" />
          </View>
        </GlassPress>
        <Text variant="title" numberOfLines={1} className="flex-1">{title}</Text>
      </View>
      {list.length === 0 ? (
        <EmptyState icon={<Icon name="compass" size={28} color="#6B5560" />} title="Nothing here yet" subtitle="Try another filter." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerClassName="gap-3 pb-32"
          renderItem={({ item }) => (
            <View className="flex-1">
              <DestinationCard d={item} size="md" onPress={() => router.push({ pathname: "/destination-detail", params: { id: item.id } })} />
            </View>
          )}
        />
      )}
    </Screen>
  );
}
```

Note: `DestinationCard`'s `md` size is fixed-width `w-40`; inside a 2-column grid wrap it in `flex-1` as above — if the fixed width fights the column width visually, change `DestinationCard` to accept `size: "lg" | "md" | "grid"` where `grid` uses `w-full h-56` (keep `lg`/`md` untouched for carousels).

- [ ] **Step 2: Verify**

Run: `cd /home/myen/tour/mobile && npx tsc --noEmit && npm test`
Expected: green. (`Icon` name `compass` already exists — the old stub used it.)

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/discover-list.tsx" mobile/components/DiscoverCards.tsx
git commit -m "feat(discover): filtered destination list screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Destination detail screen

**Files:**
- Create: `mobile/app/(app)/destination-detail.tsx`

**Interfaces:**
- Consumes: Task 1 data, Task 2 `fetchDestinations`/`flagEmoji`, Task 4 `GlassPress` + `BlurView`, Task 5 `TAG_LABEL`/`GlassPill`, route param `{ id: string }`.
- Produces: `/destination-detail` route; pushes `/onboarding?destination=<Name, Country>` (Task 8 makes onboarding consume it).

- [ ] **Step 1: Write the screen**

`mobile/app/(app)/destination-detail.tsx`:

```tsx
// mobile/app/(app)/destination-detail.tsx
// Full-bleed hero + facts + sticky glass "Plan a trip" bar. The CTA seeds
// onboarding with "Name, Country" free text (no placeId — generation handles it).
import { View, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { DESTINATIONS } from "../../lib/destinations";
import { fetchDestinations, flagEmoji } from "../../lib/discover";
import { Screen, Text, Button, EmptyState, Icon, Photo, GlassPress } from "../../components/ui";
import { TAG_LABEL, GlassPill } from "../../components/DiscoverCards";

export default function DestinationDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: all } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => fetchDestinations(supabase),
    initialData: DESTINATIONS,
  });
  const d = all.find((x) => x.id === id);

  if (!d) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="compass" size={28} color="#6B5560" />} title="Destination not found" subtitle="It may have been removed." action={<Button title="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="pb-40">
        <View className="h-96">
          <Photo uri={d.imageUrl} cacheKey={d.id} className="absolute inset-0 w-full h-full" />
          <LinearGradient colors={["transparent", "rgba(26,14,18,0.72)"]} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
          <View style={{ top: insets.top + 8 }} className="absolute left-6">
            <GlassPress onPress={() => router.back()}>
              {/* BlurView: style only — NativeWind doesn't interop third-party components */}
              <BlurView intensity={30} tint="light" style={{ borderRadius: 999, overflow: "hidden" }}>
                <View className="w-10 h-10 items-center justify-center bg-white/25">
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </View>
              </BlurView>
            </GlassPress>
          </View>
          <View className="absolute bottom-5 left-6 right-6 gap-2">
            {d.tags[0] ? (
              <View className="self-start">
                <GlassPill><Text variant="label" className="text-white">{TAG_LABEL[d.tags[0]]}</Text></GlassPill>
              </View>
            ) : null}
            <Text variant="display" className="text-white">{d.name}</Text>
            <Text variant="body" className="text-white/85">{flagEmoji(d.countryCode)} {d.country}</Text>
          </View>
        </View>

        <View className="px-6 py-5 gap-5">
          <Text variant="body" className="text-ink-muted">{d.blurb}</Text>
          <View className="gap-3">
            <Text variant="heading">Highlights</Text>
            <View className="flex-row flex-wrap gap-2">
              {d.highlights.map((h) => (
                <View key={h} className="px-4 py-2 rounded-pill bg-surface border border-border">
                  <Text variant="label">{h}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {d.themes.map((t) => (
              <View key={t} className="px-3 py-1.5 rounded-pill bg-accent-soft">
                <Text variant="label" className="text-accent">{t[0].toUpperCase() + t.slice(1)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <BlurView intensity={40} tint="light" style={{ position: "absolute", bottom: 0, left: 0, right: 0, overflow: "hidden" }}>
        <View className="px-6 pt-4 bg-white/60" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button
            title="Plan a trip"
            size="lg"
            variant="gradient"
            onPress={() => router.push({ pathname: "/onboarding", params: { destination: `${d.name}, ${d.country}` } })}
          />
        </View>
      </BlurView>
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd /home/myen/tour/mobile && npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/destination-detail.tsx"
git commit -m "feat(discover): destination detail screen with plan-a-trip CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Onboarding `destination` param

**Files:**
- Modify: `mobile/lib/onboarding.ts` (add `withDestination`)
- Modify: `mobile/lib/onboarding.test.ts` (add tests)
- Modify: `mobile/app/(app)/onboarding.tsx:62-83` (consume param)

**Interfaces:**
- Consumes: `OnboardingState`, `stateFromProfile` (existing).
- Produces: `withDestination(s: OnboardingState, destination?: string): OnboardingState` — pure seeding helper.

- [ ] **Step 1: Write the failing tests**

Append to `mobile/lib/onboarding.test.ts` (it already imports from `./onboarding`; extend that import with `withDestination` and reuse the file's existing `base` state fixture):

```ts
test("withDestination seeds location", () => {
  expect(withDestination(base, "Kyoto, Japan").location).toBe("Kyoto, Japan");
  expect(withDestination(base, "  Kyoto, Japan  ").location).toBe("Kyoto, Japan");
});

test("withDestination is a no-op without a destination", () => {
  expect(withDestination(base, undefined)).toBe(base);
  expect(withDestination(base, "")).toBe(base);
  expect(withDestination(base, "   ")).toBe(base);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/myen/tour/mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `withDestination` is not exported.

- [ ] **Step 3: Implement**

Add to `mobile/lib/onboarding.ts` (after `stateFromRequest`):

```ts
// Seed the destination step from a route param (Discover's "Plan a trip").
export function withDestination(s: OnboardingState, destination?: string): OnboardingState {
  const loc = destination?.trim();
  return loc ? { ...s, location: loc } : s;
}
```

In `mobile/app/(app)/onboarding.tsx`, change the `expo-router` import to include `useLocalSearchParams`, then modify the initial state + profile effect (currently lines 62–83):

```tsx
const { destination } = useLocalSearchParams<{ destination?: string }>();
// ...
const [state, setState] = useState<OnboardingState>(
  seedRequest ? stateFromRequest(seedRequest) : withDestination(stateFromProfile(null), destination),
);
// ...
useEffect(() => {
  if (seedRequest) return; // editing an existing trip — don't clobber it with profile defaults
  getProfile(supabase).then((prefs) => setState(withDestination(stateFromProfile(prefs), destination))).catch(() => {});
}, []);
```

(The profile effect must also apply `withDestination`, otherwise the async profile load would clobber the seeded location. `stateFromRequest` still wins — editing an existing trip ignores the param.)

Also extend the `lib/onboarding.ts` import in `onboarding.tsx` to include `withDestination`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/myen/tour/mobile && npx jest lib/onboarding.test.ts && npx tsc --noEmit && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): seed destination from Discover route param

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-plan (deploy checklist, not tasks)

- `supabase db push` for `0008_destinations.sql` — at the next deploy, together with the already-pending items.
- Device smoke rides the already-pending NEW EAS build (expo-blur is a native dep; no OTA).
- Smoke script: Discover renders all 7 sections with images → flag chip → filtered list → card → detail → "Plan a trip" → onboarding shows the destination prefilled → press feedback is smooth/non-bouncy on device.
