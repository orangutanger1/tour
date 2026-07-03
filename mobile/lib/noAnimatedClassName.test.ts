// NativeWind classNames on reanimated components (cssInterop-registered or
// Animated.*) are silently dropped on device. Ban the pattern at test time —
// jest can't see the native runtime, but it can see the source.
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");

function listSrc(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : listSrc(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const files = ["app", "components", "lib"].flatMap((d) => listSrc(path.join(ROOT, d)));

test("no className on reanimated components", () => {
  const re = /<(Animated\.[A-Za-z]+|AnimatedView|AnimatedPressable)\b[^>]*className/;
  const offenders = files.filter((f) => re.test(fs.readFileSync(f, "utf8")));
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});

test("no cssInterop calls outside the allowlist", () => {
  // Photo.tsx registers expo-image (a plain native component) — that interop
  // path is device-verified working. The banned pattern is cssInterop on
  // reanimated-wrapped components, which silently drops className on device.
  const ALLOWED = new Set(["components/ui/Photo.tsx"]);
  const offenders = files.filter(
    (f) => !ALLOWED.has(path.relative(ROOT, f).replace(/\\/g, "/")) && /\bcssInterop\s*\(/.test(fs.readFileSync(f, "utf8")),
  );
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});
