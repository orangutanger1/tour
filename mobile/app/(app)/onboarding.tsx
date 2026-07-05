// mobile/app/(app)/onboarding.tsx
// One-question pages: destination → dates → interests → budget → pace →
// transport → start point → review, interleaved with ethos "info" pages
// (intro/craft/trust/midway) and one pure-UI filler question (travelParty).
// One primary CTA per page. Each page enters with a slide (FadeInRight); info
// pages float their hero. ponytail: travelParty answer is screen-local, never sent.
import { useEffect, useState } from "react";
import { View, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeInRight, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay,
} from "react-native-reanimated";
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  buildRequest, tripDaysOf, shouldOfferRegions, withDestination, resolveStep,
  PLANNING_CHECK, HARDEST_PARTS, GOALS, ATTRIBUTION_SOURCES, EMPTY_FUNNEL, funnelPrefs,
  type OnboardingState, type FunnelState,
} from "../../lib/onboarding";
import { formatShort } from "../../lib/dates";
import { getProfile, saveFunnelAnswers } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useTripFlow } from "../../lib/tripFlow";
import { autocompletePlaces, suggestRegions, type Region } from "../../lib/placesClient";
import { usePro } from "../../lib/purchases";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Prefs, TripType } from "../../lib/types";
import {
  Screen, Text, Button, Chip, Input, Icon, OptionCard, ProgressBar,
  RangeCalendar, Segmented, PressableScale, type IconName,
} from "../../components/ui";
import { OptionList, type Option } from "../../components/onboarding/OptionList";
import { ChipMultiSelect, type ChipOption } from "../../components/onboarding/ChipMultiSelect";
import { RelateStatement } from "../../components/onboarding/RelateStatement";
import { NotificationsStep } from "../../components/onboarding/NotificationsStep";
import { CompareStep } from "../../components/onboarding/CompareStep";
import { TrialOfferStep } from "../../components/onboarding/TrialOfferStep";
import { SubDestinationStep } from "../../components/onboarding/SubDestinationStep";

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
const PLANNING_CHECK_OPTIONS: (Option & { value: (typeof PLANNING_CHECK)[number] })[] = [
  { value: "great", label: "Great", desc: "I've got a system that works", icon: "happy" },
  { value: "improving", label: "Could be better", desc: "It works, but takes a lot of manual effort", icon: "trending-up" },
  { value: "notPlanning", label: "I don't really plan", desc: "I wing it or skip planning entirely", icon: "help-circle" },
];
const ATTRIBUTION_OPTIONS: (Option & { value: (typeof ATTRIBUTION_SOURCES)[number] })[] = [
  { value: "appStore", label: "App Store search", desc: "Searching for a trip planner", icon: "logo-apple" },
  { value: "friend", label: "Friend or family", desc: "Someone told me about it", icon: "people" },
  { value: "social", label: "Social media", desc: "Instagram, TikTok, or similar", icon: "share-social" },
  { value: "google", label: "Google search", desc: "Search results or an ad", icon: "logo-google" },
  { value: "other", label: "Something else", desc: "Not listed above", icon: "ellipsis-horizontal" },
];
const HARDEST_PARTS_OPTIONS: ChipOption[] = [
  { value: "pacing", label: "Knowing what's realistic in a day" },
  { value: "hiddenGems", label: "Finding hidden gems, not just tourist traps" },
  { value: "stopOrder", label: "Keeping stops in a sane order" },
  { value: "foodBreaks", label: "Fitting in food and breaks" },
  { value: "coordinating", label: "Coordinating with the group" },
];
const GOALS_OPTIONS: ChipOption[] = [
  { value: "saveTime", label: "Save time planning" },
  { value: "avoidBacktracking", label: "Stop backtracking across town" },
  { value: "discoverSpots", label: "Discover great local spots" },
  { value: "stayFlexible", label: "Stay flexible on the day" },
  { value: "lessStress", label: "Less stress, more trip" },
];
const TRIP_TYPES = [
  { value: "round" as TripType, label: "Round trip" },
  { value: "oneway" as TripType, label: "One way" },
] as const;
const PROMPTS: Record<(typeof STEPS)[number], { title: string; sub?: string }> = {
  intro: { title: "Trips that actually work" },
  planningCheck: { title: "How's trip planning working for you?" },
  hardestParts: { title: "What's the hardest part of planning a trip?", sub: "Pick as many as apply." },
  goals: { title: "What do you want out of Beacon?", sub: "Pick as many as apply." },
  goodPlace: { title: "You're in a good place." },
  relateA1: { title: "Sound familiar?", sub: "My last itinerary had me crossing back through the same neighborhood twice in one day." },
  relateA2: { title: "Sound familiar?", sub: "I spend more time figuring out what order to visit places than actually picking them." },
  relateB1: { title: "Sound familiar?", sub: "I've shown up somewhere only to find out it's closed." },
  relateB2: { title: "Sound familiar?", sub: "Half my planning is just double-checking hours and travel times." },
  notifications: { title: "Never miss a change" },
  attribution: { title: "How'd you hear about us?" },
  compare: { title: "You're in the right place", sub: "Here's the difference." },
  trialOffer: { title: "Go Pro" },
  destination: { title: "Where to?", sub: "A city, a region, or a whole country." },
  subDestinations: { title: "Where in there?", sub: "Pick the cities you want to visit — we'll build days around each." },
  dates: { title: "When?" },
  classics: { title: "Icons & hidden gems", sub: "We mix the must-sees with the spots only locals flag." },
  interests: { title: "What do you love?", sub: "Pick at least one." },
  travelParty: { title: "Who's going?", sub: "Sets the vibe of your plan." },
  craft: { title: "Routed like a local" },
  budget: { title: "What's the budget?" },
  pace: { title: "What's your pace?" },
  transport: { title: "How far will you roam?" },
  trust: { title: "Built on real map data" },
  start: { title: "Starting point?", sub: "Optional — home, airport, or hotel. Routes anchor here." },
  midway: { title: "Almost there ✨" },
  review: { title: "Ready?", sub: "Tap any row to change it." },
};

