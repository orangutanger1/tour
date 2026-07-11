// mobile/lib/editItinerary.ts
import type { Itinerary, ItineraryDay, Stop } from "./types";

export function isAttraction(s: Stop): boolean {
  return s.kind !== "meal" && s.kind !== "meal-gap";
}

// Map an attraction index (Nth attraction) to its position in the full stops array.
function attrPos(stops: Stop[], attrIndex: number): number {
  let seen = -1;
  for (let i = 0; i < stops.length; i++) {
    if (isAttraction(stops[i]) && ++seen === attrIndex) return i;
  }
  return -1;
}

function mapDay(itin: Itinerary, day: number, fn: (d: ItineraryDay) => ItineraryDay): Itinerary {
  return { ...itin, days: itin.days.map((d) => (d.day === day ? fn(d) : d)) };
}

export function removeStop(itin: Itinerary, day: number, attrIndex: number): Itinerary {
  return mapDay(itin, day, (d) => {
    const pos = attrPos(d.stops, attrIndex);
    if (pos < 0) return d;
    return { ...d, stops: d.stops.filter((_, i) => i !== pos) };
  });
}

export function replaceStop(itin: Itinerary, day: number, attrIndex: number, newStop: Stop): Itinerary {
  return mapDay(itin, day, (d) => {
    const pos = attrPos(d.stops, attrIndex);
    if (pos < 0) return d;
    return { ...d, stops: d.stops.map((s, i) => (i === pos ? newStop : s)) };
  });
}

export function addStop(itin: Itinerary, day: number, attrIndex: number, newStop: Stop): Itinerary {
  return mapDay(itin, day, (d) => {
    const pos = attrPos(d.stops, attrIndex);
    const stops = [...d.stops];
    stops.splice(pos < 0 ? stops.length : pos, 0, newStop);
    return { ...d, stops };
  });
}

export function reorderStops(itin: Itinerary, day: number, from: number, to: number): Itinerary {
  return mapDay(itin, day, (d) => {
    const attractions = d.stops.filter(isAttraction);
    if (from < 0 || from >= attractions.length || to < 0 || to >= attractions.length) return d;
    const [moved] = attractions.splice(from, 1);
    attractions.splice(to, 0, moved);
    // Rebuild: attractions in new order, meals dropped (scheduler re-inserts them).
    return { ...d, stops: attractions };
  });
}

export function moveStopToDay(itin: Itinerary, fromDay: number, attrIndex: number, toDay: number): Itinerary {
  const src = itin.days.find((d) => d.day === fromDay);
  if (!src) return itin;
  const pos = attrPos(src.stops, attrIndex);
  if (pos < 0) return itin;
  const moved = src.stops[pos];
  const removed = removeStop(itin, fromDay, attrIndex);
  return mapDay(removed, toDay, (d) => ({ ...d, stops: [...d.stops, moved] }));
}
