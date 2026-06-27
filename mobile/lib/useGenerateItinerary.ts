// mobile/lib/useGenerateItinerary.ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import Constants from "expo-constants";
import { generateItinerary, type ApiError, type GenerateRequest, type GenerateResult } from "./api";
import { useAuth } from "./auth";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string };

export function useGenerateItinerary(): UseMutationResult<GenerateResult, ApiError, GenerateRequest> {
  const { session } = useAuth();
  return useMutation<GenerateResult, ApiError, GenerateRequest>({
    mutationFn: (req) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("not authenticated");
      return generateItinerary({ req, accessToken, baseUrl: extra.supabaseUrl });
    },
  });
}
