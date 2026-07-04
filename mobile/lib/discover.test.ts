import { type Destination, DESTINATIONS } from "./destinations";
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
  expect(await fetchDestinations(mockClient([]))).toBe(DESTINATIONS);
  expect(await fetchDestinations(mockClient([{ id: "junk" }]))).toBe(DESTINATIONS);
});

test("fetchDestinations throws on query error", async () => {
  await expect(fetchDestinations(mockClient(null, { message: "boom" }))).rejects.toBeTruthy();
});
