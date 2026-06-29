import { readFileSync } from "fs";
import { join } from "path";

function stopFields(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const body = src.match(/export interface Stop \{([\s\S]*?)\}/)![1];
  return [...body.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]).sort();
}

test("mobile Stop type stays in sync with backend Stop type", () => {
  const backend = stopFields(join(__dirname, "../../supabase/_shared/types.ts"));
  const mobile = stopFields(join(__dirname, "./types.ts"));
  expect(mobile).toEqual(backend);
});
