// GET /api/realtime-token?pw=...&model=mini|&perspective=운영중|폐업·회생
// OpenAI Realtime ephemeral client secret(ek_...) 발급. 세션 지침·도구를 서버가 박아 넣는다.
import { handleOptions } from './_lib/cors.js';
import { sameOriginOk, underDailyCap, rateLimit, getIP } from './_lib/guards.js';
import { turnstileEnabled, verifyTurnstile } from './_lib/turnstile.js';
import { buildInstructions, TOOLS, PERSPECTIVES } from './_lib/voice-consult.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용됩니다.' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: '서버에 OpenAI 키가 설정되지 않았습니다.' });

  // 무마찰 방어(비밀번호 없음): 타 사이트 도용 차단 + 봇 차단 + IP 분당 제한 + 일일 상한.
  if (!sameOriginOk(req)) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
  // 보이지 않는 봇 차단(설정 시에만). 실시간 세션은 가장 비싸므로 연결 직전 사람 확인.
  if (turnstileEnabled()) {
    const ts = req.headers['cf-turnstile-token'] || (req.query && req.query.ts) || '';
    if (!(await verifyTurnstile(ts, getIP(req)))) return res.status(403).json({ error: '사람 확인에 실패했어요. 새로고침 후 다시 시도해주세요.' });
  }
  // 토큰 1개당 실시간 세션 1개(가장 비쌈) → 같은 IP의 대량 발급을 분당 제한으로 막는다.
  if (!rateLimit('rt-mint', req, 4, 10 * 60 * 1000)) return res.status(429).json({ error: '연결 시도가 너무 잦습니다. 잠시 후 다시 시도해주세요.' });
  if (!underDailyCap('realtime')) return res.status(429).json({ error: '오늘 음성 상담 이용량이 모두 소진되었습니다. 잠시 후 다시 시도해주세요.' });

  const rtModel = req.query.model === 'mini' ? 'gpt-realtime-mini' : 'gpt-realtime';
  const persp = PERSPECTIVES.includes(req.query.perspective) ? req.query.perspective : '';

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
        'OpenAI-Safety-Identifier': getIP(req) || 'web-visitor',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: rtModel,
          output_modalities: ['audio'],
          audio: {
            // ⚠️ VAD/노이즈 값은 소음 오작동을 잡느라 튜닝된 값이니 그대로 유지
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              turn_detection: { type: 'server_vad', threshold: 0.85, prefix_padding_ms: 300, silence_duration_ms: 900, create_response: true, interrupt_response: false },
              noise_reduction: { type: 'near_field' },
              transcription: { model: 'gpt-4o-mini-transcribe', language: 'ko' },
            },
            output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'cedar', speed: 0.9 },
          },
          instructions: buildInstructions(persp),
          tools: TOOLS,
          tool_choice: 'auto',
        },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      // OpenAI 원문 오류를 그대로 노출하지 않는다(내부정보 차단). 서버 로그로만 남긴다.
      console.error('realtime client_secret 발급 실패:', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: '음성 연결 준비에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
    res.json(data); // 클라이언트는 data.value 사용
  } catch (e) {
    console.error('realtime-token 오류:', String(e && e.message));
    res.status(502).json({ error: '토큰 발급에 실패했습니다.' });
  }
}
