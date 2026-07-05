import { useState } from "react";
import { Button } from "../ui";
import { requestNotificationPermission } from "../../lib/notifications";

export function NotificationsStep() {
  const [asked, setAsked] = useState(false);
  return (
    <Button
      title={asked ? "Thanks!" : "Enable Notifications"}
      variant="gradient"
      disabled={asked}
      onPress={async () => {
        setAsked(true);
        await requestNotificationPermission();
      }}
    />
  );
}
