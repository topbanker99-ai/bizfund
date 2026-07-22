// GET /api/ingest-cases?pw=상담비밀번호
// data/consult-cases.json 의 상담사례를 Upstash Vector에 1회 적재한다(브라우저에서 클릭 한 번).
// ⚠️ 검색(api/_lib/rag.js)과 반드시 동일: text-embedding-3-small, dimensions 512, 네임스페이스 bizfund.
//    Upstash 인덱스는 512차원 cosine 으로 만들어야 하고, perspective 메타데이터 인덱싱을 켜야 관점 필터가 동작한다.
import fs from 'node:fs';
import { handleOptions } from './_lib/cors.js';
import { checkPw } from './_lib/guards.js';
import { UPSTASH_URL, UPSTASH_TOKEN, RAG_NAMESPACE, ragEnabled } from './_lib/rag.js';

const toText = (r) => `${r.question}\n${r.answer}`.slice(0, 2000);

async function embedBatch(key, texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts, dimensions: 512 }),
  });
  if (!r.ok) throw new Error('임베딩 실패 (' + r.status + ') ' + (await r.text()).slice(0, 200));
  return (await r.json()).data.map((d) => d.embedding);
}

async function upsert(items) {
  const r = await fetch(`${UPSTASH_URL}/upsert/${RAG_NAMESPACE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(items),
  });
  const txt = await r.text();
  if (!r.ok) {
    // 차원 불일치 등 Upstash 설정 오류를 사람이 읽을 수 있게 전달
    throw new Error('Upstash 적재 실패 (' + r.status + '). 인덱스를 512차원 cosine 으로 만들었는지 확인하세요. 응답: ' + txt.slice(0, 300));
  }
  return txt;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ ok: false, error: '서버에 OPENAI_API_KEY 가 없습니다.' });
  if (!ragEnabled()) return res.status(500).json({ ok: false, error: 'UPSTASH_VECTOR_URL / UPSTASH_VECTOR_TOKEN 이 설정되지 않았습니다.' });
  const pw = checkPw(req);
  if (!pw.ok) return res.status(pw.status).json({ ok: false, error: pw.error });

  try {
    const rows = JSON.parse(fs.readFileSync(new URL('../data/consult-cases.json', import.meta.url), 'utf-8'));
    const BATCH = 64;
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const vectors = await embedBatch(openaiKey, slice.map(toText));
      await upsert(slice.map((r, k) => ({
        id: String(r.id),
        vector: vectors[k],
        metadata: {
          type: r.type,
          question: r.question,
          answer: r.answer,
          url: r.url || '',
          perspective: r.perspective, // '운영중' | '폐업·회생'
        },
      })));
      done += slice.length;
    }
    res.status(200).json({
      ok: true,
      ingested: done,
      namespace: RAG_NAMESPACE,
      message: `상담사례 ${done}건을 '${RAG_NAMESPACE}' 네임스페이스에 적재했습니다. 이제 음성상담에서 사례 검색이 동작합니다.`,
    });
  } catch (e) {
    console.error('[/api/ingest-cases]', String(e && e.message));
    res.status(502).json({ ok: false, error: String(e && e.message) });
  }
}
