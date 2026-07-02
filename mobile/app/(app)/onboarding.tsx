// mobile/app/(app)/onboarding.tsx
// 8 one-question pages: destination → dates → interests → budget → pace →
// transport → start point → review. One primary CTA per page.
import { useEffect, useState } from "react";
import { View, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  buildRequest, tripDaysOf, shouldOfferRegions, type OnboardingState,
} from "../../lib/onboarding";
import { formatShort } from "../../lib/dates";
import { getProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useTripFlow } from "../../lib/tripFlow";
import { autocompletePlaces, suggestRegions, type Region } from "../../lib/placesClient";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Prefs, TripType } from "../../lib/types";
import {
  Screen, Text, Button, Chip, Input, Icon, OptionCard, ProgressBar,
  RangeCalendar, Segmented, PressableScale, type IconName,
} from "../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

const INTEREST_ICONS: Record<string, IconName> = {
  scenic: "camera", food: "restaurant", history: "library", nightlife: "moon",
  outdoors: "leaf", art: "color-palette", shopping: "bag",
};
const BUDGETS: { value: Prefs["budget"]; label: string; desc: string; icon: IconName }[] = [
  { value: "low", label: "$ Budget", desc: "Street food, free sights, budget stays", icon: "wallet" },
  { value: "mid", label: "$$ Comfortable", desc: "Casual eats, mix of sights, mid-range hotels", icon: "card" },
  { value: "high", label: "$$$ Premium", desc: "Fine dining, splurges, upscale stays", icon: "diamond" },
];
const PACES: { value: Prefs["pace"]; label: string; desc: string; icon: IconName }[] = [
  { value: "relaxed", label: "Relaxed", desc: "2–3 stops a day, long lunches", icon: "cafe" },
  { value: "balanced", label: "Balanced", desc: "4–5 stops a day", icon: "walk" },
  { value: "packed", label: "Packed", desc: "6–8 stops a day, see it all", icon: "flash" },
];
const TRANSPORTS: { value: Prefs["transport"]; label: string; desc: string; icon: IconName }[] = [
  { value: "compact", label: "Compact", desc: "Stay close. Walkable cluster, minimal transit.", icon: "footsteps" },
  { value: "balanced", label: "Balanced", desc: "City + nearby. Some driving.", icon: "car" },
  { value: "far", label: "Far-ranging", desc: "Cover a wide region. Longer legs OK.", icon: "airplane" },
];
const TRIP_TYPES = [
  { value: "round" as TripType, label: "Round trip" },
  { value: "oneway" as TripType, label: "One way" },
] as const;
const PROMPTS: Record<(typeof STEPS)[number], { title: string; sub?: string }> = {
  destination: { title: "Where to?", sub: "A city, a region, or a whole country." },
  dates: { title: "When?", sub: "Pick your start and end days." },
  interests: { title: "What do you love?", sub: "Pick at least one." },
  budget: { title: "What's the budget?" },
  pace: { title: "What's your pace?" },
  transport: { title: "How far will you roam?" },
  start: { title: "Starting point?", sub: "Optional — home, airport, or hotel. Routes anchor here." },
  review: { title: "Ready?", sub: "Tap any row to change it." },
};

