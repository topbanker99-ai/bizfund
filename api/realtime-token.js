// GET /api/realtime-token?pw=...&model=mini|&perspective=운영중|폐업·회생
// OpenAI Realtime ephemeral client secret(ek_...) 발급. 세션 지침·도구를 서버가 박아 넣는다.
import { handleOptions } from './_lib/cors.js';
import { checkPw, underDailyCap, getIP } from './_lib/guards.js';
import { buildInstructions, TOOLS, PERSPECTIVES } from './_lib/voice-consult.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용됩니다.' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: '서버에 OpenAI 키가 설정되지 않았습니다.' });

  const pw = checkPw(req);
  if (!pw.ok) return res.status(pw.status).json({ error: pw.error });
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
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data); // 클라이언트는 data.value 사용
  } catch (e) {
    console.error('realtime-token 오류:', String(e && e.message));
    res.status(502).json({ error: '토큰 발급에 실패했습니다.' });
  }
}
