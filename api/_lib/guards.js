// 음성/영상 상담 가드 — 비밀번호 게이트 + 브루트포스 차단 + IP별 레이트리밋 + 하루 상한.
// ⚠️ 아래 카운터·버킷은 모두 인메모리라 Vercel 다중 인스턴스에서 완벽하지 않다(인스턴스별 초기화).
//    "확실한 방어선"은 (1) 비밀번호(공유 시크릿) 와 (2) OpenAI/Anthropic 대시보드의 월 사용 한도다.
//    인메모리 상한/레이트리밋은 '유출·자동화 남용에 대한 최선노력(best-effort) 완충'으로 본다.
//    공개 확대 전에는 Upstash Redis 등 외부 저장소로 교체해 인스턴스 간 공유 카운터로 만들 것.

export function getIP(req) {
  return String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim() || 'unknown';
}

// ── 무마찰 출처 검사 ──
// 다른 웹사이트가 방문자의 브라우저로 이 유료 API를 대신 호출해 요금을 태우는 것을 막는다.
// Origin 이 있고 우리 배포 호스트와 다르면 차단. Origin 이 없으면(같은 출처 GET·비브라우저) 통과.
// 실제 사용자에겐 전혀 보이지 않는다(정상 페이지는 항상 같은 출처). curl 위조는 못 막지만,
// 그 경우는 레이트리밋·일일 상한·월 한도가 상한을 정한다. true=허용.
export function sameOriginOk(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers.host || ''); }
  catch (e) { return false; }
}

// ── 비밀번호 게이트 (+ IP별 브루트포스 차단) ──
// REALTIME_PW 미설정 시 '모두 거부'(기본값 노출 위험 회피 — 안전하게 닫힘).
// 비번은 헤더(x-consult-pw) 우선, 없으면 쿼리(pw) 폴백. 헤더 사용을 권장(URL 로그 유출 방지).
const PW_WINDOW_MS = 10 * 60 * 1000; // 실패 집계 창
const PW_MAX_FAILS = 8;              // 창 내 최대 실패 → 초과 시 잠금
const pwFail = new Map();            // ip -> { n, first }
export function checkPw(req) {
  const expected = process.env.REALTIME_PW || '';
  if (!expected) return { ok: false, status: 503, error: '상담이 아직 열리지 않았어요. (관리자: REALTIME_PW 환경변수를 설정하세요)' };
  const ip = getIP(req);
  const now = Date.now();
  const f = pwFail.get(ip);
  if (f && now - f.first < PW_WINDOW_MS && f.n >= PW_MAX_FAILS) {
    return { ok: false, status: 429, error: '비밀번호 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  const pw = (req.headers && req.headers['x-consult-pw']) || (req.query && req.query.pw) || '';
  if (pw !== expected) {
    if (!f || now - f.first >= PW_WINDOW_MS) pwFail.set(ip, { n: 1, first: now });
    else f.n++;
    return { ok: false, status: 401, error: '상담 비밀번호가 올바르지 않습니다.' };
  }
  if (f) pwFail.delete(ip); // 성공 시 실패기록 초기화
  return { ok: true };
}

// ── IP별 슬라이딩 윈도우 레이트리밋 (best-effort, 인메모리) ──
// rateLimit('vi', req, 30, 60000) → 같은 IP가 60초 안에 30회 초과면 false.
const rlBuckets = new Map(); // key -> number[] (timestamps ms)
export function rateLimit(name, req, max, windowMs) {
  const key = name + '|' + getIP(req);
  const now = Date.now();
  let arr = rlBuckets.get(key);
  if (!arr) { arr = []; rlBuckets.set(key, arr); }
  while (arr.length && now - arr[0] > windowMs) arr.shift(); // 창 밖 제거
  if (arr.length >= max) return false;
  arr.push(now);
  if (rlBuckets.size > 5000) { // 메모리 폭주 방지용 가벼운 청소
    for (const [k, v] of rlBuckets) { if (!v.length || now - v[v.length - 1] > 3600000) rlBuckets.delete(k); }
  }
  return true;
}

// ── 베스트에포트 하루 상한(KST 자정 리셋) ──
// 서버리스에선 인스턴스별이라 느슨하다. 실제 상한은 대시보드 월 한도로 이중 방어할 것.
const DAILY_CAPS = { realtime: 30, voicechat: 400, videointerview: 80 };
let dailyState = { date: '', counts: {} };
export function underDailyCap(name) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (dailyState.date !== today) dailyState = { date: today, counts: {} };
  const used = dailyState.counts[name] || 0;
  if (used >= (DAILY_CAPS[name] || 100)) return false;
  dailyState.counts[name] = used + 1;
  return true;
}
