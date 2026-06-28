// supabase/functions/places-autocomplete/handler_test.ts
import { assertEquals } from "jsr:@std/assert";
import { handleAutocomplete } from "./handler.ts";

Deno.test("rejects short query", async () => {
  const r = await handleAutocomplete({ query: "a" }, { search: () => Promise.resolve([]) });
  assertEquals(r.status, 400);
});

Deno.test("returns suggestions on success", async () => {
  const r = await handleAutocomplete({ query: "Lis" }, { search: () => Promise.resolve(["Lisbon, Portugal"]) });
  assertEquals(r.status, 200);
  assertEquals(r.body, { suggestions: ["Lisbon, Portugal"] });
});

Deno.test("maps upstream error to 502", async () => {
  const r = await handleAutocomplete({ query: "Lis" }, { search: () => Promise.reject(new Error("boom")) });
  assertEquals(r.status, 502);
});
