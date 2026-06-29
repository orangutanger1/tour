import { getStopCoords, decodePolyline, numberStops } from "./poi";
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

test("decodes the canonical Google polyline", () => {
  const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  expect(pts.map((p) => [Math.round(p.latitude * 1000) / 1000, Math.round(p.longitude * 1000) / 1000]))
    .toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

import { formatDwell } from "./poi";

test("numberStops numbers real stops, skips meal-gaps", () => {
  const out = numberStops([
    { placeId: "A", kind: "attraction" },
    { placeId: "", kind: "meal-gap" },
    { placeId: "B", kind: "attraction" },
    { placeId: "", kind: "meal-gap" },
  ]);
  expect(out.map((s) => s.num)).toEqual([1, null, 2, null]);
});

test("formatDwell formats hours and minutes", () => {
  expect(formatDwell(45)).toBe("~45 min");
  expect(formatDwell(60)).toBe("~1h");
  expect(formatDwell(90)).toBe("~1h 30m");
  expect(formatDwell(undefined)).toBeNull();
});