export default function Onboarding() {
  const router = useRouter();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  // Rehydrate an in-progress trip across remounts (e.g. "Edit trip" after a failed
  // generate does router.replace, which remounts this screen). lastRequest lives in
  // TripFlowProvider (above the Stack), so it survives the remount.
  const seedRequest = tripFlow.lastRequest;
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
    tripFlow.generate(buildRequest(state));
    router.push("/generating");
  }

  const page = STEPS[step];
  const prompt = PROMPTS[page];
  const days = tripDaysOf(state);

  const reviewRows: { label: string; value: string; step: number }[] = [
    { label: "Destination", value: state.location, step: 0 },
    {
      label: "Dates",
      value: state.startDate && state.endDate
        ? `${formatShort(state.startDate)} → ${formatShort(state.endDate)} · ${days} ${days === 1 ? "day" : "days"} · ${state.tripType === "round" ? "Round trip" : "One way"}`
        : "",
      step: 1,
    },
    { label: "Interests", value: state.interests.join(", "), step: 2 },
    { label: "Budget", value: BUDGETS.find((b) => b.value === state.budget)!.label, step: 3 },
    { label: "Pace", value: PACES.find((p) => p.value === state.pace)!.label, step: 4 },
    { label: "Getting around", value: TRANSPORTS.find((t) => t.value === state.transport)!.label, step: 5 },
    ...(state.startLocation ? [{ label: "Start", value: state.startLocation, step: 6 }] : []),
  ];

  return (
    <Screen>
      <View className="flex-row items-center gap-4 mb-2">
        <Pressable
          onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          hitSlop={8}
          className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center"
        >
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <ProgressBar progress={(step + 1) / STEP_COUNT} className="flex-1" />
      </View>

      {/* Footer sits outside the scroll area inside a KeyboardAvoidingView, so the
          Continue button is always reachable — with the keyboard open the old layout
          pushed it below the fold behind 5 suggestion rows. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 py-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Animated.View key={step} entering={FadeInRight.duration(200)} className="gap-5">
        <View className="gap-1">
          <Text variant="display">{prompt.title}</Text>
          {prompt.sub ? <Text variant="body" className="text-ink-muted">{prompt.sub}</Text> : null}
        </View>

        {page === "destination" ? (
          <View className="gap-3">
            <Input
              placeholder="Try Lisbon, Tuscany, or Japan"
              value={state.location}
              onChangeText={(t) => { setState((s) => ({ ...s, location: t, destinationPlaceId: undefined })); setRegions([]); }}
              autoCorrect={false}
            />
            {suggestions.length > 0 && state.location.trim().length >= 2 && !state.destinationPlaceId ? (
              <View className="gap-2">
                {suggestions.map((sug) => (
                  <PressableScale
                    key={sug.placeId}
                    onPress={() => {
                      setState((s) => ({ ...s, location: sug.text, destinationPlaceId: sug.placeId }));
                      setSuggestions([]);
                      setRegions([]);
                      if (shouldOfferRegions(sug.types)) {
                        suggestRegions({ placeId: sug.placeId, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
                          .then(setRegions).catch(() => setRegions([]));
                      }
                    }}
                    className="flex-row items-center gap-3 p-4 rounded-lg bg-surface border border-border"
                  >
                    <Icon name="location" size={18} color="#E11D48" />
                    <Text variant="body" className="flex-1">{sug.text}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
            {regions.length > 0 ? (
              <View className="gap-2">
                <Text variant="label">Big place — narrow it down?</Text>
                {regions.map((r) => (
                  <PressableScale
                    key={r.placeId}
                    onPress={() => {
                      // Region carries a real placeId — set it so the destination is
                      // geocoded (no global autocomplete on a bare label, real bias center).
                      setState((s) => ({ ...s, location: r.label, destinationPlaceId: r.placeId }));
                      setSuggestions([]);
                      setRegions([]);
                    }}
                    className="p-4 rounded-lg bg-surface border border-border gap-0.5"
                  >
                    <Text variant="body">{r.label}</Text>
                    <Text variant="caption">{r.hook}</Text>
                  </PressableScale>
                ))}
                <Pressable onPress={() => setRegions([])} className="p-2">
                  <Text variant="caption" className="text-ink-muted">Skip — search the whole area</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {page === "dates" ? (
          <View className="gap-4">
            <Segmented options={TRIP_TYPES} value={state.tripType} onChange={(t) => setState((s) => ({ ...s, tripType: t }))} />
            <RangeCalendar
              value={{ start: state.startDate, end: state.endDate }}
              onChange={(r) => setState((s) => ({ ...s, startDate: r.start, endDate: r.end }))}
            />
            {state.startDate && state.endDate ? (
              <Text variant="body" className="text-center text-ink-muted">
                {formatShort(state.startDate)} → {formatShort(state.endDate)} · {days} {days === 1 ? "day" : "days"}
              </Text>
            ) : (
              <Text variant="caption" className="text-center">Tap a start day, then an end day</Text>
            )}
          </View>
        ) : null}

        {page === "interests" ? (
          <View className="flex-row flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip
                key={i}
                label={i}
                selected={state.interests.includes(i)}
                onPress={() => toggleInterest(i)}
                icon={<Icon name={INTEREST_ICONS[i]} size={16} color={state.interests.includes(i) ? "#E11D48" : "#6B5560"} />}
              />
            ))}
          </View>
        ) : null}

        {page === "budget" ? (
          <View className="gap-3">
            {BUDGETS.map((b) => (
              <OptionCard
                key={b.value}
                icon={<Icon name={b.icon} size={20} color={state.budget === b.value ? "#E11D48" : "#6B5560"} />}
                title={b.label}
                description={b.desc}
                selected={state.budget === b.value}
                onPress={() => setState((s) => ({ ...s, budget: b.value }))}
              />
            ))}
          </View>
        ) : null}

        {page === "pace" ? (
          <View className="gap-3">
            {PACES.map((p) => (
              <OptionCard
                key={p.value}
                icon={<Icon name={p.icon} size={20} color={state.pace === p.value ? "#E11D48" : "#6B5560"} />}
                title={p.label}
                description={p.desc}
                selected={state.pace === p.value}
                onPress={() => setState((s) => ({ ...s, pace: p.value }))}
              />
            ))}
          </View>
        ) : null}

        {page === "transport" ? (
          <View className="gap-3">
            {TRANSPORTS.map((t) => (
              <OptionCard
                key={t.value}
                icon={<Icon name={t.icon} size={20} color={state.transport === t.value ? "#E11D48" : "#6B5560"} />}
                title={t.label}
                description={t.desc}
                selected={state.transport === t.value}
                onPress={() => setState((s) => ({ ...s, transport: t.value }))}
              />
            ))}
          </View>
        ) : null}

        {page === "start" ? (
          <View className="gap-3">
            <Input
              placeholder="Home, airport, or hotel"
              value={state.startLocation ?? ""}
              onChangeText={(t) => setState((s) => ({ ...s, startLocation: t, startPlaceId: undefined }))}
              autoCorrect={false}
            />
            {startSuggestions.length > 0 && (state.startLocation ?? "").trim().length >= 2 && !state.startPlaceId ? (
              <View className="gap-2">
                {startSuggestions.map((sug) => (
                  <PressableScale
                    key={sug.placeId}
                    onPress={() => { setState((s) => ({ ...s, startLocation: sug.text, startPlaceId: sug.placeId })); setStartSuggestions([]); }}
                    className="flex-row items-center gap-3 p-4 rounded-lg bg-surface border border-border"
                  >
                    <Icon name="navigate" size={18} color="#E11D48" />
                    <Text variant="body" className="flex-1">{sug.text}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {page === "review" ? (
          <View className="gap-2">
            {reviewRows.map((r) => (
              <PressableScale
                key={r.label}
                onPress={() => setStep(r.step)}
                className="flex-row items-center justify-between p-4 rounded-lg bg-surface border border-border"
              >
                <View className="flex-1 gap-0.5">
                  <Text variant="label" className="text-ink-muted">{r.label}</Text>
                  <Text variant="body">{r.value}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color="#6B5560" />
              </PressableScale>
            ))}
          </View>
        ) : null}
      </Animated.View>
      </ScrollView>

      <View className="gap-2 pt-3">
        {page === "start" ? (
          <Button
            title="Skip"
            variant="ghost"
            onPress={() => { setState((s) => ({ ...s, startLocation: undefined, startPlaceId: undefined })); setStep((s) => s + 1); }}
          />
        ) : null}
        {page === "review" ? (
          <Button title="Generate my trip" size="lg" variant="gradient" onPress={onGenerate} />
        ) : (
          <Button title="Continue" size="lg" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} />
        )}
      </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