// Non-input ethos pages. `image` is a swap-in landmark/illustration asset — leave
// undefined to fall back to the Ionicons `icon` placeholder. Add e.g.
//   intro: { icon: "map", blurb: "…", image: require("../../assets/images/landmarks/intro.png") }
const INFO: Partial<Record<(typeof STEPS)[number], { icon: IconName; blurb: string; image?: number; iconSize?: number; points?: string[] }>> = {
  intro: { icon: "map", blurb: "We sequence every day by real distances and daylight — not a random list of pins.", image: require("../../assets/images/landmarks/intro.png") },
  goodPlace: {
    icon: "sparkles",
    iconSize: 44,
    blurb: "Here's what makes Beacon different:",
    points: [
      "Days routed by real distances, so you stop backtracking across town",
      "Live hours and travel times baked in — no showing up to a closed door",
      "Meals and breaks slotted where they actually fit the day",
    ],
  },
  notifications: { icon: "notifications", blurb: "We'll nudge you if your plan changes — nothing else." },
  craft: { icon: "navigate", blurb: "Stops are ordered to cut backtracking, with meals slotted where they naturally fit the day.", image: require("../../assets/images/landmarks/craft.png") },
  trust: { icon: "shield-checkmark", blurb: "Places, travel times, and opening hours come from live maps — so your plan holds up on the ground.", image: require("../../assets/images/landmarks/trust.png") },
  midway: { icon: "sparkles", blurb: "One last look, then we'll build your itinerary.", image: require("../../assets/images/landmarks/midway.png") },
};

const PARTIES: { value: string; label: string; desc: string; icon: IconName }[] = [
  { value: "solo", label: "Solo", desc: "Just me, my own pace", icon: "person" },
  { value: "couple", label: "Couple", desc: "The two of us", icon: "heart" },
  { value: "family", label: "Family", desc: "With kids in tow", icon: "home" },
  { value: "friends", label: "Friends", desc: "A group trip", icon: "people" },
];

