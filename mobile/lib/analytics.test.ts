import { track } from "./analytics";
import type { SupabaseClient } from "@supabase/supabase-js";

function insertClient(insert: jest.Mock): SupabaseClient {
  return { from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient;
}

test("track inserts event with props into analytics_events", async () => {
  const insert = jest.fn(async () => ({ error: null }));
  const client = insertClient(insert);
  await track(client, "paywall_viewed", { source: "onboarding" });
  expect((client.from as jest.Mock).mock.calls[0][0]).toBe("analytics_events");
  expect(insert).toHaveBeenCalledWith({ event: "paywall_viewed", props: { source: "onboarding" } });
});

test("track defaults props to empty object", async () => {
  const insert = jest.fn(async () => ({ error: null }));
  await track(insertClient(insert), "onboarding_completed");
  expect(insert).toHaveBeenCalledWith({ event: "onboarding_completed", props: {} });
});

test("track swallows insert errors and rejections", async () => {
  await expect(track(insertClient(jest.fn(async () => ({ error: { message: "rls" } }))), "e")).resolves.toBeUndefined();
  await expect(track(insertClient(jest.fn(async () => { throw new Error("network"); })), "e")).resolves.toBeUndefined();
});
