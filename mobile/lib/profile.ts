// mobile/lib/profile.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Prefs } from "./types";

export async function getProfile(client: SupabaseClient): Promise<Prefs | null> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("default_prefs")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  const prefs = (data?.default_prefs ?? null) as Prefs | null;
  return prefs && Array.isArray(prefs.interests) ? prefs : null;
}

export async function upsertProfile(client: SupabaseClient, prefs: Prefs): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { error } = await client.from("profiles").upsert({ id: user.id, default_prefs: prefs });
  if (error) throw error;
}
