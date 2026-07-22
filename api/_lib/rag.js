// RAG 검색 — 질문 임베딩(text-embedding-3-small, 512차원) → Upstash Vector 유사도 검색.
// ⚠️ 적재(ingest)와 반드시 동일: 모델 text-embedding-3-small, dimensions 512.
// Upstash 미설정 시 이 기능만 조용히 꺼진다(호출부에서 안내 문구 반환).

export const UPSTASH_URL = process.env.UPSTASH_VECTOR_URL;
export const UPSTASH_TOKEN = process.env.UPSTASH_VECTOR_TOKEN;
export const RAG_NAMESPACE = process.env.RAG_NAMESPACE || 'bizfund';

export function ragEnabled() {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

export async function ragSearch(question, topK = 3, namespace = RAG_NAMESPACE, perspective = '') {
  const openaiKey = process.env.OPENAI_API_KEY;
  // 1) 질문 임베딩 (적재 때와 동일 설정)
  const er = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: String(question).slice(0, 2000), dimensions: 512 }),
  });
  if (!er.ok) throw new Error('embed ' + er.status);
  const vector = (await er.json()).data[0].embedding;
  // 2) Upstash 유사도 검색 (관점 필터는 메타데이터 인덱싱이 켜져 있어야 동작)
  const body = { vector, topK, includeMetadata: true };
  if (perspective) body.filter = `perspective = '${perspective}'`;
  const qr = await fetch(`${UPSTASH_URL}/query/${namespace}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!qr.ok) throw new Error('vector ' + qr.status);
  const j = await qr.json();
  return (j.result || []).map((m) => ({ score: m.score, ...m.metadata }));
}
