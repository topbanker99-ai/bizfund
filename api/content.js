// GET /api/content?name=video-interview
// 자금 피칭 진단 세션(6대 영역 각 1문항 + 상황질문 2)을 반환한다.
// 질문 텍스트만 내려보내며, 평가 루브릭/정답류는 포함하지 않는다.
import { handleOptions } from './_lib/cors.js';
import videoInterviewContent from './_lib/handlers/video-interview-content.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const name = String((req.query && req.query.name) || '');
  if (name === 'video-interview') return videoInterviewContent(req, res);
  return res.status(404).json({ error: '알 수 없는 콘텐츠입니다.' });
}
