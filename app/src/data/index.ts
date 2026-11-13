import raw from './routes.json';
import type { Dataset, StopOccurrence, Trip, Weekday } from '../domain/types';
import { resolveTime } from '../domain/time';
import { validateDataset } from '../domain/validate';

export const dataset = raw as Dataset;
const errors = validateDataset(dataset);
if (errors.length) throw new Error(`운행 데이터 검증 실패: ${errors.join('; ')}`);

export const getRoute = (trip: Trip) => dataset.routes.find(route => route.routeId === trip.routeId);
export const getStop = (occurrence: StopOccurrence) => dataset.stops.find(stop => stop.stopId === occurrence.stopId);
export const getTripTitle = (trip: Trip) => trip.displayName;
export function getTripStops(tripId: string) {
  return dataset.occurrences.filter(item => item.tripId === tripId)
    .sort((a, b) => (a.sequence.value ?? 0) - (b.sequence.value ?? 0))
    .map(occurrence => ({ occurrence, stop: getStop(occurrence)!, location: dataset.locations.find(location => location.locationId === occurrence.locationId), timeRule: dataset.timeRules.find(rule => occurrence.timeRuleIds.includes(rule.timeRuleId)) }));
}
export function getStopTime(occurrenceId: string, weekday: Weekday | null) {
  const occurrence = dataset.occurrences.find(item => item.tripStopId === occurrenceId);
  return resolveTime(dataset, dataset.timeRules.find(rule => occurrence?.timeRuleIds.includes(rule.timeRuleId)), weekday);
}
export function getTripTime(tripId: string, weekday: Weekday | null) {
  const trip = dataset.trips.find(item => item.tripId === tripId);
  const first = getTripStops(tripId).find(item => item.timeRule?.timeKind === (trip?.direction === 'fromCampus' ? 'departureFromCampus' : 'boardingAtStop'));
  return resolveTime(dataset, first?.timeRule, weekday);
}
