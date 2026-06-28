// mobile/app/(app)/onboarding.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, buildRequest, prefsFromState,
  type OnboardingState,
} from "../../lib/onboarding";
import { getProfile, upsertProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useTripFlow } from "../../lib/tripFlow";
import type { Prefs } from "../../lib/types";
import { Screen, Text, Button, Chip, Input, Card } from "../../components/ui";

const BUDGETS: Prefs["budget"][] = ["low", "mid", "high"];
const PACES: Prefs["pace"][] = ["relaxed", "balanced", "packed"];

export default function Onboarding() {
  const router = useRouter();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(stateFromProfile(null));

  useEffect(() => {
    getProfile(supabase).then((prefs) => setState(stateFromProfile(prefs))).catch(() => {});
  }, []);

  function toggleInterest(i: string) {
    setState((s) => ({
      ...s,
      interests: s.interests.includes(i) ? s.interests.filter((x) => x !== i) : [...s.interests, i],
    }));
  }

  async function onGenerate() {
    try { await upsertProfile(supabase, prefsFromState(state)); } catch { /* best-effort */ }
    tripFlow.generate(buildRequest(state));
    router.push("/generating");
  }

  return (
    <Screen scroll>
      <View className="flex-row gap-2 mb-2">
        {[0, 1, 2].map((i) => (
          <View key={i} className={`h-1.5 flex-1 rounded-pill ${i <= step ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </View>

      {step === 0 && (
        <View className="gap-5">
          <Text variant="title">What do you like?</Text>
          <View className="flex-row flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip key={i} label={i} selected={state.interests.includes(i)} onPress={() => toggleInterest(i)} />
            ))}
          </View>
          <Text variant="label">Budget</Text>
          <View className="flex-row gap-2">
            {BUDGETS.map((b) => (
              <Chip key={b} label={b} selected={state.budget === b} onPress={() => setState((s) => ({ ...s, budget: b }))} />
            ))}
          </View>
          <Text variant="label">Pace</Text>
          <View className="flex-row gap-2">
            {PACES.map((p) => (
              <Chip key={p} label={p} selected={state.pace === p} onPress={() => setState((s) => ({ ...s, pace: p }))} />
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View className="gap-5">
          <Text variant="title">Where and how long?</Text>
          <Input placeholder="Location (e.g. Lisbon)" value={state.location} onChangeText={(t) => setState((s) => ({ ...s, location: t }))} />
          <Text variant="label">Days: {state.tripDays}</Text>
          <View className="flex-row gap-3">
            <Button title="–" variant="secondary" size="sm" onPress={() => setState((s) => ({ ...s, tripDays: Math.max(1, s.tripDays - 1) }))} />
            <Button title="+" variant="secondary" size="sm" onPress={() => setState((s) => ({ ...s, tripDays: Math.min(MAX_TRIP_DAYS, s.tripDays + 1) }))} />
          </View>
        </View>
      )}

      {step === 2 && (
        <Card className="gap-2">
          <Text variant="title">Review</Text>
          <Text variant="body">Location: {state.location}</Text>
          <Text variant="body">Days: {state.tripDays}</Text>
          <Text variant="body">Interests: {state.interests.join(", ")}</Text>
          <Text variant="body">Budget: {state.budget} · Pace: {state.pace}</Text>
        </Card>
      )}

      <View className="flex-row justify-between gap-3 mt-4">
        <Button title="Back" variant="ghost" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))} className="flex-1" />
        {step < 2 ? (
          <Button title="Next" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} className="flex-1" />
        ) : (
          <Button title="Generate" onPress={onGenerate} className="flex-1" />
        )}
      </View>
    </Screen>
  );
}
