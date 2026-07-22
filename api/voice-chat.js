// POST /api/voice-chat  { audioB64?, mime?, history[], greet?, perspective? }
// 절약형 폴백 — STT(전사) → GPT(답변, RAG 주입) → TTS(음성). Realtime 대비 비용 약 1/10.
import { handleOptions } from './_lib/cors.js';
import { checkPw, underDailyCap } from './_lib/guards.js';
import { ragEnabled, ragSearch, RAG_NAMESPACE } from './_lib/rag.js';
import { VOICE_PROMPT, perspectiveNote, PERSPECTIVES } from './_lib/voice-consult.js';

const ECO_CHAT_MODEL = 'gpt-4o';
const ECO_TTS_VOICE = 'onyx';
const GREETING = '안녕하세요, 사장님서랍 AI 자금 상담원입니다. 어떤 일로 상담이 필요하신지 편하게 말씀해 주세요.';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: '서버에 OpenAI 키가 설정되지 않았습니다.' });
  const pw = checkPw(req);
  if (!pw.ok) return res.status(pw.status).json({ error: pw.error });
  if (!underDailyCap('voicechat')) return res.status(429).json({ error: '오늘 상담 이용량이 모두 소진되었습니다.' });

  try {
    const { audioB64, mime, history = [], greet } = req.body || {};
    const persp = PERSPECTIVES.includes(req.body && req.body.perspective) ? req.body.perspective : '';
    let userText = '';

    if (!greet) {
      if (!audioB64) return res.status(400).json({ error: '오디오가 없습니다.' });
      const buf = Buffer.from(String(audioB64), 'base64');
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: mime || 'audio/webm' }), 'speech.webm');
      fd.append('model', 'gpt-4o-mini-transcribe');
      fd.append('language', 'ko');
      fd.append('prompt', '한국어 소상공인 자금 상담 통화입니다. 정책자금, 대출, 운전자금, 폐업, 철거비, 채무조정, 회생 관련 대화이며 금액·업력·날짜 같은 숫자가 나올 수 있습니다.');
      const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: fd });
      const trData = await tr.json();
      if (!tr.ok) throw new Error('전사 실패');
      userText = (trData.text || '').trim();
      const hasKo = /[가-힣]/.test(userText), hasNum = /[0-9]/.test(userText);
      if (userText.length < 2 || (!hasKo && !hasNum)) return res.json({ userText: '', aiText: '', audioSegs: [], empty: true });
    }

    let aiText = GREETING;
    if (!greet) {
      let ragContext = '';
      if (ragEnabled()) {
        try {
          const found = (await ragSearch(userText, 3, RAG_NAMESPACE, persp)).filter((c) => c.score >= 0.35);
          if (found.length) ragContext = '\n\n[실제 상담사례 — 근거로 활용하되 원문을 그대로 읽지 말고 너의 말로 재구성]\n'
            + found.map((c, i) => `사례${i + 1}(${c.type || '자금'}): ${String(c.answer || '').slice(0, 700)}`).join('\n');
        } catch (e) { console.error('[voice-chat RAG]', e.message); }
      }
      const msgs = [
        { role: 'system', content: VOICE_PROMPT + perspectiveNote(persp) + ragContext + '\n[중요] 음성으로 읽힐 답변이다. 특수문자·목록 없이 자연스러운 구어체 2~4문장으로만 답하라.' },
        ...history.slice(-16).map((h) => ({ role: h.who === 'user' ? 'user' : 'assistant', content: String(h.text || '').slice(0, 1000) })),
        { role: 'user', content: userText },
      ];
      const cc = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ECO_CHAT_MODEL, messages: msgs, max_tokens: 300, temperature: 0.6 }),
      });
      const ccData = await cc.json();
      if (!cc.ok) throw new Error('답변 생성 실패');
      aiText = (ccData.choices && ccData.choices[0] && ccData.choices[0].message && ccData.choices[0].message.content || '').trim();
    }

    // 문장별로 쪼개 2문장씩 묶어 병렬 TTS → 첫 소리 지연 단축
    const ttsOne = async (text) => {
      const t = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: ECO_TTS_VOICE, input: text, response_format: 'mp3', instructions: '차분하고 신뢰감 있는 한국어 상담원 톤으로, 너무 빠르지 않게.' }),
      });
      if (!t.ok) throw new Error('음성 합성 실패');
      return Buffer.from(await t.arrayBuffer()).toString('base64');
    };
    const sents = (aiText.match(/[^.!?…]+[.!?…]*/g) || [aiText]).map((s) => s.trim()).filter((s) => s.length > 1);
    const groups = [];
    for (let i = 0; i < sents.length; i += 2) groups.push(sents.slice(i, i + 2).join(' '));
    const audioSegs = await Promise.all(groups.map(ttsOne));

    res.json({ userText, aiText, audioSegs, audioB64: audioSegs[0] || null });
  } catch (e) {
    console.error('voice-chat 오류:', String(e && e.message));
    res.status(502).json({ error: '음성 상담 처리에 실패했습니다.' });
  }
}
