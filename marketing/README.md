# Beacon — TikTok Slideshow Ad (UGC POV)

**Format:** TikTok photo carousel, vertical 9:16, 5 slides.
**Model:** Google Gemini 3 Pro Image ("Nano Banana Pro") via OpenRouter.
**Aesthetic:** Realistic first-person UGC — hand-held iPhone POV, natural light, unpolished. The app is shown on the phone screen and hinted subtly in the caption. Never pitched ("download beacon" is banned).

## Why this register

UGC converts because it's a real human showing the app, not a brand pitching. Roamy hit 100k downloads in 2 weeks on exactly this: first-person POV, realistic, app hinted casually, never commanded. These slides follow that. No text is composited or AI-rendered onto the images — the caption lives in TikTok's caption field.

## Slide order (no text on any image)

| # | Role | File | What's in frame |
| --- | --- | --- | --- |
| 1 | Hook | `ugc1.jpg` | POV in bed at night, phone showing IG saved-folder of travel reels — the relatable "before" |
| 2 | Context | `ugc2.jpg` | POV on a hostel couch, phone showing the app generating a day-by-day itinerary |
| 3 | Proof | `ugc3.jpg` | POV holding phone up at a viewpoint, screen showing map with route line + pins |
| 4 | Unique | `ugc4.jpg` | Top-down, phone on cafe table, screen showing the passport grid of visited-place stamps |
| 5 | Subtle close | `ugc5.jpg` | Over-the-shoulder selfie at a real old-town street, phone showing destination detail |

## Captions (tiktok-captions skill spec: 5–7 word hook → context → optional CTA)

Three variants — test the hook only (one variable). Subtle app mention, never a hard sell.

**A — FOMO**

```
been saving travel videos since 2021 😭
finally turned my saved folder into an actual trip. the app's called beacon btw 📍
link in bio
```

**B — Shame**

```
i've been planning trips wrong for years
found an app that turns your saved reels into a real day-by-day itinerary + keeps a passport of everywhere you've been. it's called beacon
link in bio 🤍
```

**C — Curiosity**

```
wait why did no one tell me
there's an app that turns saved travel videos into a real trip. it's called beacon 📍
link in bio
```

## Hashtags (3–5 niche-relevant per the skill; don't stuff)

```
#travelhacks #tripplanner #travelapp #wanderlust #hiddengems
```

## Posting notes

- **Organic first.** Photo carousels perform organically before you ever pay. Post, then boost the winner with a Spark Ad once a hook proves out.
- **Comment-reply trick (from Roamy's playbook):** reply "beacon" to early comments so viewers get notified and return — boosts engagement + discoverability.
- **Music:** required for paid carousel; pick a warm trending travel sound. For organic, ride a trending sound for reach.
- **One variable per variant:** test the caption hook (A/B/C) first with the same 5 images. If one wins, hold it and test swapping slide 1 next. Don't change two things at once.

## How to regenerate / iterate

```bash
cd /home/myen/tour/marketing
# regenerate one slide (writes assets/ugcN.jpg):
bash scripts/gen_image.sh ugc1 "<your prompt>"
# regenerate all 5:
bash scripts/gen_ugc.sh
```

## ⚠️ Known limitations — read before posting

1. **I could not visually self-verify the images** — this harness has no image-input support, so I confirmed dimensions/ratio (9:16) and prompt direction but not aesthetics. **Eyeball all 5 before posting.** If a slide has the usual AI tells (warped hands, gibberish screen text, extra fingers), re-run `gen_image.sh ugcN "<prompt>"` for a fresh variation.
2. **The app UI on the phone screens is AI-rendered, not pixel-perfect Beacon.** For a photo carousel this is usually fine — viewers read the gist (map, route, stamps), not the UI text. If you want the real UI on screen, the upgrade path is: capture real Beacon screenshots (requires logging into the app — needs your Supabase auth), then composite them onto the phone screens programmatically. Say the word and I'll set that up.
3. **Sizes vary** — a couple came back at 768×1376, the rest 1536×2752. All are 9:16; TikTok accepts both. Normalize to 1080×1920 before posting if you want uniform files.

## Files

- `assets/ugc1–5.jpg` — the 5 slides.
- `assets/_archive_cinematic/` — the rejected first batch (third-person cinematic), kept for reference.
- `scripts/gen_image.sh` — single-image generator (UGC style spine baked in).
- `scripts/gen_ugc.sh` — generates all 5.
- `scripts/composite.py` — **deprecated** (text compositing, no longer used; kept for reference).
