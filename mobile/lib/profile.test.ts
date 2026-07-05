import { getProfile, upsertProfile, getGalleryStyle, displayName, generateUsername, ensureUsername, saveFunnelAnswers } from "./profile";
import type { Prefs } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const prefs: Prefs = { interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced" };

function fakeClient(opts: {
  user?: { id: string } | null;
  selectResult?: { data: unknown; error: unknown };
  upsertResult?: { error: unknown };
  onUpsert?: (row: unknown) => void;
}): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: "u1" } : opts.user } }) },
    from: (_table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => opts.selectResult ?? { data: null, error: null } }) }),
      upsert: async (row: unknown) => { opts.onUpsert?.(row); return opts.upsertResult ?? { error: null }; },
    }),
  } as unknown as SupabaseClient;
}

test("getProfile returns prefs from default_prefs", async () => {
  const client = fakeClient({ selectResult: { data: { default_prefs: prefs }, error: null } });
  expect(await getProfile(client)).toEqual(prefs);
});

test("getProfile returns null when no row", async () => {
  const client = fakeClient({ selectResult: { data: null, error: null } });
  expect(await getProfile(client)).toBeNull();
});

test("getProfile returns null when no user", async () => {
  const client = fakeClient({ user: null });
  expect(await getProfile(client)).toBeNull();
});

test("getProfile throws on query error", async () => {
  const client = fakeClient({ selectResult: { data: null, error: { message: "boom" } } });
  await expect(getProfile(client)).rejects.toBeTruthy();
});

test("upsertProfile upserts id + default_prefs", async () => {
  let row: unknown;
  const client = fakeClient({ onUpsert: (r) => { row = r; } });
  await upsertProfile(client, prefs);
  expect(row).toEqual({ id: "u1", default_prefs: prefs });
});

test("upsertProfile throws when not authenticated", async () => {
  const client = fakeClient({ user: null });
  await expect(upsertProfile(client, prefs)).rejects.toBeTruthy();
});

test("upsertProfile throws on upsert error", async () => {
  const client = fakeClient({ upsertResult: { error: { message: "no" } } });
  await expect(upsertProfile(client, prefs)).rejects.toBeTruthy();
});

function styleClient(default_prefs: unknown): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_prefs }, error: null }) }) }) }),
  } as unknown as SupabaseClient;
}

test("getGalleryStyle returns stored clean", async () => {
  expect(await getGalleryStyle(styleClient({ galleryStyle: "clean" }))).toBe("clean");
});

test("getGalleryStyle defaults to polaroid when absent", async () => {
  expect(await getGalleryStyle(styleClient({}))).toBe("polaroid");
});

test("getGalleryStyle defaults to polaroid when no user", async () => {
  const client = { auth: { getUser: async () => ({ data: { user: null } }) } } as unknown as SupabaseClient;
  expect(await getGalleryStyle(client)).toBe("polaroid");
});

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

test("generateUsername takes first name, lowercased, plus 4 digits", () => {
  expect(generateUsername("Tash Any", () => 0.4821)).toBe("tash4821");
});

test("generateUsername strips non-alphanumerics and pads digits", () => {
  expect(generateUsername("Й!  ", () => 0.0007)).toBe("traveler0007");
  expect(generateUsername("O'Brien Smith", () => 0.9999)).toBe("obrien9999");
});

function usernameClient(opts: {
  existing?: string | null;
  selectError?: { code: string } | null;
  upsertErrors?: ({ code: string } | null)[];
  onUpsert?: (row: unknown) => void;
}): SupabaseClient {
  let call = 0;
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.selectError ? null : { username: opts.existing ?? null }, error: opts.selectError ?? null }) }) }),
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

test("ensureUsername throws when the username read fails", async () => {
  let wrote = false;
  const client = usernameClient({ selectError: { code: "XX000" }, onUpsert: () => { wrote = true; } });
  await expect(ensureUsername(client, u1)).rejects.toBeTruthy();
  expect(wrote).toBe(false);
});

function profileMergeClient(opts: { existing?: Record<string, unknown>; onUpsert?: (row: unknown) => void }): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_prefs: opts.existing ?? {} }, error: null }) }) }),
      upsert: async (row: unknown) => { opts.onUpsert?.(row); return { error: null }; },
    }),
  } as unknown as SupabaseClient;
}

test("saveFunnelAnswers merges new keys into existing default_prefs", async () => {
  let row: unknown;
  const client = profileMergeClient({ existing: { interests: ["food"] }, onUpsert: (r) => { row = r; } });
  await saveFunnelAnswers(client, { planningCheck: "great", hardestParts: [], goals: [] });
  expect(row).toEqual({
    id: "u1",
    default_prefs: { interests: ["food"], planningCheck: "great", hardestParts: [], goals: [] },
  });
});

test("saveFunnelAnswers is a no-op when signed out", async () => {
  let wrote = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ upsert: async () => { wrote = true; return { error: null }; } }),
  } as unknown as SupabaseClient;
  await saveFunnelAnswers(client, { goals: ["saveTime"] });
  expect(wrote).toBe(false);
});
