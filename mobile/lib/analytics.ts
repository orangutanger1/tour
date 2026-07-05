// mobile/lib/analytics.ts
import type { SupabaseClient } from "@supabase/supabase-js";

// Fire-and-forget funnel event. Never throws — analytics must not break the app.
// user_id is filled server-side (column default auth.uid()).
export async function track(
  client: SupabaseClient,
  event: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await client.from("analytics_events").insert({ event, props });
    if (error && __DEV__) console.warn("analytics:", error.message);
  } catch (e) {
    if (__DEV__) console.warn("analytics:", e);
  }
}
