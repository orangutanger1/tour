// mobile/components/onboarding/TrialOfferStep.tsx
// Soft-sell trial paywall, honesty-safe: copy is derived from whatever
// RevenueCat actually returns (introPrice / win-back offer), never hardcoded
// "7-day trial" / "20% off" strings. Declining always calls onDone() and
// continues into the existing free-trip wizard — no gate change.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { PurchasesPackage, PurchasesWinBackOffer } from "react-native-purchases";
import { getProPackages, purchasePro, getWinBackOffer, purchaseWithWinBackOffer } from "../../lib/purchases";
import { trialDays } from "../../lib/trialOffer";
import { Text, Button, Icon, Loading, PlanCard, Card, SUNSET } from "../ui";

// What Pro unlocks vs. the free tier. Honest: the one real gate is trip count
// (see FREE_TRIP_LIMIT in the edge fn) — the routing smarts ship in both tiers,
// so we say so rather than invent Pro-only features.
const FEATURES: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: "Smart-routed day plans", free: true, pro: true },
  { label: "Live hours & travel times", free: true, pro: true },
  { label: "Trips you can create", free: "1", pro: "∞" },
  { label: "Regenerate & tweak anytime", free: false, pro: true },
];

function Cell({ v, muted }: { v: boolean | string; muted?: boolean }) {
  if (typeof v === "string") {
    return <Text variant="label" className={muted ? "text-ink-muted" : ""}>{v}</Text>;
  }
  return v
    ? <Icon name="checkmark-circle" size={20} color="#E11D48" />
    : <Icon name="close-circle" size={20} color="#6B5560" />;
}

function FeatureCompare() {
  return (
    <Card className="gap-4">
      <View className="flex-row justify-end gap-6 pr-1">
        <Text variant="label" className="w-12 text-center text-ink-muted">Free</Text>
        <Text variant="label" className="w-12 text-center">Pro</Text>
      </View>
      {FEATURES.map((f) => (
        <View key={f.label} className="flex-row items-center gap-3">
          <Text variant="body" className="flex-1">{f.label}</Text>
          <View className="w-12 items-center"><Cell v={f.free} muted /></View>
          <View className="w-12 items-center"><Cell v={f.pro} /></View>
        </View>
      ))}
    </Card>
  );
}

export function TrialOfferStep({ onDone }: { onDone: () => void }) {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingOffer, setCheckingOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"offer" | "downsell">("offer");
  const [winBack, setWinBack] = useState<PurchasesWinBackOffer | null>(null);

  useEffect(() => {
    getProPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        setSelected(pkgs.find((p) => p.packageType === "ANNUAL")?.identifier ?? pkgs[0]?.identifier ?? null);
      })
      .catch(() => setError("Couldn't load plans."));
  }, []);

  const pkg = packages?.find((p) => p.identifier === selected) ?? null;
  const days = pkg ? trialDays(pkg.product.introPrice) : null;

  async function buy() {
    if (!pkg) return;
    setBusy(true);
    setError(null);
    try {
      if (await purchasePro(pkg)) onDone();
    } catch {
      setError("Purchase failed — you weren't charged. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    if (!pkg) { onDone(); return; }
    setCheckingOffer(true);
    const offer = await getWinBackOffer(pkg);
    setCheckingOffer(false);
    if (offer) {
      setWinBack(offer);
      setStage("downsell");
    } else {
      onDone();
    }
  }

  async function claimWinBack() {
    if (!pkg || !winBack) return;
    setBusy(true);
    setError(null);
    try {
      if (await purchaseWithWinBackOffer(pkg, winBack)) onDone();
    } catch {
      setError("Purchase failed — you weren't charged. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "downsell" && winBack) {
    return (
      <View className="gap-4">
        <Text variant="heading">Not yet convinced?</Text>
        <Text variant="body" className="text-ink-muted">
          One-time offer: {winBack.priceString} for your first {winBack.cycles > 1 ? `${winBack.cycles} periods` : "period"}.
        </Text>
        <Button title="Claim offer" size="lg" variant="gradient" loading={busy} onPress={claimWinBack} />
        <Button title="No thanks" variant="ghost" onPress={onDone} />
        {error ? <Text variant="caption" className="text-error text-center">{error}</Text> : null}
      </View>
    );
  }

  return (
    <View className="gap-4">
      <LinearGradient colors={SUNSET} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24 }}>
        <Icon name="sparkles" size={28} color="#FFFFFF" />
        <Text variant="title" className="text-ink-inverse mt-2">Beacon Pro</Text>
        <Text variant="body" className="text-ink-inverse opacity-90">
          {days ? `Start your ${days}-day free trial.` : "Unlimited trips, smart routing, every feature."}
        </Text>
      </LinearGradient>

      <FeatureCompare />

      {packages === null && !error ? (
        <Loading label="Loading plans…" />
      ) : (
        <View className="flex-row gap-3">
          {(packages ?? []).map((p) => (
            <PlanCard key={p.identifier} pkg={p} active={p.identifier === selected} onPress={() => setSelected(p.identifier)} />
          ))}
        </View>
      )}

      {error ? <Text variant="caption" className="text-error text-center">{error}</Text> : null}

      <Button
        title={days ? `Start ${days}-day free trial` : "Start Pro"}
        size="lg"
        variant="gradient"
        loading={busy}
        disabled={!selected}
        onPress={buy}
      />
      <Button title="Not now" variant="ghost" loading={checkingOffer} onPress={notNow} />
    </View>
  );
}
