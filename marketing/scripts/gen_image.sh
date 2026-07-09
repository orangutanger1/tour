#!/usr/bin/env bash
# Generate a realistic first-person UGC POV photo via OpenRouter (Nano Banana Pro).
# No text is ever composited onto the image — the phone screen shows the app UI
# rendered by the model, and the caption lives in TikTok's caption field.
# Usage: gen_image.sh <filename> <prompt>
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/assets"
ORKEY=$(python3 -c "import json;print(json.load(open('/home/myen/.pi/agent/auth.json'))['openrouter']['key'])")
FNAME="${1:?filename required}"
PROMPT="${2:?prompt required}"
OUT="$DIR/${FNAME}.jpg"

# Shared UGC style spine — fights the cinematic AI look. Consistent across slides.
STYLE="Realistic amateur iPhone photo, first-person point of view, shot casually one-handed, natural available light, unpolished authentic user-generated content aesthetic, NOT cinematic, no film grade, no color grading, no shallow depth-of-field bokeh, raw phone-camera look with slight imperfections, vertical 9:16. The phone screen in frame shows a clean modern travel-planner app UI with a warm off-white background and amber accents. No text overlay on the photo, no watermark, no logos, no AI glow."

echo "→ generating $FNAME ..."
curl -s "https://openrouter.ai/api/v1/images" \
	-H "Authorization: Bearer $ORKEY" -H "Content-Type: application/json" \
	-d "$(python3 -c "import json,sys;print(json.dumps({'model':'google/gemini-3-pro-image','prompt':sys.argv[1],'size':'1080x1920'}))" "$PROMPT. $STYLE")" |
	python3 -c "
import json,sys,base64
r=json.load(sys.stdin)
if r.get('error'):
    print('ERROR:',r['error']); sys.exit(1)
b64=r['data'][0]['b64_json']
open('$OUT','wb').write(base64.b64decode(b64))
print('saved $OUT')
"
