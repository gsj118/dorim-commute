import { isConfirmed } from '../domain/time';
import { validCoordinates } from '../domain/validate';
import type { Coordinates, Dataset, Direction } from '../domain/types';

interface AnchorPoint {
  locationId: string;
  label: string;
  rationale: string;
  coordinates: Coordinates;
  sourceLabel: string;
  sourceUrl: string;
}
export type DiscoveryAnchor = AnchorPoint & (
  | { kind: 'timetableMarker'; sourceOccurrenceId: string; direction: Direction; tripName: string }
  | { kind: 'facility'; sourceOccurrenceId?: undefined; direction?: undefined; tripName?: undefined }
);

// Each row was checked against S25 p.1. Numbers select only the reviewed target
// trips. Neither names in a user's search nor a nearest-neighbour lookup create links.
type MarkerRow = readonly [targetName: string, targetTrips: number[], source: string, sourceName: string, reason: string];
const westToStation = 'S25에서 구호남대·세정아울렛·구송정파출소·송정역을 지나는 구간과 원문의 지점명을 대조했습니다.';
const northToStation = 'S25에서 광산중학교·월곡동부영·어등산약국과 수완·첨단 방면의 원문 경유 순서를 대조했습니다.';
const suwan = 'S25에서 어등산약국·수완W여성병원·수완2차우미린·첨단응암공원 주변의 경유 순서와 단지·시설명을 대조했습니다.';
const cheomdan = 'S25의 용두주공·광주우편집중국·첨단응암공원 구간에 같은 이름의 지점이 있습니다.';
const munheung = 'S25 하교표의 조선대·산수오거리·백림약국·동신고·북광주전화국·문흥동샛터코아 경유 순서가 같습니다.';
const northJinwol = 'S25 하교표에서 백운광장·독립로알뜰주유소건너편부터 북구청·31사단정문까지 이어지는 구간이 같습니다.';
const songjeong: MarkerRow[] = [
  ['서광주우체국', [3,7], 'to-songjeong-01-02', '서광주우체국 건너편 CU편의점', 'S25 하교에 서광주우체국→염주체육관, 등교에 염주체육관 건너편 육교→서광주우체국 건너편 CU편의점이 적혀 있습니다.'],
  ['염주체육관', [3,7], 'to-songjeong-01-01', '염주체육관 건너편 육교', 'S25에서 서광주우체국과 염주체육관을 지나는 양방향 구간과 “건너편 육교” 표기를 확인했습니다.'],
  ['금호지구중흥Ⓐ', [3,7], 'to-songjeong-02-01', '금호지구중흥Ⓐ건너편승강장', 'S25 양방향 표기가 금호지구 중흥 단지를 가리키며, 등교에는 건너편 승강장이 적혀 있습니다.'],
  ['풍암지구대주Ⓐ사거리', [3,7], 'to-jinwol-05-01', '풍암지구대주Ⓐ사거리', 'S25에 풍암지구·대주아파트·사거리가 함께 적힌 동일 명칭입니다.'],
  ['송정역', [1,2,4,10,11], 'to-songjeong-04-09', '송정역시외버스승강장', westToStation],
  ['구송정파출소', [1,4,10,11], 'to-songjeong-04-08', '구송정파출소건너편 할리매장옆승강장', westToStation],
  ['세정아울렛건너편', [4,10], 'to-songjeong-04-07', '세정아울렛버스승강장', westToStation],
  ['구호남대', [4,10], 'to-songjeong-04-06', '구호남대 한마음신경정신과', westToStation],
  ['추선회관', [4,10], 'to-songjeong-04-05', '추선회관', 'S25 등교 송정④의 추선회관→구호남대와 하교의 구호남대→추선회관을 대조했습니다.'],
  ['NC백화점광주역점', [4,10], 'to-songjeong-04-02', 'NC백화점 광주역점', 'S25에 광주역점 지점명이 명시되어 있고 인접 전남대정문과 경유 순서가 반대입니다.'],
  ['전남대정문', [4,10], 'to-songjeong-04-01', '전남대정문', 'S25에서 NC백화점 광주역점과 전남대 정문을 지나는 구간과 출입구 이름을 대조했습니다.'],
  ['LG전자베스트샵용봉점', [4,10], 'to-jinwol-04-01', 'LG전자베스트샵용봉점', 'S25에 같은 매장의 용봉점 지점명이 적혀 있습니다.'],
  ['광산중학교', [1,2,6,8,11], 'to-songjeong-10-09', '광산중학교건너편승강장', northToStation],
  ['월곡동부영Ⓐ', [1,2,6,8,11], 'to-songjeong-10-08', '월곡동부영Ⓐ승강장', northToStation],
  ['어등산약국', [1,2,6,8,11], 'to-songjeong-10-07', '어등산약국', northToStation],
  ['수완W여성병원', [1,2,6,8,11], 'to-songjeong-06-04', '수완W여성병원', suwan],
  ['현진에버빌Ⓐ', [1,6], 'to-songjeong-06-03', '현진에버빌Ⓐ승강장', suwan],
  ['수완2차우미린Ⓐ', [1,6], 'to-songjeong-06-02', '수완2차우미린Ⓐ승강장', suwan],
  ['첨단응암공원', [1,2,6,8,11], 'to-songjeong-10-03', '첨단응암공원승강장', cheomdan],
  ['광주우편집중국승강장', [1,2,6,8,11], 'to-songjeong-10-02', '광주우편집중국승강장', cheomdan],
  ['용두주공', [1,2,6,8,11], 'to-songjeong-10-01', '용두주공', cheomdan],
  ['연제동롯데칠성', [1], 'to-songjeong-05-02', '연제동롯데칠성승강장', 'S25에 연제동·롯데칠성이 명시되어 있고 일곡119안전센터와 용두주공 사이에 있습니다.'],
  ['일곡119안전센터', [1], 'to-songjeong-05-01', '일곡119안전센터', 'S25에 일곡119안전센터와 인접 연제동롯데칠성 경유가 함께 적혀 있습니다.'],
  ['신창동우체국', [5,9], 'to-songjeong-07-02', '신창동우체국', '신창동 지명이 붙은 우체국과 인접 남부대 구간이 S25 양방향에 있습니다.'],
  ['남부대', [5,9], 'to-songjeong-07-01', '남부대정문', 'S25 양방향에 신창동우체국과 남부대가 이어지며 등교는 정문으로 표기됩니다.'],
];
const jinwol: MarkerRow[] = [
  ['천주교성당', [2,5,6,8], 'from-jinwol-03-01', '천주교성당', 'S25의 동일 하교권역 성당 표기와 나주·효천역 방면 경유를 대조했습니다.'],
  ['남광주농협진월동지점', [6,8], 'from-jinwol-03-04', '남광주농협 진월동지점', 'S25 양쪽에 진월동지점이 명시되어 있고 효천역 다음에 옵니다.'],
  ['효천역', [2,6,8], 'from-jinwol-03-03', '효천역', 'S25에 효천역 시설명이 적혀 있으며 진월동·나주 구간을 대조했습니다.'],
  ['탑 모텔', [7,8], 'from-jinwol-03-02', '탑 모텔', 'S25의 하교 나주 방면 경유명과 등교 진월③·⑦의 남평 탑모텔 명칭을 대조했습니다.'],
  ['빛가람동주민센터', [2,7,8], 'from-jinwol-04-03', '빛가람동주민센터', 'S25에서 빛가람동 행정동명이 명시되어 있고 나주 방면 경유가 확인됩니다.'],
  ['다시공영버스터미널', [7,8], 'from-jinwol-04-02', '다시공영버스터미널', 'S25 하교 고막원 광목기사식당→다시공영버스터미널 순서가 같습니다.'],
  ['고막원 광목기사식당 건너편 횡단보도', [7,8], 'from-jinwol-04-01', '고막원 광목기사식당 건너편 횡단보도', 'S25에 고막원·광목기사식당·횡단보도가 함께 적혀 있고 다음 지점은 다시공영버스터미널입니다.'],
  ['조선대', [5], 'from-jinwol-03-05', '조선대', munheung],
  ['산수오거리', [5], 'from-jinwol-03-06', '산수오거리', munheung],
  ['백림약국', [5], 'from-jinwol-03-07', '백림약국', munheung],
  ['동신고', [5], 'from-jinwol-03-08', '동신고', munheung],
  ['북광주전화국', [5], 'from-jinwol-03-09', '북광주전화국', munheung],
  ['문흥동샛터코아', [5], 'from-jinwol-03-10', '문흥동 샛터코아', munheung],
  ['삼익세라믹Ⓐ', [5], 'to-jinwol-03-02', '삼익세라믹Ⓐ정문_남광주농협앞', 'S25에 삼익세라믹 단지명과 학동시장 경유가 함께 적혀 있습니다. 등교는 정문입니다.'],
  ['학동시장', [5], 'to-jinwol-03-03', '학동시장버스승강장_부흥교회앞', 'S25에서 학동시장·삼익세라믹 경유와 등교의 부흥교회 앞 표기를 대조했습니다.'],
  ['일곡119안전센터', [6], 'to-songjeong-05-01', '일곡119안전센터', 'S25 양방향에 광주 일곡119안전센터의 고유 관서명이 적혀 있습니다.'],
  ['백운광장', [6], 'from-jinwol-04-06', '백운광장', northJinwol],
  ['독립로알뜰주유소건너편', [6], 'from-jinwol-04-07', '독립로알뜰주유소건너편', northJinwol],
  ['한미쇼핑', [6], 'from-jinwol-04-08', '한미쇼핑', northJinwol],
  ['구터미널', [6], 'from-jinwol-04-09', '구터미널', northJinwol],
  ['한국화장품', [6], 'from-jinwol-04-10', '한국화장품', northJinwol],
  ['북구청', [6], 'from-jinwol-04-11', '북구청', northJinwol],
  ['한국전력공사', [6], 'from-jinwol-04-12', '한국전력공사', northJinwol],
  ['31사단정문', [6], 'from-jinwol-04-13', '31사단정문', northJinwol],
  ['호남원예고', [2], 'to-jinwol-01-10', '호남원예고앞', 'S25에 호남원예고 학교명과 인접 천주교성당이 적혀 있습니다.'],
  ['동성고육교', [2], 'to-jinwol-04-08', '동성고육교옆', 'S25에 동성고 육교와 효천역 구간이 적혀 있습니다.'],
  ['상공회의소', [2,7], 'to-jinwol-04-04', '상공회의소', 'S25에서 광천파출소와 광주 상공회의소를 지나는 구간을 대조했습니다.'],
  ['신세계백화점', [2,7], 'to-songjeong-03-03', '신세계백화점육교', 'S25 서구 광천파출소 방면 하교 경유와 등교표의 신세계백화점 육교 명칭을 대조했습니다.'],
  ['광천파출소', [2,7], 'to-jinwol-04-03', '광천파출소건너편', 'S25 양방향에 광천파출소와 상공회의소가 적혀 있고 등교는 건너편입니다.'],
  // Used for the holdout check only when the observed marker of this trip is unavailable.
  ['문흥동 샛터코아', [3], 'to-jinwol-01-01', '문흥동샛터코아건너편_광주은행문흥지점', 'S25의 문흥동 샛터코아와 문흥동샛터코아 건너편 광주은행 문흥지점 표기를 대조했습니다.'],
];

