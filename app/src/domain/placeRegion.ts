import type { PlaceSelection } from './types';

// Match the provider's address labels, including the labels observed in this dataset.
export function inGwangju(address: string) {
  return /^(광주(?:광역시)?(?:\s|$)|전남광주통합특별시\s(?:동구|서구|남구|북구|광산구)(?:\s|$))/.test(address);
}

export function inNaju(address: string) {
  return /^(?:전남|전라남도|전남광주통합특별시)\s나주시(?:\s|$)/.test(address);
}

const gwangjuDistricts = ['동구', '서구', '남구', '북구', '광산구'];

export function gwangjuDistrict(address: string) {
  const district = address.trim().split(/\s+/)[1];
  return inGwangju(address) && gwangjuDistricts.includes(district) ? district : '';
}

export function placeAreaLabel(place: Pick<PlaceSelection, 'lotAddress' | 'roadAddress' | 'regionLabel'>, nationwide: boolean) {
  const address = (place.lotAddress || place.roadAddress || place.regionLabel || '').trim();
  if (!address) return '';
  const parts = address.split(/\s+/);
  const gwangju = inGwangju(address);
  const province = parts[0];
  const hasProvince = gwangju || provinces.some(names => names.includes(province));
  let index = hasProvince ? 1 : 0;
  const area: string[] = [];
  if (gwangju && nationwide) area.push('광주');
  else if (hasProvince && !gwangju && !inNaju(address)) area.push(province);

  // Read only administrative divisions at the start of the address.
  if (/^[가-힣]+[시군]$/.test(parts[index] || '')) area.push(parts[index++]);
  if (/^[가-힣]+구$/.test(parts[index] || '')) area.push(parts[index++]);
  if (place.lotAddress) {
    if (/^[가-힣][가-힣\d·.]*[동읍면]$|^[가-힣]+\d+가$/.test(parts[index] || '')) area.push(parts[index++]);
    if (/^[가-힣]+리$/.test(parts[index] || '') && /[읍면]$/.test(area.at(-1) || '')) area.push(parts[index]);
  }
  return area.join(' · ') || (hasProvince ? province : '');
}

const provinces = [
  ['서울', '서울특별시', '서울시'], ['부산', '부산광역시', '부산시'], ['대구', '대구광역시', '대구시'], ['인천', '인천광역시', '인천시'],
  ['대전', '대전광역시', '대전시'], ['울산', '울산광역시', '울산시'], ['세종', '세종특별자치시', '세종시'],
  ['경기', '경기도'], ['강원', '강원도', '강원특별자치도'], ['충북', '충청북도'], ['충남', '충청남도'],
  ['전북', '전라북도', '전북특별자치도'], ['전남', '전라남도'], ['경북', '경상북도'],
  ['경남', '경상남도'], ['제주', '제주도', '제주특별자치도'], ['전남광주통합특별시'],
];
const municipalities = new Set((
  '수원 성남 의정부 안양 부천 광명 평택 동두천 안산 고양 과천 구리 남양주 오산 시흥 군포 의왕 하남 용인 파주 이천 안성 김포 화성 양주 포천 여주 연천 가평 양평 ' +
  '춘천 원주 강릉 동해 태백 속초 삼척 홍천 횡성 영월 평창 정선 철원 화천 양구 인제 고성 양양 ' +
  '청주 충주 제천 보은 옥천 영동 증평 진천 괴산 음성 단양 천안 공주 보령 아산 서산 논산 계룡 당진 금산 부여 서천 청양 홍성 예산 태안 ' +
  '전주 군산 익산 정읍 남원 김제 완주 진안 무주 장수 임실 순창 고창 부안 목포 여수 순천 광양 담양 곡성 구례 고흥 보성 화순 장흥 강진 해남 영암 무안 함평 영광 장성 완도 진도 신안 ' +
  '포항 경주 김천 안동 구미 영주 영천 상주 문경 경산 의성 청송 영양 영덕 청도 고령 성주 칠곡 예천 봉화 울진 울릉 군위 ' +
  '창원 진주 통영 사천 김해 밀양 거제 양산 의령 함안 창녕 남해 하동 산청 함양 거창 합천 서귀포 기장 달성 강화 옹진 울주'
).split(' '));

export interface PlaceRegion {
  label: string;
  keyword: string;
  nationwideKeyword: string;
  rect?: string;
  matches: (address: string) => boolean;
}

export function placeRegion(input: string): PlaceRegion {
  const keyword = input.trim();
  const words = keyword.split(/[\s,()]+/);
  const province = provinces.find(aliases => words.some(word => aliases.includes(word)));
  const gyeonggi = province?.includes('경기');
  const city = words.find(word => municipalities.has(word.replace(/[시군]$/, '')) ||
    word === '광주시' || (gyeonggi && word === '광주') || word === '제주시');
  const district = words.find(word => otherDistricts.has(word) || gwangjuDistricts.includes(word));
  const gwangju = words.find(word => word === '광주' || word === '광주광역시');
  const naju = words.find(word => word === '나주' || word === '나주시');
  const areaWords = new Set([...(province || []), city, district, gwangju, naju]);
  const nationwideKeyword = words.some(word => areaWords.has(word))
    ? words.filter(word => !areaWords.has(word)).join(' ').trim() || keyword : keyword;

  const najuLandmark = words.some(word => /^나주(?:역$|혁신도시|빛가람|.*아파트$)/.test(word));
  if (naju || (!province && !city && !gwangju && najuLandmark)) {
    return { label: '나주', keyword, nationwideKeyword, matches: inNaju };
  }
  if (province || city) {
    const cityName = city?.replace(/[시군]$/, '');
    return {
      label: [province?.[0], city, district].filter(Boolean).join(' '), keyword, nationwideKeyword,
      matches(address) {
        const parts = address.split(/\s+/);
        const provinceMatch = !province || province.includes(parts[0]) ||
          (province.includes('전남') && parts[0] === '전남광주통합특별시' && !inGwangju(address));
        const cityMatch = !cityName || parts[1] === cityName + '시' || parts[1] === cityName + '군';
        return provinceMatch && cityMatch && (!district || parts.slice(1, 3).includes(district));
      },
    };
  }
  if (district && otherDistricts.has(district) && !gwangju) {
    return { label: district, keyword, nationwideKeyword, matches: address => address.split(/\s+/).slice(1, 3).includes(district) };
  }
  return {
    label: district ? '광주 ' + district : '광주', keyword: gwangju ? keyword : '광주 ' + keyword,
    // Envelope around the five districts. The address check below decides membership.
    rect: '126.63,35.04,127.02,35.28',
    nationwideKeyword, matches: address => inGwangju(address) && (!district || address.split(/\s+/)[1] === district),
  };
}

const otherDistricts = new Set((
  '중구 종로구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구 ' +
  '영도구 부산진구 동래구 해운대구 사하구 금정구 연제구 수영구 사상구 수성구 달서구 미추홀구 연수구 남동구 부평구 계양구 유성구 대덕구 ' +
  '장안구 권선구 팔달구 영통구 수정구 중원구 분당구 만안구 동안구 원미구 소사구 오정구 상록구 단원구 덕양구 일산동구 일산서구 처인구 기흥구 수지구 ' +
  '상당구 서원구 흥덕구 청원구 동남구 서북구 완산구 덕진구 의창구 성산구 마산합포구 마산회원구 진해구'
).split(' '));
