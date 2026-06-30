// mobile/app/(app)/onboarding.tsx
import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, stateFromRequest, canContinue, buildRequest,
  shouldOfferRegions, type OnboardingState,
} from "../../lib/onboarding";
import { getProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useTripFlow } from "../../lib/tripFlow";
import { autocompletePlaces, suggestRegions, type Region } from "../../lib/placesClient";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Prefs } from "../../lib/types";
import { Screen, Text, Button, Chip, Input, Card, Stepper } from "../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

const BUDGETS: { value: Prefs["budget"]; label: string; desc: string }[] = [
  { value: "low", label: "$ Budget", desc: "Street food, free sights, budget stays" },
  { value: "mid", label: "$$ Comfortable", desc: "Casual eats, mix of sights, mid-range hotels" },
  { value: "high", label: "$$$ Premium", desc: "Fine dining, splurges, upscale stays" },
];
const PACES: { value: Prefs["pace"]; label: string; desc: string }[] = [
  { value: "relaxed", label: "Relaxed", desc: "2–3 stops/day" },
  { value: "balanced", label: "Balanced", desc: "4–5 stops/day" },
  { value: "packed", label: "Packed", desc: "6–8 stops/day" },
];
const TRANSPORTS: { value: Prefs["transport"]; label: string; desc: string }[] = [
  { value: "compact", label: "Compact", desc: "Stay close. Walkable cluster, minimal transit." },
  { value: "balanced", label: "Balanced", desc: "City + nearby. Some driving." },
  { value: "far", label: "Far-ranging", desc: "Cover a wide region. Longer legs OK." },
];
const DAY_PRESETS = [3, 5, 7, 10, 14];

