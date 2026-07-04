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
