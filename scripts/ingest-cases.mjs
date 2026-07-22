// data/consult-cases.json 의 QA 페어를 Upstash Vector에 적재한다.
// 로컬에서 1회 실행:  OPENAI_API_KEY=... UPSTASH_VECTOR_URL=... UPSTASH_VECTOR_TOKEN=... node scripts/ingest-cases.mjs
// ⚠️ 검색(api/_lib/rag.js)과 반드시 동일: text-embedding-3-small, dimensions 512, 네임스페이스 bizfund.
//    Upstash 콘솔에서 perspective 메타데이터 인덱싱을 켜야 관점 필터가 동작한다.
import fs from 'node:fs';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_VECTOR_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_VECTOR_TOKEN;
const NAMESPACE = process.env.RAG_NAMESPACE || 'bizfund';

if (!OPENAI_KEY || !UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('환경변수 필요: OPENAI_API_KEY, UPSTASH_VECTOR_URL, UPSTASH_VECTOR_TOKEN');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(new URL('../data/consult-cases.json', import.meta.url), 'utf-8'));
const toText = (r) => `${r.question}\n${r.answer}`.slice(0, 2000);

async function embedBatch(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts, dimensions: 512 }),
  });
  if (!r.ok) throw new Error('embed ' + r.status + ' ' + (await r.text()));
  return (await r.json()).data.map((d) => d.embedding);
}

async function upsert(items) {
  const r = await fetch(`${UPSTASH_URL}/upsert/${NAMESPACE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(items),
  });
  if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()));
}

const BATCH = 64;
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  const vectors = await embedBatch(slice.map(toText));
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
  console.log(`적재 ${i + slice.length} / ${rows.length}`);
  await new Promise((s) => setTimeout(s, 300));
}
console.log(`완료 — 네임스페이스 '${NAMESPACE}' 에 ${rows.length}건 적재`);
