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

export type GalleryStyle = "polaroid" | "clean";

// Stored in default_prefs.galleryStyle. Deliberately bypasses getProfile's
// interests-array guard so a user who hasn't onboarded still has a working toggle.
export async function getGalleryStyle(client: SupabaseClient): Promise<GalleryStyle> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return "polaroid";
  const { data } = await client.from("profiles").select("default_prefs").eq("id", user.id).maybeSingle();
  const style = (data?.default_prefs as { galleryStyle?: string } | null)?.galleryStyle;
  return style === "clean" ? "clean" : "polaroid";
}

export async function setGalleryStyle(client: SupabaseClient, style: GalleryStyle): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { data } = await client.from("profiles").select("default_prefs").eq("id", user.id).maybeSingle();
  const prefs = (data?.default_prefs as Record<string, unknown>) ?? {};
  const { error } = await client.from("profiles").upsert({ id: user.id, default_prefs: { ...prefs, galleryStyle: style } });
  if (error) throw error;
}

// Human name for the account header: OAuth metadata (Google/Apple) first,
// then the email local-part for OTP sign-ins.
export function displayName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
): string {
  const meta = user?.user_metadata ?? {};
  const metaName = [meta.full_name, meta.name]
    .find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (metaName) return metaName.trim();
  const local = user?.email?.split("@")[0];
  return local || "Traveler";
}

export function generateUsername(base: string, rand: () => number = Math.random): string {
  const first = base.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") || "traveler";
  const digits = String(Math.floor(rand() * 10000)).padStart(4, "0");
  return `${first}${digits}`;
}

// Funnel/segmentation answers (onboarding quiz + attribution) — merged into
// default_prefs as extra camelCase keys, same as galleryStyle. Not part of
// Prefs: these never feed a GenerateRequest.
export async function saveFunnelAnswers(client: SupabaseClient, answers: Record<string, unknown>): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const { data } = await client.from("profiles").select("default_prefs").eq("id", user.id).maybeSingle();
  const prefs = (data?.default_prefs as Record<string, unknown>) ?? {};
  const { error } = await client.from("profiles").upsert({ id: user.id, default_prefs: { ...prefs, ...answers } });
  if (error) throw error;
}

// Generate-once handle. Unique constraint arbitrates collisions: retry with
// fresh digits, give up after 3 (retried on the next account visit).
export async function ensureUsername(
  client: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  rand?: () => number,
): Promise<string | null> {
  const { data, error: selectError } = await client.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (selectError) throw selectError;
  const existing = (data as { username?: string | null } | null)?.username;
  if (existing) return existing;
  for (let i = 0; i < 3; i++) {
    const candidate = generateUsername(displayName(user), rand);
    const { error } = await client.from("profiles").upsert({ id: user.id, username: candidate });
    if (!error) return candidate;
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  return null;
}
