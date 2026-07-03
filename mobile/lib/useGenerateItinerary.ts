// mobile/lib/useGenerateItinerary.ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import Constants from "expo-constants";
import { generateItinerary, waitForTrip, ApiError, type GenerateRequest, type GenerateResult } from "./api";
import { getTrip, getTripStatus } from "./trips";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string };

export function useGenerateItinerary(): UseMutationResult<GenerateResult, ApiError, GenerateRequest> {
  const { session } = useAuth();
  return useMutation<GenerateResult, ApiError, GenerateRequest>({
    mutationFn: async (req) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("not authenticated");
      const { tripId } = await generateItinerary({ req, accessToken, baseUrl: extra.supabaseUrl });
      await waitForTrip({ getStatus: () => getTripStatus(supabase, tripId) });
      const trip = await getTrip(supabase, tripId);
      if (!trip) throw new ApiError(500, "trip missing after generation");
      return { tripId, itinerary: trip.itinerary };
    },
  });
}
