// 가입·외부키 없는 봇 차단 — 작업증명(Proof-of-Work) + HMAC 세션 티켓.
// 서버가 서명한 퍼즐(challenge)을 브라우저가 풀어(nonce 탐색) 제출해야 비싼 호출이 통과된다.
// 서명키는 기존 OPENAI_API_KEY에서 '파생'만 하며(원본은 노출/전송 안 함), 새 환경변수가 필요 없다.
// 봇이 대량 요청하려면 매번 CPU 계산을 해야 하므로 폭주 비용이 커진다(사람은 1회 ~0.1초, 무감).
// 끄고 싶으면 환경변수 BOTCHECK_DISABLED=1.
import crypto from 'node:crypto';

const DIFFICULTY = 16;          // 요구 선행 0 비트 수(평균 ~2^16 해시). 사람 체감 ≈ 0.1~0.3초.
const CHALLENGE_TTL = 120000;   // 퍼즐 유효시간 2분

export function botcheckEnabled() { return process.env.BOTCHECK_DISABLED !== '1'; }

function hmacKey() {
  // 기존 서버 시크릿에서 파생(원본 키는 절대 노출되지 않음). 새 키 불필요.
  const base = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || 'botcheck-fallback';
  return crypto.createHash('sha256').update('botcheck.v1|' + base).digest();
}
function hmac(msg) { return crypto.createHmac('sha256', hmacKey()).update(msg).digest('base64url'); }

// 선행 0 비트 수
function leadingZeroBits(buf) {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24; // 8비트 안에서의 선행 0
    break;
  }
  return bits;
}

// ── 퍼즐 발급 ──
export function issueChallenge() {
  const c = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + CHALLENGE_TTL;
  const d = DIFFICULTY;
  return { c, exp, d, sig: hmac(c + '.' + exp + '.' + d) };
}

// ── 제출 검증 ── payload = "c.exp.d.sig.nonce"
const usedChallenges = new Map(); // c -> exp (재사용 방지, best-effort)
export function verifyPow(payload) {
  if (!botcheckEnabled()) return true;
  const parts = String(payload || '').split('.');
  if (parts.length !== 5) return false;
  const [c, exp, d, sig, nonce] = parts;
  const now = Date.now();
  if (!(Number(exp) > now)) return false;
  // 서명 확인(위조 방지)
  const good = hmac(c + '.' + exp + '.' + d);
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false; }
  catch (e) { return false; }
  // 난이도 확인
  const h = crypto.createHash('sha256').update(c + ':' + nonce).digest();
  if (leadingZeroBits(h) < Number(d)) return false;
  // 재사용 방지(같은 퍼즐로 여러 번 통과 못 하게) + 가벼운 청소
  if (usedChallenges.has(c)) return false;
  usedChallenges.set(c, Number(exp));
  if (usedChallenges.size > 5000) { for (const [k, v] of usedChallenges) if (v < now) usedChallenges.delete(k); }
  return true;
}

// ── 세션 티켓(HMAC) — PoW 1회 통과 후, 호출이 여러 번인 흐름(피칭)에서 재사용 ──
export function issueTicket(scope, ttlMs) {
  const exp = Date.now() + (ttlMs || 30 * 60 * 1000);
  const p = scope + '.' + exp;
  return p + '.' + hmac(p);
}
export function verifyTicket(ticket, scope) {
  if (!botcheckEnabled()) return true;
  const parts = String(ticket || '').split('.');
  if (parts.length !== 3) return false;
  const [sc, exp, sig] = parts;
  if (sc !== scope || !(Number(exp) > Date.now())) return false;
  const good = hmac(sc + '.' + exp);
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)); }
  catch (e) { return false; }
}
