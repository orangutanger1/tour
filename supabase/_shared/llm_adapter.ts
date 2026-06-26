// supabase/_shared/llm_adapter.ts
import type { HttpFetch, LlmComplete } from "./types.ts";

// Provider-neutral adapter. The request body and response path below are a
// generic shape; adjust both to the bench-test winner. Tests pin the contract
// (prompt in, text out, throw on non-OK), not the provider.
// ponytail: single-provider seam. Add a provider switch only if two run live.
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
      body: JSON.stringify({ model: opts.model, prompt }),
    });
    if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
    const data = await res.json() as { output?: string };
    return data.output ?? "";
  };
}
