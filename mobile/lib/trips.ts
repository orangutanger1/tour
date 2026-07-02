// mobile/lib/trips.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Itinerary } from "./types";

export interface TripSummary {
  id: string;
  location: string;
  itinerary: Itinerary;
  createdAt: string;
  startDate?: string;   // ISO YYYY-MM-DD; absent on pre-dates trips
  endDate?: string;
  tripType?: "round" | "oneway";
}

interface TripRow {
  id: string;
  location: string;
  itinerary: Itinerary;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  trip_type: string | null;
}

function rowToTrip(row: TripRow): TripSummary {
  return {
    id: row.id,
    location: row.location,
    itinerary: row.itinerary,
    createdAt: row.created_at,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    tripType: row.trip_type === "round" || row.trip_type === "oneway" ? row.trip_type : undefined,
  };
}

// RLS ("own trips") already scopes these to the current user — no user filter here.
export async function listTrips(client: SupabaseClient): Promise<TripSummary[]> {
  const { data, error } = await client
    .from("trips")
    .select("id, location, itinerary, created_at, start_date, end_date, trip_type")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TripRow[]).map(rowToTrip);
}

export async function getTrip(client: SupabaseClient, id: string): Promise<TripSummary | null> {
  const { data, error } = await client
    .from("trips")
    .select("id, location, itinerary, created_at, start_date, end_date, trip_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTrip(data as TripRow) : null;
}

export function tripDayCount(trip: TripSummary): number {
  return trip.itinerary?.days?.length ?? 0;
}
