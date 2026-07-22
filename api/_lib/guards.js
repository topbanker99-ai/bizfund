// 음성 상담 가드 — 비밀번호 게이트 + 베스트에포트 하루 상한.
// ⚠️ 주의: 아래 메모리 카운터는 Vercel 다중 인스턴스에서 완벽하지 않다(인스턴스별 초기화).
//    공개 확대 전 반드시 Upstash Redis 등 외부 저장소로 교체할 것.
//    v1의 실제 방어선은 비밀번호 게이트다.

export function getIP(req) {
  return String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
}

// 비밀번호 게이트. REALTIME_PW 미설정 시 '모두 거부'(원본의 기본값 '2026' 노출 위험 회피).
// 통과=true. 실패 시 { ok:false, status, error } 를 반환.
export function checkPw(req) {
  const expected = process.env.REALTIME_PW || '';
  if (!expected) return { ok: false, status: 503, error: '음성 상담이 아직 열리지 않았어요. (관리자: REALTIME_PW 환경변수를 설정하세요)' };
  const pw = (req.query && req.query.pw) || req.headers['x-consult-pw'] || '';
  if (pw !== expected) return { ok: false, status: 401, error: '상담 비밀번호가 올바르지 않습니다.' };
  return { ok: true };
}

// 베스트에포트 하루 상한(KST 자정 리셋). 서버리스에선 인스턴스별이라 느슨하다.
const DAILY_CAPS = { realtime: 30, voicechat: 400 };
let dailyState = { date: '', counts: {} };
export function underDailyCap(name) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (dailyState.date !== today) dailyState = { date: today, counts: {} };
  const used = dailyState.counts[name] || 0;
  if (used >= (DAILY_CAPS[name] || 100)) return false;
  dailyState.counts[name] = used + 1;
  return true;
}
