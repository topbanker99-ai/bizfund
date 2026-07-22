// POST /api/rag-search  { query, perspective? }
// 실시간 음성상담의 search_cases 도구가 부르는 사례 검색. 오류가 나도 500을 던지지 않고
// 항상 200 + 안내 문구를 돌려준다(AI가 도구 실패로 멈추지 않게 하는 설계 — 유지할 것).
import { handleOptions } from './_lib/cors.js';
import { ragEnabled, ragSearch, RAG_NAMESPACE } from './_lib/rag.js';
import { PERSPECTIVES } from './_lib/voice-consult.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });
  try {
    if (!ragEnabled()) return res.json({ result: '사례 데이터베이스가 아직 준비되지 않았습니다. 일반 기준으로 안내하고 전문가 상담을 권하세요.' });
    const q = String((req.body && req.body.query) || '').trim().slice(0, 500);
    if (!q) return res.json({ result: '검색어가 없습니다.' });
    const persp = PERSPECTIVES.includes(req.body && req.body.perspective) ? req.body.perspective : '';
    const found = (await ragSearch(q, 3, RAG_NAMESPACE, persp)).filter((c) => c.score >= 0.35);
    if (!found.length) return res.json({ result: '유사한 상담사례를 찾지 못했습니다. 일반 기준으로 안내하고 전문가 상담을 권하세요.' });
    const result = found.map((c, i) => `사례${i + 1}(${c.type || '자금'}): ${String(c.answer || '').slice(0, 600)}`).join('\n');
    res.json({ result });
  } catch (e) {
    console.error('[/api/rag-search]', String(e && e.message));
    res.json({ result: '검색 중 오류가 발생했습니다. 일반 기준으로 안내하세요.' });
  }
}
