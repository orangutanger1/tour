// Verifies every imageUrl in lib/destinations.ts resolves to an image.
// Run: node scripts/check-image-urls.mjs   (from mobile/)
import { readFileSync } from "fs";

const src = readFileSync(new URL("../lib/destinations.ts", import.meta.url), "utf8");
const urls = [...src.matchAll(/imageUrl:\s*"([^"]+)"/g)].map((m) => m[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia throttles bursts of Special:FilePath requests from one IP (429s,
// and dropped connections once the burst is large enough). Pace the requests
// and retry both 429s and connection failures with backoff so throttling is
// not mistaken for a broken URL.
// Wikimedia requires a descriptive User-Agent and throttles requests without
// one; supply it so we behave like a well-identified client.
// `Connection: close` forces a fresh connection per request: Wikimedia will
// throttle a reused keep-alive connection after a burst, which surfaces as
// spurious "fetch failed" errors on otherwise-valid URLs.
const headers = {
  "User-Agent": "tour-app image-url-check/1.0 (destinations dataset verifier)",
  Connection: "close",
};
async function fetchWithRetry(u, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(u, { headers }).catch(() => null);
    if (r && r.status !== 429) return r;
    await sleep(1500 * (i + 1));
  }
  return null;
}

const bad = [];
for (const u of urls) {
  const r = await fetchWithRetry(u);
  const type = r?.headers.get("content-type") ?? "";
  if (!r?.ok || !type.startsWith("image/")) bad.push(`${u} → ${r ? `${r.status} ${type}` : "fetch failed"}`);
  await sleep(600);
}
console.log(`${urls.length - bad.length}/${urls.length} image URLs OK`);
if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
