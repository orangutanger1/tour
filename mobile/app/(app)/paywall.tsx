// mobile/app/(app)/paywall.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import type { PurchasesPackage } from "react-native-purchases";
import { getProPackages, purchasePro, restorePro } from "../../lib/purchases";
import { Screen, Text, Button, Icon, PressableScale, Loading, SUNSET } from "../../components/ui";

// ponytail: repo docs as legal pages; swap for hosted URLs before App Store submission (see plan Task 9)
const TERMS_URL = "https://github.com/orangutanger1/tour/blob/main/docs/terms-of-service.md";
const PRIVACY_URL = "https://github.com/orangutanger1/tour/blob/main/docs/privacy-policy.md";

const BENEFITS = [
  "Unlimited trip itineraries",
  "Smart day-by-day routes and timing",
  "All future Pro features included",
];

function PlanCard({ pkg, active, onPress }: { pkg: PurchasesPackage; active: boolean; onPress: () => void }) {
  const annual = pkg.packageType === "ANNUAL";
  return (
    <PressableScale
      onPress={onPress}
      className={`flex-1 rounded-xl border-2 p-4 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
    >
      <View className="h-6 mb-1">
        {annual ? (
          <View className="self-start px-2 py-0.5 rounded-pill bg-accent">
            <Text variant="label" className="text-ink-inverse text-[11px]">SAVE 44%</Text>
          </View>
        ) : null}
      </View>
      <Text variant="heading">{annual ? "Annual" : "Monthly"}</Text>
      <Text variant="caption">{pkg.product.priceString} / {annual ? "year" : "month"}</Text>
    </PressableScale>
  );
}

export default function Paywall() {
  const router = useRouter();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const busy = buying || restoring;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        setSelected(pkgs.find((p) => p.packageType === "ANNUAL")?.identifier ?? pkgs[0]?.identifier ?? null);
        if (pkgs.length === 0) setError("Plans aren't available right now — try again later.");
      })
      .catch(() => setError("Couldn't load plans. Check your connection and try again."));
  }, []);

  async function buy() {
    const pkg = packages?.find((p) => p.identifier === selected);
    if (!pkg) return;
    setBuying(true);
    setError(null);
    try {
      if (await purchasePro(pkg)) router.back();
    } catch {
      setError("Purchase failed — you weren't charged. Try again.");
    } finally {
      setBuying(false);
    }
  }

  async function onRestore() {
    setRestoring(true);
    setError(null);
    try {
      if (await restorePro()) router.back();
      else setError("No purchases to restore.");
    } catch {
      setError("Restore failed. Try again.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Screen scroll>
      <View className="flex-row justify-end">
        <Button title="Not now" variant="ghost" size="sm" onPress={() => router.back()} />
      </View>

      <LinearGradient
        colors={SUNSET}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 24 }}
      >
        <Icon name="sparkles" size={28} color="#FFFFFF" />
        <Text variant="title" className="text-ink-inverse mt-2">Tour Pro</Text>
        <Text variant="body" className="text-ink-inverse opacity-90">
          Your first trip was on us. Go Pro for every trip after.
        </Text>
      </LinearGradient>

      <View className="gap-3">
        {BENEFITS.map((b) => (
          <View key={b} className="flex-row items-center gap-3">
            <Icon name="checkmark-circle" size={20} color="#E11D48" />
            <Text variant="body">{b}</Text>
          </View>
        ))}
      </View>

      {packages === null && !error ? (
        <Loading label="Loading plans…" />
      ) : (
        <View className="flex-row gap-3">
          {(packages ?? []).map((pkg) => (
            <PlanCard key={pkg.identifier} pkg={pkg} active={pkg.identifier === selected} onPress={() => setSelected(pkg.identifier)} />
          ))}
        </View>
      )}

      {error ? <Text variant="caption" className="text-error text-center">{error}</Text> : null}

      <Button title="Start Pro" size="lg" variant="gradient" loading={buying} disabled={!selected || restoring} onPress={buy} />

      <PressableScale onPress={onRestore} disabled={busy} className="items-center py-2">
        <Text variant="label" className="text-accent">Restore Purchases</Text>
      </PressableScale>

      <View className="flex-row justify-center gap-4 pb-4">
        <PressableScale onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
          <Text variant="caption" className="underline">Terms</Text>
        </PressableScale>
        <PressableScale onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
          <Text variant="caption" className="underline">Privacy</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}
