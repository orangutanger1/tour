// supabase/_shared/llm_adapter_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { makeLlmComplete } from "./llm_adapter.ts";

function res(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("adapter sends the prompt as a chat message and returns content", async () => {
  let sentBody = ""; let auth = "";
  const httpFetch = (_url: string, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    auth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
    return Promise.resolve(res({ choices: [{ message: { content: "the itinerary json" } }] }));
  };
  const complete = makeLlmComplete({ httpFetch, apiKey: "k", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "m1" });
  const out = await complete("PLAN THIS TRIP");
  const body = JSON.parse(sentBody) as { model: string; messages: { role: string; content: string }[] };
  assertEquals(body.model, "m1");
  assertEquals(body.messages[0].role, "user");
  assertStringIncludes(body.messages[0].content, "PLAN THIS TRIP");
  assertEquals(auth, "Bearer k");
  assertEquals(out, "the itinerary json");
});

Deno.test("adapter returns empty string when no content", async () => {
  const complete = makeLlmComplete({ httpFetch: () => Promise.resolve(res({ choices: [] })), apiKey: "k", endpoint: "https://x", model: "m1" });
  assertEquals(await complete("x"), "");
});

Deno.test("adapter throws on non-OK", async () => {
  const complete = makeLlmComplete({ httpFetch: () => Promise.resolve(res({}, false, 500)), apiKey: "k", endpoint: "https://x", model: "m1" });
  let threw = false;
  try { await complete("x"); } catch { threw = true; }
  assert(threw);
});
