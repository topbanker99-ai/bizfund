# HANDOFF — 사장님서랍 (bizfund)

이 문서는 웹 채팅에서 진행하던 작업을 Claude Code로 넘기기 위한 인계 문서입니다.
저장소 루트에 두고, Claude Code 첫 대화에서 "HANDOFF.md 읽고 시작해줘"라고 하면 됩니다.

---

## 1. 지금 상태

- 저장소: `topbanker99-ai/bizfund` (public)
- 배포: GitHub Pages, `main` 브랜치 root. https://topbanker99-ai.github.io/bizfund/
- 전부 정적 파일. 서버 없음. 빌드 과정 없음. 파일을 그대로 올리면 그게 배포본입니다.
- 서비스명: 사장님서랍
- 도메인: 미확보 (sajangnim.kr 등 검토 중)

### 파일 구성

| 파일 | 내용 | 상태 |
|---|---|---|
| `index.html` | 홈(현황판·공지 배너 캐러셀) + 정책자금 진단 12문항 + 자금 목록 14건 + 금리 비교 + 사장님 도구 + 회생·파산 간이진단 + 순발력 게임 | 동작 |
| `contract.html` | 표준근로계약서 생성기. 10업종 6고용형태 44조항, 법령 자동 점검, 라이브러리 없이 DOCX 직접 생성 | 동작 |
| `hire.html` | 알바 직무체험 테스트. 과제 9종, 업종 세트 4개, 결과 PNG/PDF 저장 | 동작 |
| `check.html` | 사장님 성향 자가진단 48문항 7차원 | 동작 |
| `banners.json` | 홈 배너 데이터. `pinned` 수기 3건 + `feed` 자동수집 | pinned만 표시 중 |
| `scripts/fetch-banners.mjs` | 기업마당 API 수집 스크립트 | **문제 있음. 아래 참조** |
| `.github/workflows/update-banners.yml` | 매일 06:00 KST 실행 + 수동 + 스크립트/워크플로 푸시 시 실행 | 동작 |
| `programs-data.js` / `match-engine.js` | 정책자금 데이터·매칭 엔진 | 동작 |
| `clause-library.json` | 계약서 조항 원본 보관용 (실제 동작은 contract.html 내부 임베드본) | 참고용 |
| `yeokgeom.js` / `yeokgeom.css` | 순발력 게임 엔진. `#yg-app`에 완전히 스코프됨 | 동작 |
| `server.js` / `package.json` | 정적 서빙 골격. 현재 배포에 미사용 | 미사용 |

---

## 2. 지금 막혀 있는 것 — 최우선

### 기업마당 API가 `reqErr`를 반환

GitHub Actions 로그 원문:

```
호출: https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=***&dataType=json&hashtags=소상공인&pageUnit=100
응답 코드: 200
수집: 0 건
받은 데이터가 없어 기존 feed 를 유지합니다. 응답 키: reqErr
```

확인된 사실:
- 인증키는 정상 발급·등록됨 (Secrets `BIZINFO_KEY`, 로그에 `crtfcKey=***`로 마스킹되어 찍힘 = 값이 읽힘)
- HTTP 200이지만 본문이 `{ reqErr: ... }` 형태의 오류 객체
- `reqErr` 내용은 아직 확인 못 함 (당시 스크립트가 키 이름만 출력했음)

의심 지점:
1. `pageUnit=100` — 이 파라미터가 실제로 존재하는지 미확인. 정부 API는 모르는 파라미터에 요청 전체를 거부하는 경우가 있음
2. `hashtags` 한글 인코딩
3. 인증키 승인 대기 상태 가능성

**Claude Code에서 할 일:**
로컬에서 실제 키로 직접 호출해 `reqErr` 내용을 눈으로 확인하세요. 웹 채팅 환경은
bizinfo.go.kr 접근이 차단돼 있어 이걸 못 했습니다. 로컬은 됩니다.

```bash
export BIZINFO_KEY='발급받은키'
curl -s "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=$BIZINFO_KEY" | head -c 800
curl -s "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=$BIZINFO_KEY&dataType=json" | head -c 800
```

최소 호출부터 시작해 파라미터를 하나씩 늘려가며 어디서 깨지는지 찾고,
성공하는 조합을 확인한 뒤 `scripts/fetch-banners.mjs`를 그 조합으로 고정하세요.
응답의 실제 필드명(`pblancNm`, `reqstEndDe` 등)도 함께 확인해 `toBanner()` 매핑을 맞추면 됩니다.

참고: 공식 문서는 https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi

### banners.json 계약

화면(`index.html`)이 읽는 형식입니다. 이 구조는 유지해야 합니다.

```json
{
  "updated": "2026-07-21",
  "source": "manual | bizinfo",
  "pinned": [ { "tag":"제도 변경", "tagType":"news|urgent|", "title":"...", "sub":"...", "url":"...", "until":"YYYY-MM-DD" } ],
  "feed":   [ /* 위와 동일 구조, 자동 생성 */ ]
}
```

