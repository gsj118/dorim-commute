export type Direction = 'toCampus' | 'fromCampus';
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type DecisionState = 'yes' | 'no' | 'unknown' | 'conflict';
export type VerificationStatus = 'VERIFIED' | 'CONFLICTED' | 'UNVERIFIED' | 'ESTIMATED' | 'MOCK';
export type StopRole = 'boarding' | 'alighting' | 'via' | 'campusArrival';
export interface EvidenceRef { sourceId: string; locator: string; claimId: string; }
export interface Fact<T> {
  value: T | null;
  verificationStatus: VerificationStatus;
  informationState: 'officialConfirmed' | 'userConfirmed' | 'calculated' | 'unverified' | 'conflict';
  originKind: 'officialDocument' | 'officialNotice' | 'officialUi' | 'authorReport' | 'researchInterpretation' | 'designHypothesis' | 'apiResult' | 'calculation' | 'syntheticFixture';
  evidence: EvidenceRef[];
  documentCheck: 'checked' | 'notReviewed' | 'notProvided' | 'notApplicable';
  locationCheck: 'actualStopVerified' | 'officialMarkerObserved' | 'userConfirmedText' | 'facilityIdentifiedOnly' | 'notReviewed' | 'notProvided' | 'notApplicable';
  conditionCheck: 'checked' | 'unknown' | 'conflict' | 'notApplicable';
  currentness: 'noticeChecked' | 'unknown' | 'superseded' | 'notApplicable';
  alternatives: { value: T; evidence: EvidenceRef[] }[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  missingReason: string | null;
}
export interface Coordinates { crs: 'WGS84'; latitude: number; longitude: number; }
export interface Source { sourceId: string; kind: 'pdf' | 'notice' | 'ui' | 'report' | 'api' | 'calculation'; title: string; versionLabel: string | null; localPath: string | null; officialUrl: string | null; sha256: string | null; publishedAt: string | null; accessedAt: string | null; }
export interface DatasetVersion { datasetId: string; schemaVersion: string; dataVersion: string; dataKind: 'officialSnapshot' | 'syntheticDemo'; academicTerm: Fact<string>; sourceIds: string[]; coverageId: string; createdAt: string | null; reviewedOn: string; review: Fact<string>; titleRaw: Fact<string>; isDraft: Fact<boolean>; changeNoticeRaw: Fact<string>; validFrom: string | null; validUntil: string | null; latestNoticeCheckedAt: string | null; }
export interface Route { routeId: string; officialName: Fact<string>; areaGroup: Fact<string>; officialRouteCode: Fact<string>; sourceIds: string[]; }
export interface Trip { tripId: string; datasetId: string; routeId: string | null; direction: Direction; campusId: string; originalTable: string; originalRowNumber: string; serviceRuleIds: string[]; variantIds: string[]; displayName: string; summary: string; uiObservation: Fact<string>; documentNotes?: string[]; }
export interface DirectionalStop { stopId: string; campusId: string | null; serviceAreaId: string; administrativeArea: Fact<string>; direction: Direction; role: StopRole; officialName: Fact<string>; displayName: string; locationDescription: Fact<string>; aliasIds: string[]; }
export type Stop = DirectionalStop;
export interface StopLocation { locationId: string; stopId: string; coordinates: Fact<Coordinates>; roadsideDescription: Fact<string>; positionKind: 'actualBoardingPoint' | 'actualAlightingPoint' | 'officialMapMarker' | 'campusArrival' | 'facilityOnly' | 'unknown'; }
export interface StopOccurrence { tripStopId: string; tripId: string; variantId: string | null; stopId: string; locationId: string | null; sequence: Fact<number>; timeRuleIds: string[]; callRuleIds: string[]; callPermission: Fact<StopRole>; locationMapping?: { kind: 'sameDirectionalSequence'; sourceTripId: string; evidence: EvidenceRef[] }; }
export type TripStop = StopOccurrence;
export interface ServiceRule { ruleId: string; scope: 'trip' | 'stop' | 'segment' | 'campusVia'; targetIds: string[]; weekdays: Fact<Weekday[]>; rawNote: Fact<string>; effectiveFrom: string | null; effectiveUntil: string | null; holidayOperation: Fact<DecisionState>; specialDatePolicy: Fact<string>; }
export type TimeKind = 'boardingAtStop' | 'departureFromCampus' | 'officialArrivalAtStop' | 'officialIntermediateTime';
export interface TimeRule { timeRuleId: string; targetTripStopId: string; timeKind: TimeKind; baseTime: Fact<string>; applicabilityRuleId?: string; overrides: { overrideId: string; conditionRuleId: string; time: Fact<string>; effect: 'replace'; evidence: EvidenceRef[] }[]; }
export interface Coverage { coverageId: string; serviceAreaIds: string[]; supportedTripIds: string[]; supportedStopIds: string[]; supportedTripStopIds: string[]; adjacentStopAllowlist: string[]; description: string; verifiedBoundary: Fact<string>; }
export interface Conflict { conflictId: string; fieldPaths: string[]; sourceClaims: EvidenceRef[]; impact: string; withheldTargetIds: string[]; resolutionEvidence: EvidenceRef[]; state: 'open' | 'resolved'; }
export interface Dataset { metadata: DatasetVersion; routes: Route[]; trips: Trip[]; stops: Stop[]; locations: StopLocation[]; occurrences: StopOccurrence[]; serviceRules: ServiceRule[]; timeRules: TimeRule[]; sources: Source[]; coverage: Coverage; conflicts: Conflict[]; }
export interface PlaceSelection { provider: 'kakao' | 'naver' | 'verifiedLocal' | 'manualMap'; providerPlaceId: string | null; selectionId: string; kind: 'place' | 'address' | 'manualPoint'; name: string; categoryName?: string; roadAddress: string | null; lotAddress: string | null; regionLabel: string | null; detailUrl: string | null; coordinates: Coordinates | null; coordinateSource: string; selectedAt: string; selectionState: 'notSelected' | 'explicitlySelected' | 'invalidated'; validationState: 'checked' | 'unknown' | 'invalid'; }
export type Place = PlaceSelection;
export interface TimeDisplay { value: string | null; kind: TimeKind | null; label: string; isOverride: boolean; conditionConfirmed: boolean; reason: string | null; }
export interface TimeCondition { kind: 'campusArriveBy' | 'campusReadyAfter' | 'boardingAfter' | 'boardingBefore'; minutes: number; }
