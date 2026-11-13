import { dataset, getTripStops } from '../data';
import type { Direction, Trip } from './types';

export interface RouteSearchResult {
  trip: Trip;
  matchedStops: ReturnType<typeof getTripStops>;
}

function searchText(text: string) {
  return text.normalize('NFC').toLowerCase().replace(/\s+/gu, '');
}

function routeNumberText(text: string) {
  return text.replace(/[①-⑳]/gu, number => number.normalize('NFKC'));
}

export function searchRoutes(direction: Direction, query: string): RouteSearchResult[] {
  const term = searchText(query);
  const routeTerm = routeNumberText(term);
  const number = routeTerm.match(/\d+$/u)?.[0];
  const results: RouteSearchResult[] = [];

  for (const trip of dataset.trips) {
    if (trip.direction !== direction) continue;
    const name = routeNumberText(searchText(trip.displayName));
    // A route number is a whole number: 송정1 must not select 송정⑩ or 송정⑪.
    if (!term || (name.includes(routeTerm) && (!number || name.match(/\d+$/u)?.[0] === number))) {
      results.push({ trip, matchedStops: [] });
      continue;
    }

    const matchedStops = getTripStops(trip.tripId).filter(({ stop }) => searchText(stop.displayName).includes(term));
    if (matchedStops.length || searchText(trip.summary).includes(term)) {
      results.push({ trip, matchedStops });
    }
  }
  return results;
}
