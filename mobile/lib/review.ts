// mobile/lib/review.ts
// The App Store review account. Typing this email on the sign-in screen routes
// through the `review-login` edge function instead of a real OTP email, so a
// reviewer can get in without receiving a code. Keep in sync with REVIEW_EMAIL
// in supabase/functions/review-login/index.ts.
export const REVIEW_EMAIL = "appreview@usebeacon.app";