// Centered hero that fades/scales in on mount, then gently floats — used by info pages.
function InfoHero({ icon, image, iconSize = 72 }: { icon: IconName; image?: number; iconSize?: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-6, { duration: 1400 }), -1, true);
  }, []);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  // ponytail: className on Animated.* drops on device (NativeWind cssInterop) — keep it on
  // plain Views; Animated wrappers carry style only.
  return (
    <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: "center", paddingVertical: 24 }}>
      <Animated.View style={floatStyle}>
        {image ? (
          <Image source={image} style={{ width: 200, height: 200 }} contentFit="contain" />
        ) : (
          <View className="w-40 h-40 rounded-pill bg-surface-2 items-center justify-center">
            <Icon name={icon} size={iconSize} color="#E11D48" />
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// One scattered landmark: staggered fade-in, then a slow float at its own phase so
// the group drifts naturally instead of in lockstep. `rotate` lives in the animated
// transform (not the position style) so translateY doesn't clobber it.
function FloatingLandmark({ image, size, rotate, delayMs, position }: {
  image: number; size: number; rotate: number; delayMs: number; position: object;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delayMs, withRepeat(withTiming(-8, { duration: 1600 }), -1, true));
  }, []);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: `${rotate}deg` }],
  }));
  return (
    <Animated.View
      entering={FadeInDown.delay(delayMs).duration(500)}
      style={[{ position: "absolute" }, position, floatStyle]}
    >
      <Image source={image} style={{ width: size, height: size }} contentFit="contain" />
    </Animated.View>
  );
}

