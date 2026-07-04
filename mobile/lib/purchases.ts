// mobile/lib/purchases.ts
// RevenueCat wrapper. iOS-only at launch; every entry point no-ops when not
// configured (web, jest, missing key) so callers never need platform checks.
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";

const extra = Constants.expoConfig?.extra as { revenuecatIosKey?: string };

let configured = false;

export function configurePurchases(): void {
  if (configured || Platform.OS !== "ios" || !extra.revenuecatIosKey) return;
  Purchases.configure({ apiKey: extra.revenuecatIosKey });
  configured = true;
}

// app_user_id = Supabase user id, so the edge function can verify entitlements.
export async function logInPurchases(userId: string): Promise<void> {
  if (!configured) return;
  await Purchases.logIn(userId).catch((e) => console.warn("purchases logIn failed:", e));
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  await Purchases.logOut().catch(() => { /* already anonymous — fine */ });
}

function hasPro(info: CustomerInfo): boolean {
  return !!info.entitlements.active["pro"];
}

export function usePro(): { isPro: boolean } {
  const [isPro, setIsPro] = useState(false);
  useEffect(() => {
    if (!configured) return;
    let mounted = true;
    const update = (info: CustomerInfo) => { if (mounted) setIsPro(hasPro(info)); };
    Purchases.getCustomerInfo().then(update).catch(() => {});
    Purchases.addCustomerInfoUpdateListener(update);
    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener(update);
    };
  }, []);
  return { isPro };
}

export async function getProPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

// true → entitlement active, close the paywall. false → user cancelled.
export async function purchasePro(pkg: PurchasesPackage): Promise<boolean> {
  const before = configured; // ponytail: belt-and-braces; purchase without configure throws anyway
  if (!before) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasPro(customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restorePro(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return hasPro(info);
}
