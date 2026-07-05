// supabase/functions/delete-account/index.ts
// In-app account deletion (App Store Guideline 5.1.1(v)). The caller must be
// authenticated; we delete their private photo objects, then the auth user.
// Every user table FKs auth.users ON DELETE CASCADE (trips, trip_photos,
// profiles), so deleteUser wipes all rows — only Storage needs manual cleanup.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "trip-photos";

// Recursively remove everything under `prefix`. Object layout is
// {userId}/{tripId}/{uuid}.jpg, so folders (id === null) recurse one level.
async function removeTree(admin: SupabaseClient, prefix: string): Promise<void> {
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files: string[] = [];
  for (const item of data) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) await removeTree(admin, path); // folder
    else files.push(path);
  }
  if (files.length) await admin.storage.from(BUCKET).remove(files);
}

Deno.serve(async (req: Request) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const userId = userData.user.id;

  await removeTree(admin, userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
