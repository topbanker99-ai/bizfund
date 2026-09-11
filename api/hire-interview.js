// POST /api/hire-interview  { audioB64, mime }
// 영상면접 답변 오디오를 텍스트로 전사한다(OpenAI Whisper). 오디오는 저장하지 않고 즉시 버린다.
// 전사된 텍스트만 클라이언트로 돌려주고, 현황판 저장은 /api/hire-board 가 담당한다.
import { handleOptions } from './_lib/cors.js';
import { sameOriginOk, rateLimit, underDailyCap } from './_lib/guards.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST만 허용됩니다.' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ ok: false, error: '서버에 OpenAI 키가 없습니다.' });
  if (!sameOriginOk(req)) return res.status(403).json({ ok: false, error: '허용되지 않은 요청입니다.' });
  if (!rateLimit('hireitv', req, 30, 60 * 1000)) return res.status(429).json({ ok: false, error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' });
  if (!underDailyCap('hireinterview')) return res.status(429).json({ ok: false, error: '오늘 면접 이용량이 모두 소진되었습니다.' });

  try {
    const { audioB64, mime } = req.body || {};
    if (!audioB64) return res.status(400).json({ ok: false, error: '오디오가 없습니다.' });
    const buf = Buffer.from(String(audioB64), 'base64');
    if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ ok: false, error: '녹음이 너무 깁니다.' });

    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mime || 'audio/webm' }), 'answer.webm');
    fd.append('model', 'gpt-4o-mini-transcribe');
    fd.append('language', 'ko');
    fd.append('prompt', '아르바이트 채용 면접 답변입니다. 근무 경험, 희망 근무 시간, 협업 경험, 고객 응대 상황에 대한 한국어 구어체 답변입니다.');

    const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: fd,
    });
    if (!tr.ok) throw new Error('transcribe ' + tr.status);
    const data = await tr.json();
    const text = String(data.text || '').trim();
    // 의미 없는 잡음은 빈 답변으로 처리
    const ok = text.length >= 2 && /[가-힣]/.test(text);
    return res.status(200).json({ ok: true, text: ok ? text : '' });
  } catch (e) {
    console.error('[/api/hire-interview]', String(e && e.message));
    return res.status(502).json({ ok: false, error: '답변을 옮겨 적지 못했습니다.' });
  }
}
