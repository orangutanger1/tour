// supabase/functions/places-autocomplete/handler_test.ts
import { assertEquals } from "jsr:@std/assert";
import { handleAutocomplete } from "./handler.ts";

Deno.test("handleAutocomplete returns suggestion objects", async () => {
  const out = await handleAutocomplete({ query: "Lisbon" }, {
    search: () => Promise.resolve([{ text: "Lisbon, Portugal", placeId: "p1" }]),
  });
  assertEquals(out.status, 200);
  assertEquals(out.body, { suggestions: [{ text: "Lisbon, Portugal", placeId: "p1" }] });
});

Deno.test("rejects short query", async () => {
  const r = await handleAutocomplete({ query: "a" }, { search: () => Promise.resolve([]) });
  assertEquals(r.status, 400);
});

Deno.test("maps upstream error to 502", async () => {
  const r = await handleAutocomplete({ query: "Lis" }, { search: () => Promise.reject(new Error("boom")) });
  assertEquals(r.status, 502);
});
