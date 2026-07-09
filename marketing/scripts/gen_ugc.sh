#!/usr/bin/env bash
# UGC POV slideshow — 5 slides, first-person, realistic, shows the app.
# App hinted subtly only in the caption, never on the images.
set -euo pipefail
cd "$(dirname "$0")/.."

# Slide 1 — HOOK: the relatable "before" moment. Someone scrolling saved travel reels in bed at night.
bash scripts/gen_image.sh ugc1 \
	"First-person POV shot of my hand holding my iPhone in bed at night, screen showing the Instagram saved-folder full of travel reel thumbnails of beaches and landmarks, the room is dark with just phone glow on my hand and face shadow, tired relatable late-night scrolling, authentic messy real photo"

# Slide 2 — CONTEXT: the discovery. Holding phone showing the app building an itinerary.
bash scripts/gen_image.sh ugc2 \
	"First-person POV of my hand holding my iPhone on a sunny hostel common-room couch, the phone screen shows a travel app generating a day-by-day itinerary with day cards and a list of places, soft natural window light, my other hand holding a coffee mug, authentic casual real photo, slightly messy background"

# Slide 3 — PROOF: the map route. Phone held up at a viewpoint showing a map with a route line and pins.
bash scripts/gen_image.sh ugc3 \
	"First-person POV of my hand holding my iPhone up outdoors at a scenic overlook during golden hour, the phone screen shows a map with a colored route line and location pins marking a trip route, real sky and landscape blurred behind the phone, my fingers gripping the phone, authentic unpolished real photo"

# Slide 4 — UNIQUE: the passport. Phone on a cafe table showing a passport grid of visited place stamps.
bash scripts/gen_image.sh ugc4 \
	"Top-down first-person POV of my iPhone lying flat on a wooden cafe table, screen showing a travel app with a grid of collected destination stamps and small trip photos like a passport page, a half-finished coffee and a pastry beside it, warm afternoon light, my hand resting near the phone, authentic real photo"

# Slide 5 — SUBTLE CLOSE: actually on the trip. Over-the-shoulder selfie-style, phone in hand at a real place.
bash scripts/gen_image.sh ugc5 \
	"Over-the-shoulder first-person POV selfie-style shot, my hand holding my iPhone in front of me at a real European old-town street at sunset, the phone screen shows the travel app with a destination detail, cobblestone street and warm buildings behind, my shoulder and side of my face in frame, authentic casual real photo, slightly motion-blurred"
