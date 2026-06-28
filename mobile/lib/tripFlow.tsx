// mobile/lib/tripFlow.tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { useGenerateItinerary } from "./useGenerateItinerary";
import type { ApiError, GenerateRequest, GenerateResult } from "./api";

interface TripFlowValue {
  generate(req: GenerateRequest): void;
  prepare(req: GenerateRequest): void;
  pendingRequest: GenerateRequest | null;
  status: "idle" | "pending" | "success" | "error";
  data: GenerateResult | undefined;
  error: ApiError | null;
  lastRequest: GenerateRequest | null;
  reset(): void;
}

const TripFlowContext = createContext<TripFlowValue | null>(null);

export function TripFlowProvider({ children }: { children: ReactNode }) {
  const mutation = useGenerateItinerary();
  const [lastRequest, setLastRequest] = useState<GenerateRequest | null>(null);
  const [pendingRequest, setPendingRequest] = useState<GenerateRequest | null>(null);

  function generate(req: GenerateRequest) {
    setLastRequest(req);
    setPendingRequest(null);
    mutation.mutate(req);
  }

  function prepare(req: GenerateRequest) {
    setPendingRequest(req);
  }

  function reset() {
    setLastRequest(null);
    setPendingRequest(null);
    mutation.reset();
  }

  return (
    <TripFlowContext.Provider
      value={{
        generate,
        prepare,
        pendingRequest,
        status: mutation.status,
        data: mutation.data,
        error: mutation.error,
        lastRequest,
        reset,
      }}
    >
      {children}
    </TripFlowContext.Provider>
  );
}

export function useTripFlow(): TripFlowValue {
  const ctx = useContext(TripFlowContext);
  if (!ctx) throw new Error("useTripFlow must be used within TripFlowProvider");
  return ctx;
}
