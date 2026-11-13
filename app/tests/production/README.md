# RC1 프로덕션 회귀

실제 `vite build` 산출물을 `vite preview`로 제공한 상태에서 실행한다. `/src` 파일이나 앱 JS 모듈을 교체하지 않는다. 첫 시험은 `/assets/` JS 요청과 개발 모듈 미사용을 검사하므로 개발 서버로 실행하면 실패한다.

```powershell
# app에서 실행. 실제 키 없이 모의 검사만 할 때의 빌드 설정
$env:VITE_KAKAO_MAP_JS_KEY = 'rc1-synthetic-test-key'
pnpm build
Remove-Item Env:VITE_KAKAO_MAP_JS_KEY
pnpm preview
# 별도 app 터미널에서
pnpm exec playwright install chromium
pnpm exec playwright test --config playwright.production.config.ts
```

`pnpm preview`의 주소와 포트는 프로젝트 README를 따른다. 다른 주소를 쓰면 `PLAYWRIGHT_BASE_URL`을 설정한다. 설치된 Chrome을 쓰려면 `PLAYWRIGHT_CHANNEL=chrome`, 출력 위치는 `RC1_PRODUCTION_EVIDENCE_DIR`로 지정한다. 출력 기본값은 `app/artifacts/production`이며 이전 제출 근거를 덮어쓰지 않는다.

8개 과업을 데스크톱·모바일 에뮬레이션에서 검사한다. 첫 진입/직접 진입/새로고침과 선택 화면 로딩, 양방향 19편 목록, 금요일 대체, 등하교 시간조건, 거리·시각 정렬, 후보 상세 왕복·초점·조건 보존, 주소검색·빈 결과·실패 복구, 평가의 시작·시간정지·내보내기·삭제, 선택청크 실패 복구·axe·리플로우를 포함한다.

검색 응답은 외부 SDK 스크립트의 네트워크 경계에서 합성 응답으로 대체한다. 합성 장소의 좌표는 기록된 표시점을 시험 원점으로 재사용하며 실제 Kakao 검색 결과나 사람의 위치가 아니다. 지도 생성은 의도적으로 실패시키고 텍스트/목록 복구를 검사한다. 실제 지도 타일/검색은 별도 실연동 검사에만 해당한다. 자동 내보내기는 항상 `recordKind=rehearsal`이며 인간 자기평가가 아니다. axe 검사 통과를 전체 WCAG 적합이나 실제 사용자 성과로 해석하지 않는다.

실제 키 없는 빌드도 목록·상세를 실행할 수 있지만 SDK 경계 시험은 비어 있지 않은 빌드 설정이 필요하다. 위 합성 키 빌드를 실제 검색 시연용으로 사용하지 않는다. 실제 시연 전에는 본인의 `.env.local` JS키로 다시 빌드하고 등록 도메인에서 확인한다. REST/Admin키를 사용하지 않는다.
