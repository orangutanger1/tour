// Local permission prompt only — no push token registration, no remote
// notifications setup. Denial is not an error: the onboarding funnel
// continues regardless of the OS response (see canContinue — notifications
// is a non-gating step).
import * as Notifications from "expo-notifications";

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { granted } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return granted;
  } catch {
    return false;
  }
}