- 화면은 `pinned` + `feed`를 합쳐 `until >= 오늘` 인 것만 최대 5개 표시
- `url`이 `#` 로 시작하면 내부 탭 이동, `http`면 새 창
- **시간대 주의:** 액션은 UTC 21:00(=KST 익일 06:00)에 돕니다. `until`에 UTC 날짜를
  넣으면 한국 사용자에겐 이미 지난 날짜가 되어 배너가 즉시 숨겨집니다. 현재는 공고
  마감일을 `until`로 쓰고, 마감일을 못 읽으면 KST 기준 +14일을 넣습니다.

---

## 3. 다음 작업 (우선순위)

### 1순위 — Vercel 이전
아래 두 기능이 API 키를 서버에 둬야 해서 정적 호스팅으로는 불가능합니다.
지금 방문자가 거의 없어 주소가 바뀌어도 잃을 게 없으므로 옮기기 좋은 시점입니다.

- **영상면접**: 핸드오프 자료 `02-영상면접/`. OpenAI Whisper(음성인식) + Claude(평가).
  프롬프트 3종(.md)을 자금진단 맥락으로 재작성 필요. 평가영역 교체안:
  사업모델 / 자금계획 / 상환능력 / 신용관리 / 시장이해 / 고객대응 / 리스크관리
- **AI 음성상담**: 노무법인 종로에 적용한 방식(OpenAI Realtime WebRTC + Upstash Vector RAG) 이식.
  RAG 네임스페이스를 노무 → 자금·회생용으로 재적재 필요

이전 시 주의:
- 정적 파일은 그대로 옮기면 됩니다. 재작성 불필요
- 배너는 이전 후에도 요청마다 API 호출로 바꾸지 마세요. 개발계정 하루 1,000건 한도라
  방문자당 호출하면 금방 소진됩니다. JSON 파일 유지 또는 캐시된 라우트로
- 환경변수: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `BIZINFO_KEY`, Upstash 관련 키

### 2순위 — 정책자금 데이터 검수
`index.html`의 `DATA_STATUS = 'draft'`. 각 자금의 금액·요건을 공고 원문과 대조하고
`verifiedAt` 기입 후 `'verified'`로 바꾸면 상단 노란 경고 배너가 사라집니다.

### 3순위 — 그 외
- `contract.html`의 `REVIEWER = null` — 김경동 노무사 감수 완료 시 이름·날짜 기입하면 배지 표시
- `banners.json`의 `pinned` — 최저임금·제도 변경은 매년 수기 갱신
- 도메인 확보 (Vercel 이전 전에 잡으면 주소 변경 없음)
- Actions 경고: `actions/checkout@v4`, `actions/setup-node@v4`가 구버전 런타임 대상.
  동작에 지장 없으나 정리하려면 v5로 올리면 됩니다

---

## 4. 작업 규칙

### 글쓰기
- 마크다운 볼드(`**`) 사용 금지. 강조는 문장 구조와 문단 배치로
- "두 개의 축이다", "세 가지 관점에서" 같은 도식적·번역투 표현 금지.
  "이 두 가지가 특히 중요하다"처럼 사람이 말하듯
- 사용자 대상 문구는 소상공인이 읽는다는 전제로. 전문용어 최소화

### 코드
- 외부 라이브러리 의존 최소화. 지금 전 페이지가 CDN 없이 단독 동작합니다
- 브라우저 저장소(localStorage 등) 사용 안 함. 개인정보를 남기지 않는 게 설계 전제
- 한글 줄바꿈: `word-break: keep-all` 전역 적용됨. 새 CSS 작성 시 유지
- 조사 처리: 받침 유무에 따라 과/와, 은/는 분기 (`check.html`의 `jong()`, `jo()` 참고)

### 콘텐츠 원칙
- 채용 도구(`hire.html`)는 등급·합불을 매기지 않습니다. 항목별 사실과 한 줄 해석만.
  "이 결과만으로 채용을 결정하지 마세요" 경고 상시 표시. 이 방침 유지
- 자가진단(`check.html`)도 마찬가지로 좋고 나쁨을 부여하지 않습니다
- 순발력 게임은 사장님 심심풀이용. 자금관리 능력이나 대출 심사와 무관함을 명시해 뒀습니다

### 금지
- "온더탑스튜디오" 키워드는 어떤 콘텐츠에도 노출 금지

---

## 5. 시작하기

```bash
gh repo clone topbanker99-ai/bizfund
cd bizfund
claude
```

첫 지시 예시:

> HANDOFF.md 읽고, 2번 항목의 기업마당 API `reqErr` 문제부터 해결해줘.
> 로컬에서 실제 키로 호출해서 오류 내용 확인하고 스크립트 고쳐줘.

로컬 확인은 정적 서버를 띄우세요. `file://`로 열면 `banners.json`을 fetch로 못 읽어
배너가 안 뜹니다.

```bash
npx serve .
```
