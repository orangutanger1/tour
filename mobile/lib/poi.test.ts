import { getStopCoords } from "./poi";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeClient(opts: {
  result?: { data: unknown; error: unknown };
  onIn?: (col: string, ids: string[]) => void;
}): SupabaseClient {
  return {
    from: (_table: string) => ({
      select: () => ({
        in: (col: string, ids: string[]) => { opts.onIn?.(col, ids); return Promise.resolve(opts.result ?? { data: [], error: null }); },
      }),
    }),
  } as unknown as SupabaseClient;
}

test("returns {} for empty placeIds without querying", async () => {
  let called = false;
  const client = fakeClient({ onIn: () => { called = true; } });
  expect(await getStopCoords(client, [])).toEqual({});
  expect(called).toBe(false);
});

test("maps cached_pois payload to coords keyed by place_id", async () => {
  const client = fakeClient({
    result: {
      data: [
        { place_id: "A", payload: { lat: 1, lng: 2, name: "Alpha" } },
        { place_id: "B", payload: { lat: 3, lng: 4, name: "Beta" } },
      ],
      error: null,
    },
  });
  expect(await getStopCoords(client, ["A", "B"])).toEqual({
    A: { lat: 1, lng: 2, name: "Alpha" },
    B: { lat: 3, lng: 4, name: "Beta" },
  });
});

test("queries place_id with the given ids", async () => {
  let col = ""; let ids: string[] = [];
  const client = fakeClient({ onIn: (c, i) => { col = c; ids = i; } });
  await getStopCoords(client, ["X"]);
  expect(col).toBe("place_id");
  expect(ids).toEqual(["X"]);
});

test("throws on query error", async () => {
  const client = fakeClient({ result: { data: null, error: { message: "boom" } } });
  await expect(getStopCoords(client, ["A"])).rejects.toBeTruthy();
});
