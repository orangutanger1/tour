// supabase/functions/review-login/index.ts
// App Review sign-in bypass. The app is login-gated behind Apple / Google /
// email-OTP — an App Store reviewer can't receive an OTP or use our social
// accounts, so this mints a one-time code for a single throwaway review inbox.
// The reviewer types REVIEW_EMAIL, taps "Send code", and the client verifies
// the returned OTP automatically. Only ever provisions/logs into that one
// account, so exposing it unauthenticated grants nothing but the demo sandbox.
// ponytail: guarded to a single hardcoded email; no secret to leak or rotate.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Keep in sync with REVIEW_EMAIL in mobile/lib/review.ts.
const REVIEW_EMAIL = Deno.env.get("REVIEW_EMAIL") ?? "appreview@usebeacon.app";

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Provision the review account on first use; ignore "already registered".
  await admin.auth.admin.createUser({ email: REVIEW_EMAIL, email_confirm: true });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: REVIEW_EMAIL });
  if (error || !data.properties?.email_otp) {
    return new Response(JSON.stringify({ error: error?.message ?? "no otp" }), { status: 500 });
  }
  return new Response(JSON.stringify({ otp: data.properties.email_otp }), { status: 200 });
});
