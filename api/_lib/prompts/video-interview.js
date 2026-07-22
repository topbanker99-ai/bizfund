import { fillTemplate, readPrompt } from './_loader.js';
import { SITUATION_RUBRIC } from '../content/video-interview-content.js';

const AREA_IDS = ['bizmodel', 'finplan', 'repay', 'credit', 'market', 'customer', 'situation'];
const SIT_IDS = Object.keys(SITUATION_RUBRIC);

// 프론트가 보낸 답변 배열을 검증/정리한다.
// answers: [{ areaId, areaName, question, transcript, sitId? }]
export function normalizeAnswers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.slice(0, 12).map((a) => {
    const areaId = AREA_IDS.includes(String(a && a.areaId)) ? String(a.areaId) : 'bizmodel';
    const sitId = SIT_IDS.includes(String(a && a.sitId)) ? String(a.sitId) : '';
    return {
      areaId,
      sitId,
      areaName: String((a && a.areaName) || '').slice(0, 40),
      question: String((a && a.question) || '').slice(0, 300),
      transcript: String((a && a.transcript) || '').replace(/\s+/g, ' ').trim().slice(0, 2000),
    };
  });
}

// 내용 평가(Claude) 프롬프트 조립
export function buildContentEvalPrompt(answers) {
  if (!answers.length) {
    const err = new Error('answers 값이 필요합니다.');
    err.status = 400;
    throw err;
  }
  const answersText = answers.map((a, i) => {
    const body = a.transcript ? a.transcript : '(무응답)';
    if (a.areaId === 'situation' && a.sitId && SITUATION_RUBRIC[a.sitId]) {
      const r = SITUATION_RUBRIC[a.sitId];
      return `[문항 ${i + 1}] [상황질문] (area id: situation)\n질문: ${a.question}\n답변: ${body}\n[정답 기준] ${r.criteria}\n[정답 시 코멘트] ${r.passComment}\n[미흡 시 코멘트] ${r.failComment}`;
    }
    return `[문항 ${i + 1}] 영역: ${a.areaName || a.areaId} (area id: ${a.areaId})\n질문: ${a.question}\n답변: ${body}`;
  }).join('\n\n');

  return {
    system: readPrompt('video-interview.content.system'),
    messages: [{
      role: 'user',
      content: fillTemplate(readPrompt('video-interview.content.user'), { answersText }),
    }],
    max_tokens: 3200, // 8문항 코멘트+무응답 안내 문구까지 잘리지 않도록 여유 확보 (2000에서 상향)
  };
}

// 태도 평가(vision) system 텍스트
export function attitudeSystemText() {
  return readPrompt('video-interview.attitude.system');
}
