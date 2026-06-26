// supabase/_shared/llm_adapter_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { makeLlmComplete } from "./llm_adapter.ts";

function res(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("adapter sends the prompt and returns text", async () => {
  let sentBody = "";
  const httpFetch = (_url: string, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    return Promise.resolve(res({ output: "the itinerary json" }));
  };
  const complete = makeLlmComplete({ httpFetch, apiKey: "k", endpoint: "https://llm.example/generate", model: "m1" });
  const out = await complete("PLAN THIS TRIP");
  assertStringIncludes(sentBody, "PLAN THIS TRIP");
  assertEquals(out, "the itinerary json");
});

Deno.test("adapter throws on non-OK", async () => {
  const complete = makeLlmComplete({ httpFetch: () => Promise.resolve(res({}, false, 500)), apiKey: "k", endpoint: "https://llm.example/generate", model: "m1" });
  let threw = false;
  try { await complete("x"); } catch { threw = true; }
  assert(threw);
});
