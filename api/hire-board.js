// 알바채용 2단계 — 지원자 현황판 저장소.
//  · POST : 지원자가 직무체험을 마치면 결과를 보드(board)에 담는다.
//  · GET  : 사장님이 보드 id로 지원자 목록을 조회한다.
// 저장소는 기존 Upstash Vector를 재사용한다(신규 키 없음). 네임스페이스만 'hireboard'로 분리.
// 개인정보 최소화: 이름·직무·결과 요약·시각만 저장. 30일 지난 항목은 조회 시 자동 삭제(lazy TTL).
// 벡터 유사도는 쓰지 않으므로 모든 항목에 동일한 더미 벡터를 넣고, board 메타데이터로만 필터링한다.
import { handleOptions } from './_lib/cors.js';
import { sameOriginOk, rateLimit } from './_lib/guards.js';
import { UPSTASH_URL, UPSTASH_TOKEN, ragEnabled } from './_lib/rag.js';

const NS = 'hireboard';
const DIM = 512;
const TTL_MS = 30 * 24 * 3600 * 1000; // 30일
const DUMMY = (() => { const v = new Array(DIM).fill(0); v[0] = 1; return v; })();

const BOARD_RE = /^[A-Za-z0-9_-]{8,48}$/;
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

async function up(pathAndNs, body) {
  const r = await fetch(`${UPSTASH_URL}/${pathAndNs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(pathAndNs + ' ' + r.status + ' ' + txt.slice(0, 160));
  try { return JSON.parse(txt); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!sameOriginOk(req)) return res.status(403).json({ ok: false, error: '허용되지 않은 출처입니다.' });
  if (!ragEnabled()) return res.status(503).json({ ok: false, error: '현황판 저장소가 아직 설정되지 않았습니다. (관리자: Upstash Vector 환경변수 확인)' });

  try {
    // ── 지원자: 결과 담기 ──
    if (req.method === 'POST') {
      if (!rateLimit('hireboard-post', req, 20, 60000)) return res.status(429).json({ ok: false, error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' });
      const b = req.body || {};
      const board = clip(b.board, 48);
      if (!BOARD_RE.test(board)) return res.status(400).json({ ok: false, error: '잘못된 보드입니다.' });
      const results = Array.isArray(b.results) ? b.results.slice(0, 12).map((r) => ({
        key: clip(r.key, 24), ok: +r.ok || 0, n: +r.n || 0, avg: +r.avg || 0,
      })) : [];
      // 영상면접 답변(질문/전사 텍스트). 오디오는 저장하지 않는다.
      const answers = Array.isArray(b.answers) ? b.answers.slice(0, 10).map((a) => ({
        q: clip(a.q, 120), a: clip(a.a, 600),
      })) : [];
      const kind = b.kind === 'interview' ? 'interview' : 'game';
      const ts = Date.now();
      const id = `${board}.${ts}.${Math.random().toString(36).slice(2, 8)}`;
      await up(`upsert/${NS}`, {
        id,
        vector: DUMMY,
        metadata: {
          board,
          kind,
          who: clip(b.who, 20),
          set: clip(b.set, 24),
          company: clip(b.company, 30),
          results: JSON.stringify(results),
          answers: JSON.stringify(answers),
          ts,
        },
      });
      return res.status(200).json({ ok: true });
    }

    // ── 사장님: 보드 조회 ──
    if (req.method === 'GET') {
      if (!rateLimit('hireboard-get', req, 60, 60000)) return res.status(429).json({ ok: false, error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' });
      const board = clip(req.query && req.query.board, 48);
      if (!BOARD_RE.test(board)) return res.status(400).json({ ok: false, error: '잘못된 보드입니다.' });
      const q = await up(`query/${NS}`, {
        vector: DUMMY, topK: 200, includeMetadata: true, filter: `board = '${board}'`,
      });
      const rows = q.result || [];
      const now = Date.now();
      const stale = [];
      const applicants = [];
      for (const m of rows) {
        const md = m.metadata || {};
        if (now - (md.ts || 0) > TTL_MS) { stale.push(m.id); continue; }
        let results = [], answers = [];
        try { results = JSON.parse(md.results || '[]'); } catch (e) {}
        try { answers = JSON.parse(md.answers || '[]'); } catch (e) {}
        applicants.push({
          who: md.who || '', set: md.set || '', company: md.company || '',
          kind: md.kind || 'game', ts: md.ts || 0, results, answers,
        });
      }
      // 만료 항목 지우기(best-effort)
      if (stale.length) { up(`delete/${NS}`, { ids: stale }).catch(() => {}); }
      applicants.sort((a, b) => b.ts - a.ts);
      return res.status(200).json({ ok: true, count: applicants.length, applicants });
    }

    return res.status(405).json({ ok: false, error: 'GET 또는 POST만 지원합니다.' });
  } catch (e) {
    console.error('[/api/hire-board]', String(e && e.message));
    return res.status(502).json({ ok: false, error: '현황판 처리 중 문제가 발생했습니다.' });
  }
}
