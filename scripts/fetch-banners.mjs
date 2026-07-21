/**
 * 기업마당(bizinfo.go.kr) 지원사업 공고를 받아 banners.json의 feed 부분만 갱신합니다.
 * GitHub Actions에서 하루 한 번 실행합니다. 인증키는 저장소 Secrets(BIZINFO_KEY)에 둡니다.
 *
 * 브라우저에서 직접 부르지 않는 이유
 *  - 인증키가 HTML 소스에 노출됩니다.
 *  - 기업마당·공공데이터포털은 CORS 헤더를 주지 않아 브라우저 호출이 막힙니다.
 * 그래서 서버(액션)에서 받아 JSON으로 저장소에 커밋하고, 화면은 그 파일만 읽습니다.
 */
import fs from 'node:fs/promises';

const KEY = process.env.BIZINFO_KEY;
const OUT = 'banners.json';

// 소상공인에게 의미 있는 분야만. 기업마당 분야코드: 01금융 02기술 03인력 04수출 05내수 06창업 07경영 09기타
const FIELDS = ['01', '06', '07'];
const KEEP = /소상공인|자영업|창업|점포|폐업|재기|경영개선|융자|보증|바우처|컨설팅|임대료|판로/;
const DROP = /연구개발|R&D|특허|해외진출|수출바우처|스마트공장|대학|연구소/;

const todayISO = () => new Date().toISOString().slice(0, 10);
const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

function daysLeft(end) {
  if (!end) return null;
  const m = String(end).replace(/[^0-9]/g, '');
  if (m.length < 8) return null;
  const d = new Date(`${m.slice(0,4)}-${m.slice(4,6)}-${m.slice(6,8)}T23:59:59+09:00`);
  return Math.ceil((d - new Date()) / 86400000);
}

async function fetchField(code) {
  const url = new URL('https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do');
  url.searchParams.set('crtfcKey', KEY);
  url.searchParams.set('dataType', 'json');
  url.searchParams.set('searchLclasId', code);
  url.searchParams.set('hashtags', '소상공인');
  const r = await fetch(url, { headers: { 'User-Agent': 'sajangnim-seorap/1.0' } });
  if (!r.ok) throw new Error(`${code}: HTTP ${r.status}`);
  const j = await r.json();
  return j?.jsonArray ?? j?.response?.body?.items ?? [];
}

function toBanner(it) {
  const title = clean(it.pblancNm || it.title);
  const org   = clean(it.jrsdInsttNm || it.excInsttNm || '');
  const end   = it.reqstEndDe || it.reqstEndEnd || '';
  const left  = daysLeft(end);
  let link = clean(it.pblancUrl || it.rceptEngnHmpgUrl || '');
  if (link && !/^https?:/.test(link)) link = 'https://www.bizinfo.go.kr' + link;

  let tag = '지원사업', tagType = '';
  if (left !== null && left <= 7) { tag = `마감 D-${Math.max(left, 0)}`; tagType = 'urgent'; }
  else if (left !== null && left <= 30) { tag = `마감 D-${left}`; }

  const sub = [org, end ? `신청 마감 ${String(end).replace(/[^0-9]/g,'').replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}` : '']
    .filter(Boolean).join(' · ');

  return { tag, tagType, title, sub, url: link || 'https://www.bizinfo.go.kr', until: todayISO(), _left: left };
}

const main = async () => {
  const cur = JSON.parse(await fs.readFile(OUT, 'utf8'));

  if (!KEY) {
    console.log('BIZINFO_KEY 없음 — feed를 비우고 고정 배너만 유지합니다.');
    cur.feed = []; cur.updated = todayISO(); cur.source = 'manual';
    await fs.writeFile(OUT, JSON.stringify(cur, null, 2) + '\n');
    return;
  }

  const raw = [];
  for (const c of FIELDS) {
    try { raw.push(...(await fetchField(c))); }
    catch (e) { console.error('수집 실패', c, e.message); }
  }
  console.log(`수집 ${raw.length}건`);

  const seen = new Set();
  const feed = raw
    .map(toBanner)
    .filter(b => b.title && b.title.length > 6)
    .filter(b => KEEP.test(b.title) && !DROP.test(b.title))
    .filter(b => b._left === null || (b._left >= 0 && b._left <= 45))
    .filter(b => { const k = b.title.slice(0, 24); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a._left ?? 999) - (b._left ?? 999))
    .slice(0, 4)
    .map(({ _left, ...b }) => b);

  console.log(`선별 ${feed.length}건`);
  feed.forEach(b => console.log(' -', b.tag, b.title.slice(0, 50)));

  if (!feed.length) { console.log('조건에 맞는 공고 없음 — 기존 feed 유지'); return; }

  cur.feed = feed;
  cur.updated = todayISO();
  cur.source = 'bizinfo';
  await fs.writeFile(OUT, JSON.stringify(cur, null, 2) + '\n');
  console.log('banners.json 갱신 완료');
};

main().catch(e => { console.error(e); process.exit(1); });
