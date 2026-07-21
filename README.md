# 사장님서랍 (bizfund)

소상공인·사업주를 위한 무료 도구 모음. 정책자금 진단부터 계약서·채용·폐업 정리까지.
전부 서버 없이 브라우저 안에서 동작하며, GitHub Pages(main / root)로 배포합니다.

배포 주소: https://topbanker99-ai.github.io/bizfund/

## 페이지

| 파일 | 내용 |
|---|---|
| `index.html` | 홈(현황판·공지 배너) + 정책자금 진단 12문항 + 자금 목록 + 금리 비교 + 사장님 도구 + 회생·파산 간이진단 + 순발력 게임 |
| `contract.html` | 표준근로계약서 생성기 (10업종 · 6고용형태 · 법령 자동 점검 · 진짜 DOCX 출력) |
| `hire.html` | 알바 직무체험 테스트 (채용 참고용 · 과제 9종 · 업종 세트 4개) |
| `check.html` | 사장님 성향 자가진단 (48문항 · 7차원) |

## 데이터 파일

| 파일 | 내용 |
|---|---|
| `programs-data.js` / `match-engine.js` | 정책자금 데이터와 매칭 엔진 |
| `clause-library.json` | 근로계약서 조항 라이브러리 v0.2.0 (44조항, 원본 보관용. 실제 동작은 contract.html 내부 임베드본) |
| `banners.json` | 홈 상단 공지 배너 데이터 |
| `yeokgeom.js` / `yeokgeom.css` | 순발력 게임 엔진 (`#yg-app`에 완전히 스코프됨) |

## 공지 배너

`banners.json`의 `pinned`(수기 관리)와 `feed`(자동 수집)를 합쳐 최대 5개를 6초마다 순환합니다.

- `scripts/fetch-banners.mjs` — 기업마당 API에서 지원사업 공고 수집
- `.github/workflows/update-banners.yml` — 매일 06:00 KST 실행 후 `banners.json` 커밋

브라우저에서 공공데이터 API를 직접 호출하지 않는 이유는 두 가지입니다. 인증키가 HTML 소스에
노출되고, 기업마당·공공데이터포털이 CORS 헤더를 주지 않아 호출 자체가 막힙니다. 개발계정은
하루 1,000건 제한이라 방문자마다 호출하면 금방 소진되기도 합니다. 그래서 액션이 하루 한 번
서버에서 받아 JSON으로 커밋하고, 화면은 그 파일만 읽습니다.

인증키가 없어도 `pinned` 배너만으로 정상 동작합니다.
키를 넣으려면 Settings → Secrets and variables → Actions 에서 `BIZINFO_KEY` 를 추가하세요.

## 데이터 정책 (3단 티어)

- 티어1: 수기 검수 데이터만 진단에 투입 (`tier === 1` 필터)
- 티어2: LLM 요건 추출 후보 → 관리자 검수 후 티어1 승격
- 티어3: 기업마당 API 원본 수집분
- `DATA_STATUS = 'draft'` 동안 상단에 검수 전 배너 표시. 공고 원문 대조 후 `verifiedAt` 기입하고
  `'verified'` 로 변경합니다.

## 검수 대기 항목

- `index.html` 의 `DATA_STATUS` — 각 정책자금 금액·요건을 공고 원문과 대조 후 `'verified'` 로 변경
- `contract.html` 의 `REVIEWER` — 공인노무사 감수 완료 시 이름·날짜를 넣으면 상단 배지 표시
- `banners.json` 의 `pinned` — 최저임금·제도 변경 내용은 매년 갱신 필요

## 로컬에서 보기

파일을 더블클릭해도 대부분 동작하지만, `banners.json` 을 `fetch` 로 읽기 때문에 배너는
`file://` 에서 뜨지 않습니다. 배너까지 확인하려면 정적 서버를 띄우세요.

```
npx serve .
```

`server.js` 는 정적 서빙과 기업마당 API 동기화 골격입니다. 현재 배포에는 쓰지 않습니다.

## 나중에 서버가 필요해지는 것

영상면접(Whisper + Claude)과 AI 음성상담(Realtime + RAG)은 API 키가 서버에 있어야 해서
Vercel 같은 호스팅이 필요합니다. 그 전까지는 GitHub Pages 로 충분합니다.
