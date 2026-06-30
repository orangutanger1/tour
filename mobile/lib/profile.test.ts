import { getProfile, upsertProfile, getGalleryStyle } from "./profile";
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
