// mobile/lib/postAuth.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { listTrips } from "./trips";
// After any successful auth (Apple, Google, email OTP): brand-new users go straight
// into plan-a-trip onboarding, everyone else lands on their trips. Trip count is the
// signal — which button they pressed isn't reliable (OAuth can't tell sign-up from
// log-in, and users forget which they used).
export function postAuthRoute(tripCount: number | undefined): "/onboarding" | "/" {
  return tripCount === 0 ? "/onboarding" : "/";
}

export async function resolvePostAuthRoute(client: SupabaseClient): Promise<"/onboarding" | "/"> {
  try {
    return postAuthRoute((await listTrips(client)).length);
  } catch {
    return postAuthRoute(undefined); // can't tell — home is the safe landing
  }
}
