#!/usr/bin/env bash
# Generate slides 2-5 for the Hybrid cinematic series.
set -euo pipefail
cd "$(dirname "$0")/.."

# Slide 2 — Context: the relief/discovery moment, transit setting (proven plane/airport motif)
bash scripts/gen_image.sh slide2 \
	"A young traveler sitting in an airplane window seat at golden hour, looking down at their phone with a relieved excited smile, soft warm cabin light, blurred clouds and wing visible through the window behind, candid authentic moment of discovery, intimate editorial lifestyle, shallow depth of field"

# Slide 3 — Proof: saved reels become a real itinerary/route. Traveler at a viewpoint, phone subtly showing a map route.
bash scripts/gen_image.sh slide3 \
	"A traveler standing at a breathtaking coastal cliff viewpoint at sunset, holding their phone at chest height showing a subtle glowing map with a route line and pins, warm golden backlight rim-lighting their silhouette, vast ocean and headland behind, epic cinematic scale, tiny human in a grand landscape, film grain, shallow depth of field"

# Slide 4 — Trust / Unique: the Passport differentiator. Warm flat-lay of a travel journal with stamps + polaroids.
bash scripts/gen_image.sh slide4 \
	"A warm overhead flat-lay on a rustic wooden cafe table of a well-loved travel journal open to a page filled with colorful ink passport stamps and taped-in polaroid photos of different destinations, a cup of coffee and a fountain pen beside it, warm afternoon light casting soft shadows, textured paper, editorial still life, nostalgic and aspirational, rich amber tones, shallow depth of field"

# Slide 5 — CTA: the departure / possibility beat. Traveler walking into a sunset street, back to camera.
bash scripts/gen_image.sh slide5 \
	"A solo traveler with a backpack seen from behind, walking down a narrow cobblestone old-town street toward a warm golden sunset, long shadow stretching ahead, string lights and faded building facades lining the street, sense of departure and possibility, cinematic wide shot, warm film grade, atmospheric haze, shallow depth of field"
