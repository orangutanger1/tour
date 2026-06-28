// supabase/_shared/llm_adapter.ts
import type { HttpFetch, LlmComplete } from "./types.ts";

// OpenAI-compatible chat-completions adapter. Works with OpenRouter
// (https://openrouter.ai/api/v1/chat/completions) and any OpenAI-shaped endpoint;
// swap providers by changing LLM_ENDPOINT/LLM_MODEL/LLM_API_KEY only. Tests pin
// the contract (prompt in, text out, throw on non-OK), not the provider.
// ponytail: single chat shape. Add a provider switch only if a non-OpenAI API runs live.
export function makeLlmComplete(opts: {
  httpFetch: HttpFetch;
  apiKey: string;
  endpoint: string;
  model: string;
}): LlmComplete {
  return async (prompt: string) => {
    const res = await opts.httpFetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  };
}
