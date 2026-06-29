// supabase/_shared/llm_adapter.ts
import type { HttpFetch, LlmComplete } from "./types.ts";

// OpenAI-compatible chat-completions adapter. Works with OpenRouter
// (https://openrouter.ai/api/v1/chat/completions) and any OpenAI-shaped endpoint;
// swap providers by changing LLM_ENDPOINT/LLM_MODEL/LLM_API_KEY only. Tests pin
// the contract (prompt in, text out, throw on non-OK), not the provider.
// ponytail: single chat shape. Add a provider switch only if a non-OpenAI API runs live.
// Default per-call ceiling. The Edge function's gateway times out the whole
// request (504); bounding each LLM call turns a hung provider into a fast,
// retryable failure (curate -> CurationError -> 502) instead of an opaque 504.
const DEFAULT_TIMEOUT_MS = 30_000;

export function makeLlmComplete(opts: {
  httpFetch: HttpFetch;
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutMs?: number;
}): LlmComplete {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (prompt: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await opts.httpFetch(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  };
}