const schoolsUrl = 'https://www.data.go.kr/data/15021148/standard.do';
// 한국교육시설안전원 nationwide school-position file, 2026-10-01, operating main schools.
const schools = [
  { group:'jinwol', trips:[2,6], target:'대광여고', id:'B000012325', label:'대광여자고등학교', lat:35.12540615, lng:126.8994216,
    rationale:'S25 남구 진월동·백운광장 방면의 대광여고를 주월동 대광여자고등학교(서문대로742번길 13) 본교와 대조했습니다.' },
  { group:'songjeong', trips:[4,10], target:'광진빌딩(양동초입구)', id:'B000003260', label:'광주양동초등학교', lat:35.15411986, lng:126.8981987,
    rationale:'S25 광진빌딩의 괄호 안 지명 “양동초입구”와 광주 서구의 광주양동초등학교(경열로121번길 5)를 대조했습니다. 거리는 학교 자료의 대표 위치까지입니다.' },
] as const;

// A pair of public bus platforms can identify a neighbourhood. The chosen
// platform's ID remains visible; its direction is not the university bus's direction.
const busLandmarks = [
  { group:'songjeong', trips:[5,9], target:'신가사거리', label:'신가사거리 시내버스 정류소(ARS 5181)',
    id:'KJB898', lat:35.179758, lng:126.831185,
    rationale:'S25 신가주공1단지→신가사거리→신창동우체국 구간과 광주 정류소 자료의 광산구 신가동 “신가사거리(신가주공아파트)”를 대조했습니다. 같은 사거리에 ARS 5182도 있어 통학버스가 정차하는 도로변은 확인이 필요합니다.' },
  { group:'jinwol', trips:[7], target:'신우Ⓐ', label:'신우아파트 시내버스 정류소(ARS 3183)',
    id:'KJB885', lat:35.138841, lng:126.895825,
    rationale:'S25 하교 남구→상공회의소 구간의 신우아파트와 광주BIS 신우아파트 표시점 두 곳(3183·3184, 남구 월산동 1058-2)을 대조했습니다. 대학 버스가 서는 도로변은 확인이 필요합니다.' },
  { group:'jinwol', trips:[2], target:'신우아파트', label:'신우아파트 시내버스 정류소(ARS 3183)',
    id:'KJB885', lat:35.138841, lng:126.895825,
    rationale:'S25 대광여고→신우아파트→상공회의소 구간과 광주BIS의 남구 월산동 신우아파트 표시점 두 곳(3183·3184)을 대조했습니다.' },
  { group:'songjeong', trips:[5,9], target:'무안우체국', label:'무안우체국 시내버스 정류소(ARS 42007)',
    id:'MPB180000083', lat:34.9869856, lng:126.4778177,
    rationale:'S25 하교의 무안우체국, 무안읍 무안로 489의 우정사업본부 관서명, 목포BIS 무안우체국 정류소(42007·42020)를 대조했습니다.' },
  { group:'jinwol', trips:[8], target:'무안우체국', label:'무안우체국 시내버스 정류소(ARS 42007)',
    id:'MPB180000083', lat:34.9869856, lng:126.4778177,
    rationale:'S25 하교의 무안우체국, 무안읍 무안로 489의 우정사업본부 관서명, 목포BIS 무안우체국 정류소(42007·42020)를 대조했습니다.' },
  { group:'jinwol', trips:[5], target:'함평역', label:'함평역 시내버스 정류소(ARS 1750)',
    id:'HPB750', lat:35.02411657, lng:126.53863101,
    rationale:'S25 진월⑤ 하교의 함평역과 함평BIS의 함평역 정류소(1750·2021)를 대조했습니다. 특정 플랫폼에서의 대학 버스 하차 여부는 확인이 필요합니다.' },
] as const;