// Five landmarks scattered at hand-picked offsets/rotations for a natural, non-grid look.
function LandmarkScatter() {
  return (
    <View style={{ height: 320 }}>
      <FloatingLandmark image={require("../../assets/images/landmarks/eiffel.png")} size={120} rotate={-6} delayMs={0} position={{ top: 0, left: "6%" }} />
      <FloatingLandmark image={require("../../assets/images/landmarks/colosseum.png")} size={150} rotate={5} delayMs={150} position={{ top: 92, right: "4%" }} />
      <FloatingLandmark image={require("../../assets/images/landmarks/torii.png")} size={132} rotate={-3} delayMs={300} position={{ top: 176, left: "24%" }} />
      <FloatingLandmark image={require("../../assets/images/landmarks/taj.png")} size={110} rotate={8} delayMs={450} position={{ top: 8, right: "26%" }} />
      <FloatingLandmark image={require("../../assets/images/landmarks/taipei.png")} size={128} rotate={-4} delayMs={600} position={{ top: 210, right: "8%" }} />
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const tripFlow = useTripFlow();
  const insets = useSafeAreaInsets();
  const { isPro } = usePro();
  // The marketing funnel (intro…trialOffer) runs ONCE, for brand-new users on
  // their first onboarding. Every other entry — "Plan a trip" from home, a
  // Discover destination, editing a trip, or a Pro subscriber — starts on the
  // trip-planning steps. "destination" is the first planning page.
  const FUNNEL_END = STEPS.indexOf("destination");
  // Rehydrate an in-progress trip across remounts (e.g. "Edit trip" after a failed
  // generate does router.replace, which remounts this screen). lastRequest lives in
  // TripFlowProvider (above the Stack), so it survives the remount.
  const seedRequest = tripFlow.lastRequest;
  const { destination, planning } = useLocalSearchParams<{ destination?: string; planning?: string }>();
  // Callers that mean "just plan a trip" pass planning=1; editing (seedRequest)
  // is always planning-only. Those skip the funnel synchronously (no flash). Pro
  // resolves async, so it also fast-forwards via the effect below.
  const planningEntry = planning === "1" || !!seedRequest;
  // startStep is where THIS session's progress bar reads 0% — the funnel steps
  // don't count for planning-only entries.
  const [startStep, setStartStep] = useState(planningEntry ? FUNNEL_END : 0);
  const [step, setStep] = useState(planningEntry ? FUNNEL_END : 0);
  // ponytail: travelParty is filler — screen-local, not persisted, not sent to the backend.
  const [party, setParty] = useState<string | undefined>(undefined);
  const [funnel, setFunnel] = useState<FunnelState>(EMPTY_FUNNEL);
  const [state, setState] = useState<OnboardingState>(
    seedRequest ? stateFromRequest(seedRequest) : withDestination(stateFromProfile(null), destination),
  );
  const [suggestions, setSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedLocation = useDebouncedValue(state.location, 300);
  const [regions, setRegions] = useState<Region[]>([]);
  const [startSuggestions, setStartSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedStart = useDebouncedValue(state.startLocation ?? "", 300);

  useEffect(() => {
    if (seedRequest) return; // editing an existing trip — don't clobber it with profile defaults
    getProfile(supabase).then((prefs) => setState(withDestination(stateFromProfile(prefs), destination))).catch(() => {});
  }, []);

  // usePro resolves async (false → true), so we can't seed the initial step from it.
  // When it lands true and we're still inside the funnel, skip ahead. Guarded on
  // seedRequest so an edit-in-progress isn't fast-forwarded.
  useEffect(() => {
    if (isPro && !seedRequest && step < FUNNEL_END) { setStartStep(FUNNEL_END); setStep(FUNNEL_END); }
  }, [isPro]);

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

  function toggleFunnelMulti(key: "hardestParts" | "goals", value: string) {
    setFunnel((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));
  }

  function onGenerate() {
    tripFlow.generate(buildRequest(state));
    router.push("/generating");
  }

  const page = STEPS[step];
  const prompt = PROMPTS[page];
  const days = tripDaysOf(state);
  const datesSub = state.tripType === "round"
    ? "Pick start and end days — you'll loop back to where you began."
    : "Pick start and end days — you'll end in a different area.";

  // Step targets derive from STEPS by name so inserted filler pages don't shift them.
  const reviewRows: { label: string; value: string; step: number }[] = [
    { label: "Destination", value: state.location, step: STEPS.indexOf("destination") },
    {
      label: "Dates",
      value: state.startDate && state.endDate
        ? `${formatShort(state.startDate)} → ${formatShort(state.endDate)} · ${days} ${days === 1 ? "day" : "days"} · ${state.tripType === "round" ? "Round trip" : "One way"}`
        : "",
      step: STEPS.indexOf("dates"),
    },
    { label: "Interests", value: state.interests.join(", "), step: STEPS.indexOf("interests") },
    { label: "Budget", value: BUDGETS.find((b) => b.value === state.budget)!.label, step: STEPS.indexOf("budget") },
    { label: "Pace", value: PACES.find((p) => p.value === state.pace)!.label, step: STEPS.indexOf("pace") },
    { label: "Getting around", value: TRANSPORTS.find((t) => t.value === state.transport)!.label, step: STEPS.indexOf("transport") },
    ...(state.startLocation ? [{ label: "Start", value: state.startLocation, step: STEPS.indexOf("start") }] : []),
  ];

  return (
    <Screen>
      <View className="flex-row items-center gap-4 mb-2">
        <Pressable
          onPress={() => {
            const floor = startStep; // planning-only entries never re-enter the funnel
            if (step > floor) setStep((s) => resolveStep(s - 1, regions.length > 0, -1));
            else if (router.canGoBack()) router.back();
            else router.replace("/"); // new users arrive via replace — no stack behind
          }}
          hitSlop={8}
          className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center"
        >
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <ProgressBar progress={(step - startStep + 1) / (STEP_COUNT - startStep)} className="flex-1" />
      </View>

      {/* Footer sits outside the scroll area inside a KeyboardAvoidingView, so the
          Continue button is always reachable — with the keyboard open the old layout
          pushed it below the fold behind 5 suggestion rows. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 py-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Animated.View key={step} entering={FadeInRight.duration(200)} style={{ gap: 20 }}>
        {page === "trialOffer" ? null : INFO[page] ? (
          <View className="gap-3">
            <InfoHero icon={INFO[page]!.icon} image={INFO[page]!.image} iconSize={INFO[page]!.iconSize} />
            <Text variant="display" className="text-center">{prompt.title}</Text>
            <Text variant="body" className="text-center text-ink-muted px-2">{INFO[page]!.blurb}</Text>
            {INFO[page]!.points ? (
              <View className="gap-3 px-2 pt-1">
                {INFO[page]!.points!.map((p) => (
                  <View key={p} className="flex-row gap-3">
                    <Icon name="checkmark-circle" size={20} color="#E11D48" />
                    <Text variant="body" className="flex-1">{p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View className="gap-1">
            <Text variant="display">{prompt.title}</Text>
            {page === "dates" ? (
              <Text variant="body" className="text-ink-muted">{datesSub}</Text>
            ) : prompt.sub ? (
              <Text variant="body" className="text-ink-muted">{prompt.sub}</Text>
            ) : null}
          </View>
        )}

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
          </View>
        ) : null}

        {page === "subDestinations" ? (
          <SubDestinationStep
            regions={regions}
            selected={state.subDestinations}
            onToggle={(r) =>
              setState((s) => ({
                ...s,
                subDestinations: s.subDestinations.some((x) => x.placeId === r.placeId)
                  ? s.subDestinations.filter((x) => x.placeId !== r.placeId)
                  : [...s.subDestinations, r],
              }))
            }
          />
        ) : null}

        {page === "dates" ? (
          <View className="gap-4">
            <Segmented options={TRIP_TYPES} value={state.tripType} onChange={(t) => setState((s) => ({ ...s, tripType: t }))} />
            <RangeCalendar
              value={{ start: state.startDate, end: state.endDate }}
              onChange={(r) => setState((s) => ({ ...s, startDate: r.start, endDate: r.end }))}
            />
            {!state.startDate || !state.endDate ? (
              <Text variant="caption" className="text-center">Tap a start day, then an end day</Text>
            ) : null}
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

        {page === "classics" ? <LandmarkScatter /> : null}

        {page === "planningCheck" ? (
          <OptionList
            options={PLANNING_CHECK_OPTIONS}
            selected={funnel.planningCheck}
            onSelect={(v) => setFunnel((f) => ({ ...f, planningCheck: v as FunnelState["planningCheck"] }))}
          />
        ) : null}

        {page === "hardestParts" ? (
          <ChipMultiSelect options={HARDEST_PARTS_OPTIONS} selected={funnel.hardestParts} onToggle={(v) => toggleFunnelMulti("hardestParts", v)} />
        ) : null}

        {page === "goals" ? (
          <ChipMultiSelect options={GOALS_OPTIONS} selected={funnel.goals} onToggle={(v) => toggleFunnelMulti("goals", v)} />
        ) : null}

        {page === "relateA1" ? <RelateStatement /> : null}
        {page === "relateA2" ? <RelateStatement /> : null}
        {page === "relateB1" ? <RelateStatement /> : null}
        {page === "relateB2" ? <RelateStatement /> : null}

        {page === "notifications" ? <NotificationsStep /> : null}

        {page === "attribution" ? (
          <OptionList
            options={ATTRIBUTION_OPTIONS}
            selected={funnel.attributionSource}
            onSelect={(v) => setFunnel((f) => ({ ...f, attributionSource: v as FunnelState["attributionSource"] }))}
          />
        ) : null}

        {page === "compare" ? <CompareStep /> : null}

        {page === "trialOffer" ? <TrialOfferStep onDone={() => setStep((s) => s + 1)} /> : null}

        {page === "travelParty" ? (
          <View className="gap-3">
            {PARTIES.map((p) => (
              <OptionCard
                key={p.value}
                icon={<Icon name={p.icon} size={20} color={party === p.value ? "#E11D48" : "#6B5560"} />}
                title={p.label}
                description={p.desc}
                selected={party === p.value}
                onPress={() => setParty(p.value)}
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

      <View
        className="gap-2 pt-3 border-t border-border bg-bg -mx-6 px-6"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {page === "start" ? (
          <Button
            title="Skip"
            variant="ghost"
            onPress={() => { setState((s) => ({ ...s, startLocation: undefined, startPlaceId: undefined })); setStep((s) => s + 1); }}
          />
        ) : null}
        {page === "review" ? (
          <Button title="Generate my trip" size="lg" variant="gradient" onPress={onGenerate} />
        ) : page === "trialOffer" ? null : (
          <Button
            title="Continue"
            size="lg"
            disabled={!canContinue(step, state)}
            onPress={() => {
              if (page === "attribution") saveFunnelAnswers(supabase, funnelPrefs(funnel)).catch(() => {});
              setStep((s) => resolveStep(s + 1, regions.length > 0, 1));
            }}
          />
        )}
      </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
