/* 사장님자금진단 서버 (선택 사항)
   ------------------------------------------------------------
   index.html 은 서버 없이 단독 동작한다. 이 서버는 확장 단계용:
   - 정적 파일 서빙 (public/)
   - 기업마당(bizinfo) API 동기화 → 티어3 원본 저장 (data/tier3-raw.json)
   - (설계) LLM 요건 추출 → 티어2 후보 → 관리자 검수 후 티어1 승격
   실행: BIZINFO_API_KEY=... node server.js
   ------------------------------------------------------------ */
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/* ---------- 기업마당 API 동기화 (티어3 수집) ----------
   ※ 파라미터명은 공공데이터포털의 기업마당 지원사업정보 OpenAPI 명세를
   발급 시점 기준으로 반드시 재확인할 것 (검증 필요 수치 항목). */
const BIZINFO_ENDPOINT = 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01';

async function syncBizinfo() {
  const key = process.env.BIZINFO_API_KEY;
  if (!key) throw new Error('BIZINFO_API_KEY 미설정');
  const url = BIZINFO_ENDPOINT
    + '?serviceKey=' + encodeURIComponent(key)
    + '&page=1&perPage=100&returnType=json';
  const res = await fetch(url);
  if (!res.ok) throw new Error('bizinfo 응답 오류 ' + res.status);
  const json = await res.json();
  const items = json?.data || json?.response?.body?.items || [];
  const tier3 = items.map(it => ({
    tier: 3, source: 'bizinfo', fetchedAt: new Date().toISOString(), raw: it
  }));
  fs.writeFileSync(path.join(DATA_DIR, 'tier3-raw.json'), JSON.stringify(tier3, null, 2));
  return tier3.length;
}

app.post('/api/sync', async (req, res) => {
  try {
    const n = await syncBizinfo();
    res.json({ ok: true, fetched: n });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------- 티어2 후보 조회 (관리자 검수 화면용) ---------- */
app.get('/api/candidates', (req, res) => {
  const f = path.join(DATA_DIR, 'tier2-candidates.json');
  res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []);
});

/* ---------- 헬스체크 ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true, status: 'draft' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('bizfund server on :' + PORT));