const targetKey = (tripId: string, name: string) => tripId + '/' + name;
const homewardTrip = (group: string, n: number) => 'tp-s25-from-' + group + '-' + String(n).padStart(2, '0');
const isS25Name = (stop: Dataset['stops'][number]) =>
  isConfirmed(stop.officialName) && stop.officialName.evidence.some(ref => ref.sourceId === 'S25');

export function resolveDiscoveryAnchors(data: Dataset): Map<string, DiscoveryAnchor> {
  const anchors = new Map<string, DiscoveryAnchor>();
  if (data.metadata.datasetId !== 'mnu-s25-2026-sem2' || data.metadata.dataKind !== 'officialSnapshot') return anchors;

  const trips = new Map(data.trips.map(trip => [trip.tripId, trip]));
  const stops = new Map(data.stops.map(stop => [stop.stopId, stop]));
  const locations = new Map(data.locations.map(location => [location.locationId, location]));
  const occurrences = new Map(data.occurrences.map(occ => [occ.tripStopId, occ]));
  const withheld = new Set(data.conflicts.filter(c => c.state === 'open').flatMap(c => c.withheldTargetIds));
  const inScopeTrips = new Set(data.coverage.supportedTripIds);
  const inScopeStops = new Set(data.coverage.supportedStopIds);
  const inScopeRelations = new Set(data.coverage.supportedTripStopIds);
  const byTripAndName = new Map<string, string>();
  for (const occ of data.occurrences) {
    const stop = stops.get(occ.stopId);
    if (trips.get(occ.tripId)?.direction === 'fromCampus' && stop?.direction === 'fromCampus' &&
        stop.role === 'alighting' && isS25Name(stop) && isConfirmed(occ.sequence)) {
      const key = targetKey(occ.tripId, stop.displayName);
      // Repeated homonyms in one trip require their own occurrence-level review.
      byTripAndName.set(key, byTripAndName.has(key) ? '' : occ.tripStopId);
    }
  }
  const bind = (group: string, numbers: readonly number[], name: string, anchor: DiscoveryAnchor) => {
    for (const number of numbers) {
      const id = byTripAndName.get(targetKey(homewardTrip(group, number), name));
      if (id && !anchors.has(id)) anchors.set(id, anchor);
    }
  };
  for (const [group, rows] of [['songjeong', songjeong], ['jinwol', jinwol]] as const) {
    for (const [targetName, numbers, id, sourceName, rationale] of rows) {
      const source = occurrences.get('occ-tp-s25-' + id);
      if (!source || !source.locationId || source.locationMapping) continue;
      if (!inScopeTrips.has(source.tripId) || !inScopeStops.has(source.stopId) || !inScopeRelations.has(source.tripStopId)) continue;
      const trip = trips.get(source.tripId);
      const stop = stops.get(source.stopId);
      const location = locations.get(source.locationId);
      if (!trip || !stop || !location || location.stopId !== stop.stopId ||
          stop.displayName !== sourceName || !isS25Name(stop) || !isConfirmed(source.sequence)) continue;
      if (stop.direction !== trip.direction || stop.role !== (trip.direction === 'toCampus' ? 'boarding' : 'alighting')) continue;
      if ([trip.tripId, source.tripStopId, stop.stopId, location.locationId].some(key => withheld.has(key))) continue;
      const point = location.coordinates;
      if (location.positionKind !== 'officialMapMarker' || point.locationCheck !== 'officialMarkerObserved' ||
          point.originKind !== 'officialUi' || point.documentCheck !== 'checked' || point.currentness === 'superseded' ||
          !isConfirmed(point) || !validCoordinates(point.value)) continue;
      bind(group, numbers, targetName, {
        kind:'timetableMarker', label:stop.displayName, direction:trip.direction, tripName:trip.displayName,
        sourceOccurrenceId:source.tripStopId, locationId:location.locationId, coordinates:point.value,
        sourceLabel:'공식 Unibus · ' + trip.displayName + ' ' + (trip.direction === 'toCampus' ? '등교' : '하교') + ' 표시점',
        sourceUrl:'https://mokpo.unibus.kr/#!/line', rationale,
      });
    }
  }
  for (const school of schools) {
    bind(school.group, school.trips, school.target, {
      kind:'facility', label:school.label, locationId:'public-school-' + school.id,
      coordinates:{ crs:'WGS84', latitude:school.lat, longitude:school.lng },
      sourceLabel:'한국교육시설안전원 · 전국초중등학교위치표준데이터 · ' + school.id + ' (2026-10-01)',
      sourceUrl:schoolsUrl, rationale:school.rationale,
    });
  }
  for (const landmark of busLandmarks) {
    bind(landmark.group, landmark.trips, landmark.target, {
      kind:'facility', label:landmark.label, locationId:'tago-' + landmark.id,
      coordinates:{ crs:'WGS84', latitude:landmark.lat, longitude:landmark.lng },
      sourceLabel:'국토교통부 · 전국 버스정류장 위치정보(' + landmark.id + ', 2026-11-09)',
      sourceUrl:'https://www.data.go.kr/data/15067528/fileData.do', rationale:landmark.rationale,
    });
  }
  return anchors;
}
