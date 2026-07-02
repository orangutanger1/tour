// mobile/lib/postAuth.ts
// After any successful auth (Apple, Google, email OTP): brand-new users go straight
// into plan-a-trip onboarding, everyone else lands on their trips. Trip count is the
// signal — which button they pressed isn't reliable (OAuth can't tell sign-up from
// log-in, and users forget which they used).
export function postAuthRoute(tripCount: number | undefined): "/onboarding" | "/" {
  return tripCount === 0 ? "/onboarding" : "/";
}
