// mobile/lib/trialOffer.ts
// Pure copy-derivation for the onboarding trial paywall — deliberately free
// of any react-native-purchases import so it's jest-testable without the
// native module (repo convention: lib/*.ts pure logic is unit-tested,
// screens that touch the native SDK are smoke-tested manually).
export interface IntroPriceInfo {
  price: number;
  periodUnit: string;
  periodNumberOfUnits: number;
  cycles: number;
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

// Null unless the intro offer is a genuine free trial (price 0) — a
// discounted (non-zero) intro price is not a "free trial" and must not be
// labeled as one. This is what keeps the paywall copy honest whether or not
// RevenueCat has a trial offer configured yet.
export function trialDays(intro: IntroPriceInfo | null): number | null {
  if (!intro || intro.price !== 0) return null;
  const days = (UNIT_DAYS[intro.periodUnit] ?? 0) * intro.periodNumberOfUnits * intro.cycles;
  return days > 0 ? days : null;
}
