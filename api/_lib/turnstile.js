// Cloudflare Turnstile — 보이지 않는 봇 차단(자동화 공격만 걸러냄, 사람은 무감).
// 설정(TURNSTILE_SECRET) 없으면 전 기능이 조용히 '통과'(off) → 키를 넣는 순간 자동으로 켜진다.
// 피칭처럼 호출이 여러 번인 흐름은 Turnstile 1회 검증 후 짧은 수명의 HMAC '티켓'을 재사용한다.
import crypto from 'node:crypto';

const SECRET = process.env.TURNSTILE_SECRET || '';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled() { return !!SECRET; }

// Turnstile 토큰 1개 검증(단발). 미설정 시 true(통과), 토큰 없으면 false.
export async function verifyTurnstile(token, ip) {
  if (!SECRET) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: SECRET, response: String(token) });
    if (ip) body.append('remoteip', ip);
    const r = await fetch(SITEVERIFY, { method: 'POST', body });
    const d = await r.json();
    return !!(d && d.success);
  } catch (e) {
    console.error('[turnstile verify]', String(e && e.message));
    return false;
  }
}

// ── 세션 티켓(HMAC 서명) — Turnstile 1회 통과 뒤 세션 동안 재사용 ──
export function issueTicket(scope, ttlMs) {
  const exp = Date.now() + (ttlMs || 30 * 60 * 1000);
  const p = scope + '.' + exp;
  const sig = crypto.createHmac('sha256', SECRET || 'disabled').update(p).digest('base64url');
  return p + '.' + sig;
}

export function verifyTicket(ticket, scope) {
  if (!SECRET) return true; // 기능 off면 티켓 요구 안 함
  if (!ticket) return false;
  const parts = String(ticket).split('.');
  if (parts.length !== 3) return false;
  const [sc, exp, sig] = parts;
  if (sc !== scope) return false;
  if (!(Number(exp) > Date.now())) return false;
  const good = crypto.createHmac('sha256', SECRET).update(sc + '.' + exp).digest('base64url');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)); }
  catch (e) { return false; }
}
