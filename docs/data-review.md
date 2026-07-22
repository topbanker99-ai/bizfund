# 자금 데이터 월간 검수 체크리스트

`app.html` 의 `PROGRAMS`(자금 14종)를 **월 1회** 공식 출처로 대조하는 절차입니다.
매월 1일 GitHub Actions가 이 체크리스트로 이슈를 자동 생성합니다(`.github/workflows/data-review-reminder.yml`).

## 검수 방법
각 프로그램마다 아래 5가지를 공식 출처로 확인합니다.
1. **명칭·소관기관** 이 바뀌지 않았는가
2. **한도·금액**(`amountMax`, `terms`) 이 최신 공고와 맞는가
3. **신청 URL**(`applyUrl`) 이 살아 있고 올바른가
4. **핵심 요건**(대상·업력·연령 등) 변동이 없는가
5. **신청기간·예산 소진** 여부 (상시/기간제)

문제가 있으면 `app.html` 의 해당 항목을 고치고, 하단 `DATA_VERIFIED_AT` 을 검수일로 갱신합니다.
중대한 불일치가 확인되면 정정 전까지 `DATA_STATUS='draft'` 로 되돌립니다.

## 통합 공고 (먼저 훑기)
- 기업마당 https://www.bizinfo.go.kr · 중소벤처24 https://www.smes.go.kr
- 소상공인 정책자금 통합공고 https://ols.sbiz.or.kr · 소상공인24 https://sbiz24.kr

## 프로그램별 공식 출처
| id | 명칭 | 소관 | 공식 출처 |
|---|---|---|---|
| sbiz-ilban | 일반경영안정자금 | 소진공 | https://ols.sbiz.or.kr |
| sbiz-start | 창업기반지원자금 | 소진공 | https://ols.sbiz.or.kr |
| kosmes-youth | 청년전용창업자금 | 중진공 | https://www.kosmes.or.kr |
| sgi-guarantee | 소상공인 신용보증 | 지역신용보증재단 | https://www.koreg.or.kr |
| smart-store | 스마트상점 기술보급 | 소진공 | https://www.sbiz.or.kr |
| online | 온라인 판로지원 | 소진공 | https://fanfandaero.kr |
| durunuri | 두루누리 사회보험료 | 근로복지공단 | https://insurancesupport.or.kr |
| flex-work | 유연근무 장려금 | 고용노동부 | https://www.work24.go.kr |
| youth-jump | 청년일자리도약장려금 | 고용노동부 | https://www.work24.go.kr |
| noran | 노란우산 희망장려금 | 중기중앙회·지자체 | https://www.8899.or.kr |
| hope-cleanup | 희망리턴 점포철거비 | 소진공 | https://sbiz24.kr |
| hope-restart | 희망리턴 재도전 지원 | 소진공 | https://hope.sbiz.or.kr |
| fresh-start | 새출발기금 채무조정 | 캠코 | https://www.newstartfund.or.kr |
| noran-close | 노란우산 폐업공제금 | 중기중앙회 | https://www.8899.or.kr |

## 검수 로그
| 검수일 | 검수자 | 변경 내용 |
|---|---|---|
| 2026-07-22 | 초기 검수 | 새출발기금·철거비·온라인판로 신청처/문구 최신화, draft→verified |
