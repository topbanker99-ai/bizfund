// GET /api/turnstile — 공개 설정 반환(사이트 키는 공개값). 클라이언트가 이걸 보고 위젯을 켠다.
// 시크릿은 절대 내려보내지 않는다. 미설정이면 enabled:false → 클라이언트는 Turnstile 없이 진행.
import { handleOptions } from './_lib/cors.js';

export default function handler(req, res) {
  if (handleOptions(req, res)) return;
  const siteKey = process.env.TURNSTILE_SITE_KEY || '';
  res.json({ enabled: !!(process.env.TURNSTILE_SECRET && siteKey), siteKey });
}
