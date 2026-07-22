// 영상면접 문제 제공 — GET /api/content?name=video-interview
// 매 요청마다 6대 영역에서 각 1문항씩 랜덤으로 뽑은 세션을 반환한다.
// 질문 텍스트만 내려보내며, 평가 루브릭/정답류는 포함하지 않는다.
import { handleOptions } from '../cors.js';
import { buildSession, areaMeta } from '../content/video-interview-content.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET만 허용됩니다.' });
  }
  return res.status(200).json({
    areas: areaMeta(),
    session: buildSession(),
  });
}
