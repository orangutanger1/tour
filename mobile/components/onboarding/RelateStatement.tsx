// mobile/components/onboarding/RelateStatement.tsx
// Pure engagement priming, same precedent as onboarding's travelParty step —
// the Yes/No answer is screen-local and never persisted or sent anywhere.
// The statement text itself is shown by the shared PROMPTS title/sub block
// in onboarding.tsx (this component is just the two buttons).
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../ui";

export function RelateStatement() {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  return (
    <View className="flex-row gap-3">
      <Button
        title="Yes"
        className="flex-1"
        variant={answer === "yes" ? "gradient" : "secondary"}
        onPress={() => setAnswer("yes")}
      />
      <Button
        title="No"
        className="flex-1"
        variant={answer === "no" ? "gradient" : "secondary"}
        onPress={() => setAnswer("no")}
      />
    </View>
  );
}