export default function Onboarding() {
  const router = useRouter();
  const { session } = useAuth();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  // Rehydrate an in-progress trip across remounts (e.g. "Edit trip" after a failed
  // generate does router.replace, which remounts this screen). lastRequest/pendingRequest
  // live in TripFlowProvider (above the Stack), so they survive the remount.
  const seedRequest = tripFlow.lastRequest ?? tripFlow.pendingRequest;
  const [state, setState] = useState<OnboardingState>(
    seedRequest ? stateFromRequest(seedRequest) : stateFromProfile(null),
  );
  const [suggestions, setSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedLocation = useDebouncedValue(state.location, 300);
  const [regions, setRegions] = useState<Region[]>([]);
  const [startSuggestions, setStartSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedStart = useDebouncedValue(state.startLocation ?? "", 300);

  useEffect(() => {
    if (seedRequest) return; // editing an existing trip — don't clobber it with profile defaults
    getProfile(supabase).then((prefs) => setState(stateFromProfile(prefs))).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    autocompletePlaces({ query: debouncedLocation, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
      .then((s) => { if (active) setSuggestions(s); })
      .catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, [debouncedLocation]);

  useEffect(() => {
    let active = true;
    autocompletePlaces({ query: debouncedStart, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey, addresses: true })
      .then((s) => { if (active) setStartSuggestions(s); })
      .catch(() => { if (active) setStartSuggestions([]); });
    return () => { active = false; };
  }, [debouncedStart]);

  function toggleInterest(i: string) {
    setState((s) => ({
      ...s,
      interests: s.interests.includes(i) ? s.interests.filter((x) => x !== i) : [...s.interests, i],
    }));
  }

  function onGenerate() {
    const req = buildRequest(state);
    if (session) {
      tripFlow.generate(req);
      router.push("/generating");
    } else {
      tripFlow.prepare(req);
      router.push("/(auth)/sign-in");
    }
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
          <View className="gap-2">
            {BUDGETS.map((b) => (
              <Pressable key={b.value} onPress={() => setState((s) => ({ ...s, budget: b.value }))}
                className={`p-3 rounded-lg border ${state.budget === b.value ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
                <Text variant="label" className={state.budget === b.value ? "text-accent" : "text-ink"}>{b.label}</Text>
                <Text variant="caption">{b.desc}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="label">Pace</Text>
          <View className="gap-2">
            {PACES.map((p) => (
              <Pressable key={p.value} onPress={() => setState((s) => ({ ...s, pace: p.value }))}
                className={`p-3 rounded-lg border ${state.pace === p.value ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
                <Text variant="label" className={state.pace === p.value ? "text-accent" : "text-ink"}>{p.label}</Text>
                <Text variant="caption">{p.desc}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="label">Transport</Text>
          <View className="gap-2">
            {TRANSPORTS.map((t) => (
              <Pressable key={t.value} onPress={() => setState((s) => ({ ...s, transport: t.value }))}
                className={`p-3 rounded-lg border ${state.transport === t.value ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
                <Text variant="label" className={state.transport === t.value ? "text-accent" : "text-ink"}>{t.label}</Text>
                <Text variant="caption">{t.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View className="gap-4">
          <Text variant="title">Where and how long?</Text>
          <Input placeholder="Location (e.g. Lisbon)" value={state.location}
            onChangeText={(t) => { setState((s) => ({ ...s, location: t, destinationPlaceId: undefined })); setRegions([]); }} autoCorrect={false} />
          {suggestions.length > 0 && state.location.trim().length >= 2 && !state.destinationPlaceId ? (
            <View className="gap-1">
              {suggestions.map((sug) => (
                <Pressable key={sug.placeId} onPress={() => {
                  setState((s) => ({ ...s, location: sug.text, destinationPlaceId: sug.placeId }));
                  setSuggestions([]);
                  setRegions([]);
                  if (shouldOfferRegions(sug.types)) {
                    suggestRegions({ placeId: sug.placeId, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
                      .then(setRegions).catch(() => setRegions([]));
                  }
                }}
                  className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
                  <Text variant="body">{sug.text}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {regions.length > 0 ? (
            <View className="gap-2">
              <Text variant="label">Big place — narrow it down?</Text>
              {regions.map((r) => (
                <Pressable key={r.placeId} onPress={() => {
                  // Region carries a real placeId — set it so the destination is
                  // geocoded (no global autocomplete on a bare label, real bias center).
                  setState((s) => ({ ...s, location: r.label, destinationPlaceId: r.placeId }));
                  setSuggestions([]);
                  setRegions([]);
                }}
                  className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
                  <Text variant="body">{r.label}</Text>
                  <Text variant="caption">{r.hook}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setRegions([])} className="p-2">
                <Text variant="caption" className="text-ink-muted">Skip — search the whole area</Text>
              </Pressable>
            </View>
          ) : null}
          <Text variant="label">Days</Text>
          <View className="flex-row flex-wrap gap-2">
            {DAY_PRESETS.map((d) => (
              <Chip key={d} label={String(d)} selected={state.tripDays === d} onPress={() => setState((s) => ({ ...s, tripDays: d }))} />
            ))}
          </View>
          <Stepper
            value={state.tripDays}
            min={1}
            max={MAX_TRIP_DAYS}
            suffix={state.tripDays === 1 ? "day" : "days"}
            onChange={(d) => setState((s) => ({ ...s, tripDays: d }))}
          />
          <Text variant="label">Starting point (optional)</Text>
          <Input placeholder="Home, airport, or hotel" value={state.startLocation ?? ""}
            onChangeText={(t) => setState((s) => ({ ...s, startLocation: t, startPlaceId: undefined }))} autoCorrect={false} />
          {startSuggestions.length > 0 && (state.startLocation ?? "").trim().length >= 2 && !state.startPlaceId ? (
            <View className="gap-1">
              {startSuggestions.map((sug) => (
                <Pressable key={sug.placeId} onPress={() => { setState((s) => ({ ...s, startLocation: sug.text, startPlaceId: sug.placeId })); setStartSuggestions([]); }}
                  className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
                  <Text variant="body">{sug.text}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {step === 2 && (
        <Card className="gap-2">
          <Text variant="title">Review</Text>
          <Text variant="body">Location: {state.location}</Text>
          <Text variant="body">Days: {state.tripDays}</Text>
          <Text variant="body">Interests: {state.interests.join(", ")}</Text>
          <Text variant="body">Budget: {state.budget} · Pace: {state.pace}</Text>
          <Text variant="body">Transport: {state.transport}</Text>
          {state.startLocation ? <Text variant="body">Start: {state.startLocation}</Text> : null}
        </Card>
      )}

      <View className="flex-row justify-between gap-3 mt-4">
        <Button title="Back" variant="ghost" onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))} className="flex-1" />
        {step < 2 ? (
          <Button title="Next" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} className="flex-1" />
        ) : (
          <Button title="Generate" onPress={onGenerate} className="flex-1" />
        )}
      </View>
    </Screen>
  );
}
