// mobile/app/(app)/onboarding.tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Button, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, buildRequest, prefsFromState,
  type OnboardingState,
} from "../../lib/onboarding";
import { getProfile, upsertProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useTripFlow } from "../../lib/tripFlow";
import type { Prefs } from "../../lib/types";

const BUDGETS: Prefs["budget"][] = ["low", "mid", "high"];
const PACES: Prefs["pace"][] = ["relaxed", "balanced", "packed"];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1,
        borderColor: active ? "#2563eb" : "#ccc", backgroundColor: active ? "#dbeafe" : "transparent",
      }}
    >
      <Text style={{ color: active ? "#1e3a8a" : "#333" }}>{label}</Text>
    </Pressable>
  );
}

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
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      {step === 0 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>What do you like?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {INTERESTS.map((i) => (
              <Chip key={i} label={i} active={state.interests.includes(i)} onPress={() => toggleInterest(i)} />
            ))}
          </View>
          <Text style={{ fontWeight: "600" }}>Budget</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {BUDGETS.map((b) => (
              <Chip key={b} label={b} active={state.budget === b} onPress={() => setState((s) => ({ ...s, budget: b }))} />
            ))}
          </View>
          <Text style={{ fontWeight: "600" }}>Pace</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {PACES.map((p) => (
              <Chip key={p} label={p} active={state.pace === p} onPress={() => setState((s) => ({ ...s, pace: p }))} />
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Where and how long?</Text>
          <TextInput
            placeholder="Location (e.g. Lisbon)"
            value={state.location}
            onChangeText={(t) => setState((s) => ({ ...s, location: t }))}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
          />
          <Text style={{ fontWeight: "600" }}>Days: {state.tripDays}</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Button title="−" onPress={() => setState((s) => ({ ...s, tripDays: Math.max(1, s.tripDays - 1) }))} />
            <Button title="+" onPress={() => setState((s) => ({ ...s, tripDays: Math.min(MAX_TRIP_DAYS, s.tripDays + 1) }))} />
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Review</Text>
          <Text>Location: {state.location}</Text>
          <Text>Days: {state.tripDays}</Text>
          <Text>Interests: {state.interests.join(", ")}</Text>
          <Text>Budget: {state.budget} · Pace: {state.pace}</Text>
        </View>
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <Button title="Back" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))} />
        {step < 2 ? (
          <Button title="Next" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} />
        ) : (
          <Button title="Generate" onPress={onGenerate} />
        )}
      </View>
    </ScrollView>
  );
}
