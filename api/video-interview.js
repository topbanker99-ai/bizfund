// ════════════════════════════════════════════════════════════
//  탑뱅커AI — 영상면접 백엔드 (Vercel)
//  POST /api/video-interview
//   - action:'transcribe' : {audio(base64), mime} → Whisper 스크립트화
//   - action:'evaluate'   : {answers:[{areaId,areaName,question,transcript}], frames:[base64 jpeg...]}
//                           → 내용 평가(Claude) + 태도 평가(vision) 합산 리포트
//  키: ANTHROPIC_API_KEY / OPENAI_API_KEY (서버 환경변수)
// ════════════════════════════════════════════════════════════
import { handleOptions } from './_lib/cors.js';
import { sameOriginOk, underDailyCap, rateLimit, getIP } from './_lib/guards.js';
import { turnstileEnabled, verifyTurnstile, issueTicket, verifyTicket } from './_lib/turnstile.js';
import { buildContentEvalPrompt, attitudeSystemText, normalizeAnswers } from './_lib/prompts/video-interview.js';

// 필요 환경변수: OPENAI_API_KEY, ANTHROPIC_API_KEY.
// [보안] 이 엔드포인트는 Whisper+Claude+비전+TTS 로 호출당 비용이 커서, 사용자에게 마찰을 주지 않는
//        무마찰 방어(타 사이트 도용 차단 + IP 레이트리밋 + 평가 일일 상한 + 월 한도)로 보호한다.
const MAX_FRAMES = 8;

// ── 견고한 JSON 추출 ──
function extractJson(text) {
  if (!text) throw new Error('빈 응답');
  let s = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('JSON 객체 없음');
  s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch (e) {}
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (e) {}
  return JSON.parse(s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1'));
}

// ── Whisper 환각(유튜브 클로징 멘트류) 제거 ──
// 무음·잡음 구간에서 Whisper가 자막 학습데이터 특유의 문구를 지어내는 문제 대응.
// 단어 단위가 아니라 "문구 전체" 패턴만 지워서 정상 답변 훼손을 막는다.
const ASR_HALLUCINATION_PATTERNS = [
  /(?:오늘도\s*)?(?:제\s*)?(?:영상|방송)을?\s*(?:봐|시청해)\s*주?셔서\s*감사(?:합니다|드립니다)[.!?]?/g,
  /시청해?\s*주셔서\s*감사(?:합니다|드립니다)[.!?]?/g,
  /구독과?\s*좋아요(?:와?\s*알림\s*설정)?(?:\s*(?:부탁드립니다|눌러주세요|잊지\s*마세요))?[.!?]?/g,
  /좋아요와?\s*구독(?:\s*(?:부탁드립니다|눌러주세요))?[.!?]?/g,
  /알림\s*설정(?:까지)?\s*(?:부탁드립니다|눌러주세요)[.!?]?/g,
  /다음\s*(?:영상|시간)(?:에서)?\s*(?:또\s*)?만나요[.!?]?/g,
  /(?:이상|지금까지)\s*[가-힣A-Za-z]{2,8}\s*(?:뉴스|였습니다)\s*[가-힣]{2,5}(?:입니다|였습니다)[.!?]?/g,
  /한글\s*자막\s*by\s*\S+/gi,
  /자막\s*제공\s*[:：]?\s*\S+/g,
];
function stripAsrHallucination(text) {
  let s = String(text || '');
  for (const re of ASR_HALLUCINATION_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// ── OpenAI Whisper 음성 인식 ──
async function transcribe(apiKey, audioB64, mime) {
  const base64 = audioB64.includes(',') ? audioB64.split(',')[1] : audioB64;
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime || 'audio/webm' }), 'answer.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'ko');
  form.append('temperature', '0');
  // 세그먼트별 no_speech_prob/avg_logprob를 받아 무음 환각 구간을 걸러낸다.
  form.append('response_format', 'verbose_json');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    const err = new Error('음성 인식에 실패했습니다.');
    err.status = 502; err.detail = detail.slice(0, 200);
    throw err;
  }
  let data;
  try { data = await r.json(); } catch (e) { return ''; } // 비JSON 응답 방어
  let text;
  const segs = Array.isArray(data.segments) ? data.segments : null;
  if (segs) {
    // 무음일 확률이 높거나 모델 확신도가 '극히' 낮은 세그먼트 = 환각 가능성 → 제외
    // (기준 보수화: 실제 발화를 잘못 걸러내지 않도록 logprob 컷을 -1.2 → -1.6으로 완화.
    //  환각 방어는 no_speech_prob + 문구 필터 + 평가 프롬프트 규칙의 3중으로 이미 충분)
    text = segs
      .filter((s) => (s.no_speech_prob == null || s.no_speech_prob < 0.5)
        && (s.avg_logprob == null || s.avg_logprob > -1.6))
      .map((s) => s.text || '')
      .join(' ');
  } else {
    text = data.text || '';
  }
  return stripAsrHallucination(text);
}

// ── OpenAI TTS 질문 음성 합성 ──
async function synthesize(apiKey, text) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let r = null;
  try {
    r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: String(text).slice(0, 500), response_format: 'mp3' }),
      signal: ctrl.signal,
    });
  } catch (e) { clearTimeout(t); return null; }
  clearTimeout(t);
  if (!r || !r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return 'data:audio/mp3;base64,' + buf.toString('base64');
}

