# Beacon — TikTok Advertising Strategy & Format Research

## 1. What Beacon is (confirmed from codebase)

- **Name:** Beacon: Trip Planner (subtitle: "Travel Planner & Journal")
- **Stack:** Expo 56 / React Native, Supabase, RevenueCat (subscription), expo-maps, Apple + Google sign-in
- **Core feature surfaces (from routes):**
  - `discover` + `discover-list` + `destination-detail` + `poi-detail` + `lodging` — discover destinations, POIs, lodging
  - `itinerary` + `generating` — **AI-generated itineraries** (loading state implies on-device/AI generation)
  - `passport` + `add-photo` + `gallery` — **a visual travel journal**: collect places you've been, attach photos
  - `paywall` — freemium subscription gate
- **Differentiator vs comps:** the **Passport** (collecting visited places + photos as a personal travel journal). This is the angle no direct comp owns.

## 2. Closest comp — Roamy (AI trip planner, viral on TikTok)

Source: socialgrowthengineers.com case study — 100k downloads in ~2 weeks, launched Oct 28 2025.

### Product angle

"Turn saved Instagram/TikTok travel reels into a real, day-by-day itinerary." Pins every location mentioned in a saved video on a map, builds a route based on trip length.

### Business model

Freemium. Free core (import locations + auto itineraries). Roamy Pro = $12.99/mo or $39.99/yr US. Growth-first, monetize later.

### The TikTok growth playbook (directly transferable)

- **UGC ambassador network:** ~12 creator accounts using the handle pattern `name.roamy` (e.g. `@marg.roamy`, `@denise.roamy`), each posting a demo every day on TikTok + Instagram.
- **Many themed accounts, many hook variations, let the algorithm pick winners.**
- **One creator hitting millions of views = chart jump.** `@marg.roamy`'s first clip did 4.8M TikTok views / 2.8M IG views → 337K bookmarks, 92K shares.
- **Comment-reply trick:** creator replies with the app name so viewers get notified and return to the post (boosts engagement + discoverability).

### Proven winning hooks (curiosity + shame + FOMO)

| Hook | Emotion | Result |
| --- | --- | --- |
| "i could LITERALLY KISS the flight attendant that showed me this" | Curiosity | 4.8M views |
| "been saving travel videos for 4 years and NOW i find this?" | FOMO | 890K views, 40K saves |
| "so apparently I've been planning my trips WRONG???" | Shame | consistent hit |

### Visual pattern that sells

- Filmed on planes / in transit → feels like a genuine recommendation, not an ad
- Shocked-face thumbnails
- Demo-the-app-while-reacting format

## 3. TikTok slideshow ad format — rules that work

Sources: TikTok Ads Manager docs, TikAdSuite 2026 guide, CineRads slideshow ad playbook, attentionclaw app-slideshow strategy.

### Why slideshow/photo-carousel for app installs

- Algorithm currently favors photo carousels; lower production cost than video; swipeable, text-driven frames convert for app installs.
- **Required for paid carousel ads:** music (upload your own track, don't rely on Commercial Music Library if running on TikTok + Pangle).
- **Campaign type:** App Promotion → App Install objective.
- One shared caption + one CTA + one destination URL across all slides (standard carousel). Unique links per card only for catalog-powered VSA.

### Slide structure (the proven funnel — one role per slide)

1. **Cover/Hook** — establish audience + use case. Readable without zoom. Visible product.
2. **Context** — one concrete benefit line.
3. **Proof** — visible result / before-after / quality detail. (Must appear before the ask.)
4. **Trust** — practical detail that lowers risk.
5. **Close/Action** — one specific CTA, one click target.

### Hard rules

- **One claim per line, one action per slide, one type rhythm throughout.**
- Cover readable without zoom; proof in frame 2–3; final slide = one direct request.
- Never put the close before proof.
- Vertical format, respect text-safe zones.
- No abstract promises without visible support; no unsupported superlatives.
- Test **one variable per variant** (cover line only / proof image only / offer line only) so performance signals stay readable.

### QA checklist before launch

- Cover readable without zoom
- Proof line visible in frame 2 or 3
- Final action is one direct request
- All slides share one style spine
- Final slide links to the right destination

## 4. Other travel-app TikTok ad references

- **Klook** — "Enjoy 5% off your first app booking with BETTERONAPP" (promo-code-in-caption pattern, 387M+ impressions).
- **Traveloka** — discount-led ("up to 50% off Flights, Hotels and Attractions").
- **TikTok Travel Ads (Smart+)** — catalog-integrated, personalized, high-intent audiences (more for hotels/flights than indie apps).

## 5. The strategic fork for Beacon

Beacon shares Roamy's AI-itinerary muscle but owns something Roamy doesn't: the **Passport** (a visual journal of places you've actually been, with photos). Two viable strategic directions:

### Direction A — "Trips in seconds" (Roamy-adjacent, proven demand)

Lead with AI itinerary generation. Hook the "I've been planning trips wrong / saving reels for years" shame-FOMO that's already proven to convert. Lower risk, proven format, but competes head-on with Roamy's messaging.

### Direction B — "Your travel passport" (unique-to-Beacon angle)

Lead with the Passport — collecting every place you've been as a beautiful, photo-rich journal. Owns a whitespace no direct comp occupies. Higher creative risk, stronger long-term brand differentiation, and pairs naturally with a visual slideshow format (each slide = a stamp/place).

### Direction C — Hybrid

Hook on the proven trip-planning pain (Direction A's FOMO), but land the proof/differentiation on the Passport (Direction B's unique visual). Best of both: proven hook + ownable payoff.

## 6. Recommended slideshow concepts (to produce once direction is chosen)

Each concept = a 5-slide vertical carousel, one role per slide, one consistent style spine.

- **Concept 1 — "Been saving travel videos for years?"** (FOMO hook → AI itinerary demo → Passport payoff → CTA)
- **Concept 2 — "So apparently I've been planning my trips wrong"** (Shame hook → before/after itinerary → Passport stamps → CTA)
- **Concept 3 — "POV: your travel era finally has a passport"** (Aesthetic/identity hook → Passport showcase → AI itinerary bonus → CTA) — Direction B-led.
- **Concept 4 — "i could literally kiss whoever made this"** (Curiosity hook → screen-record style app demo → Passport → CTA)

Each ships with: 5 vertical images, caption (5–7 word hook + context + CTA), hashtag set, and a paid variant (same stack, adjusted close line).