// ── Claude 내용 평가 ──
async function evaluateContent(apiKey, answers) {
  const payload = buildContentEvalPrompt(answers);
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: Math.min(payload.max_tokens || 2000, 4000),
    system: payload.system,
    messages: payload.messages,
  });
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    let r = null;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body,
      });
    } catch (e) { last = 'network'; await new Promise((x) => setTimeout(x, 500 * (attempt + 1))); continue; }
    if (r.ok) {
      const data = await r.json();
      const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      // JSON 파싱 실패(대부분 max_tokens 초과로 잘린 응답)도 예외로 죽지 않고 재시도한다.
      try {
        return { json: extractJson(raw), raw, usage: data.usage };
      } catch (pe) {
        last = 'json-parse: ' + String(pe && pe.message).slice(0, 80)
          + ' | stop:' + String(data.stop_reason || '') + ' | tail:' + raw.slice(-120);
        await new Promise((x) => setTimeout(x, 400 * (attempt + 1)));
        continue;
      }
    }
    last = await r.text().catch(() => '');
    if (r.status < 500 && r.status !== 429) break;
    await new Promise((x) => setTimeout(x, 600 * (attempt + 1)));
  }
  const err = new Error('AI 평가 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.');
  err.status = 503; err.detail = String(last).slice(0, 300);
  throw err;
}

// ── OpenAI vision 태도 평가 ──
async function evaluateAttitude(apiKey, frames) {
  const imgs = frames.slice(0, MAX_FRAMES).map((f) => {
    const url = f.startsWith('data:') ? f : ('data:image/jpeg;base64,' + f);
    return { type: 'image_url', image_url: { url, detail: 'low' } };
  });
  const content = [{ type: 'text', text: '아래는 지원자의 영상면접 중 캡처된 웹캠 이미지들입니다. 태도를 평가해 JSON으로만 답하세요.' }, ...imgs];
  // 태도 평가는 부가 기능 — 15초 안에 못 끝나면 포기하고 내용 평가만 살린다(함수 전체 타임아웃 방지)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let r;
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 600,
        temperature: 0.3,
        messages: [
          { role: 'system', content: attitudeSystemText() },
          { role: 'user', content },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch (e) { clearTimeout(timer); return null; }
  clearTimeout(timer);
  if (!r.ok) return null; // 태도 평가는 부가 기능 — 실패해도 내용 평가는 살린다
  const data = await r.json();
  const raw = data.choices?.[0]?.message?.content || '';
  try { return extractJson(raw); } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });

  // ── 무마찰 보안 게이트 (유료 호출 보호, 비밀번호 없음) ──
  if (!sameOriginOk(req)) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
  // tts/transcribe 는 문항마다 여러 번 → 넉넉히, 하지만 자동화 폭주는 차단.
  if (!rateLimit('vi', req, 40, 60 * 1000)) return res.status(429).json({ error: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const body = req.body || {};
  const action = String(body.action || '');

  // ── 봇 차단(설정 시에만) ── Turnstile 1회 검증 → 세션 티켓 발급 → 이후 호출은 티켓 재사용.
  if (action === 'ticket') {
    if (turnstileEnabled() && !(await verifyTurnstile(body.turnstile || req.headers['cf-turnstile-token'] || '', getIP(req)))) {
      return res.status(403).json({ error: '사람 확인에 실패했어요. 새로고침 후 다시 시도해주세요.' });
    }
    return res.status(200).json({ ticket: issueTicket('vi') });
  }
  if (turnstileEnabled() && !verifyTicket(req.headers['x-vi-ticket'] || body.ticket || '', 'vi')) {
    return res.status(403).json({ error: '세션 확인이 필요합니다. 새로고침 후 다시 시도해주세요.' });
  }

  try {
    // ── 0) 질문 음성 합성(TTS) ──
    if (action === 'tts') {
      if (!openaiKey) return res.status(500).json({ error: '서버에 OpenAI 키가 설정되지 않았습니다.' });
      const text = String(body.text || '').trim();
      if (!text) return res.status(400).json({ error: 'text가 필요합니다.' });
      const audio = await synthesize(openaiKey, text);
      if (!audio) return res.status(502).json({ error: '음성 합성에 실패했습니다.' });
      return res.status(200).json({ audio });
    }

    // ── 1) 답변 음성 → 텍스트 ──
    if (action === 'transcribe') {
      if (!openaiKey) return res.status(500).json({ error: '서버에 OpenAI 키가 설정되지 않았습니다.' });
      if (!body.audio) return res.status(400).json({ error: 'audio가 필요합니다.' });
      const text = await transcribe(openaiKey, String(body.audio), body.mime);
      return res.status(200).json({ text });
    }

    // ── 2) 종합 평가 (가장 비싼 경로 — 일일 상한 적용) ──
    if (action === 'evaluate') {
      if (!underDailyCap('videointerview')) return res.status(429).json({ error: '오늘 평가 이용량이 모두 소진되었습니다. 내일 다시 시도해주세요.' });
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });

      const answers = normalizeAnswers(body.answers);
      if (!answers.length) return res.status(400).json({ error: '답변이 없습니다.' });

      const { json: content, raw, usage } = await evaluateContent(anthropicKey, answers);

      let attitude = null;
      const frames = Array.isArray(body.frames) ? body.frames.filter((f) => typeof f === 'string' && f.length > 100) : [];
      if (frames.length && openaiKey) {
        attitude = await evaluateAttitude(openaiKey, frames);
      }

      return res.status(200).json({ content, attitude, usage });
    }

    return res.status(400).json({ error: '지원하지 않는 action입니다.' });
  } catch (e) {
    const status = e.status || 500;
    // 내부 오류 원문(detail)은 클라이언트에 노출하지 않고 서버 로그로만 남긴다.
    console.error('video-interview 오류:', status, String(e && e.message), String(e && e.detail || '').slice(0, 200));
    if (status !== 500) {
      return res.status(status).json({ error: e.message || '요청을 처리할 수 없습니다.', usage: e.usage || null });
    }
    return res.status(500).json({ error: '처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
  }
}
