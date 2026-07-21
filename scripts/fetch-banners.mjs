/**
 * 기업마당 지원사업 공고 → banners.json 의 feed 갱신
 *
 * GitHub Actions 에서 하루 한 번 실행합니다. 인증키는 Secrets(BIZINFO_KEY).
 * 브라우저에서 직접 부르지 않는 이유: 키가 소스에 노출되고, CORS 가 막히고,
 * 개발계정은 하루 1,000건이라 방문자마다 호출하면 금방 소진됩니다.
 *
 * 호출은 한 번만 합니다. 분야 필터는 파라미터 대신 아래 정규식으로 처리합니다.
 */
import fs from 'node:fs/promises';

const KEY = process.env.BIZINFO_KEY;
const OUT = 'banners.json';
const API = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';

// 소상공인에게 의미 있는 공고만 남깁니다.
const KEEP = /소상공인|자영업|점포|창업|폐업|재기|경영개선|경영안정|융자|보증|바우처|컨설팅|임대료|판로|상권|전통시장/;
const DROP = /연구개발|R&D|특허|기술개발|해외진출|수출바우처|스마트공장|대학|연구소|시제품|실증|중견기업/;

// 한국 기준 날짜. 액션은 UTC 21:00(=KST 익일 06:00)에 돌기 때문에
// UTC 날짜를 그대로 쓰면 화면에서 이미 지난 날짜로 취급된다.
const kstDate = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
const today = () => kstDate(0);
const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const ymd = (s) => String(s ?? '').replace(/[^0-9]/g, '').slice(0, 8);

// 신청기간은 reqstBeginEndDe 한 필드에 "시작 ~ 마감" 이 같이 들어온다.
// (예: "2026-07-21 ~ 2026-08-05" 또는 "20260721 ~ 20260805")
// 마감일이 필요하므로 날짜처럼 생긴 토큰 중 마지막 것을 고른다.
// 구분자 없이 날짜가 하나뿐이면 그걸 마감일로 본다. "예산 소진시까지"
// 처럼 날짜가 없으면 빈 값 → 노출기한은 +14일 기본값으로 처리된다.
function endDateOf(it) {
  const raw = String(
    it.reqstBeginEndDe ?? it.reqstEndDe ?? it.reqstEndEnd ?? it.rceptEndDe ?? it.endDe ?? ''
  );
  const dates = raw.match(/\d{4}\s*[.\-/]?\s*\d{2}\s*[.\-/]?\s*\d{2}/g);
  return dates && dates.length ? dates[dates.length - 1] : raw;
}

function daysLeft(end) {
  const m = ymd(end);
  if (m.length < 8) return null;
  const d = new Date(`${m.slice(0,4)}-${m.slice(4,6)}-${m.slice(6,8)}T23:59:59+09:00`);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

// 정부 서버가 이따금 연결을 끊어 fetch 가 실패한다(로그의 "fetch failed").
// 하루 한 번 도는 작업이 이 일시적 오류로 통째로 실패하지 않게 몇 번 다시 시도한다.
async function fetchWithRetry(url, tries = 3) {
  const headers = { 'User-Agent': 'sajangnim-seorap/1.0', Accept: 'application/json' };
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      if (i === tries) throw e;
      const wait = 2000 * i;
      console.log(`호출 실패(${e.message}), ${wait}ms 후 재시도 ${i}/${tries - 1}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// 응답 모양이 바뀌어도 배열을 찾아냅니다.
function pickArray(j) {
  if (Array.isArray(j)) return j;
  for (const k of ['jsonArray', 'items', 'item', 'list', 'data']) {
    if (Array.isArray(j?.[k])) return j[k];
  }
  const b = j?.response?.body;
  if (Array.isArray(b?.items)) return b.items;
  if (Array.isArray(b?.items?.item)) return b.items.item;
  for (const v of Object.values(j ?? {})) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
  return [];
}

function toBanner(it) {
  const title = clean(it.pblancNm || it.polcyNm || it.title || it.pblancTtl);
  const org   = clean(it.jrsdInsttNm || it.excInsttNm || it.instNm || '');
  const end   = endDateOf(it);
  const left  = daysLeft(end);

  let link = clean(it.pblancUrl || it.rceptEngnHmpgUrl || it.detailUrl || it.link || '');
  if (link && !/^https?:/i.test(link)) link = 'https://www.bizinfo.go.kr' + (link.startsWith('/') ? '' : '/') + link;

  let tag = '지원사업', tagType = '';
  if (left !== null && left <= 7)       { tag = `마감 D-${Math.max(left, 0)}`; tagType = 'urgent'; }
  else if (left !== null && left <= 30) { tag = `마감 D-${left}`; }

  const m = ymd(end);
  const endTxt = m.length === 8 ? `신청 마감 ${m.slice(0,4)}.${m.slice(4,6)}.${m.slice(6,8)}` : '';
  const sub = [org, endTxt].filter(Boolean).join(' · ');

  // 노출 기한은 공고 마감일. 마감일을 못 읽으면 2주 뒤까지만 띄운다.
  const until = m.length === 8 ? `${m.slice(0,4)}-${m.slice(4,6)}-${m.slice(6,8)}` : kstDate(14);

  return { tag, tagType, title, sub, url: link || 'https://www.bizinfo.go.kr', until, _left: left };
}

async function main() {
  const cur = JSON.parse(await fs.readFile(OUT, 'utf8'));

  if (!KEY) {
    console.log('BIZINFO_KEY 없음 — 고정 배너만 유지합니다. (정상)');
    cur.feed = [];
    cur.updated = today();
    cur.source = 'manual';
    await fs.writeFile(OUT, JSON.stringify(cur, null, 2) + '\n');
    return;
  }

  const url = new URL(API);
  url.searchParams.set('crtfcKey', KEY);
  url.searchParams.set('dataType', 'json');
  url.searchParams.set('hashtags', '소상공인');
  // pageIndex 는 필수. 이게 빠지면 유효한 키라도 API 가
  // { reqErr: "페이지 번호를 입력해주세요." } 를 돌려준다.
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageUnit', '100');

  console.log('호출:', API + '?crtfcKey=***&dataType=json&hashtags=소상공인&pageIndex=1&pageUnit=100');

  const res = await fetchWithRetry(url);
  console.log('응답 코드:', res.status);
  const text = await res.text();

  if (!res.ok) {
    console.error('호출 실패. 응답 앞부분:', text.slice(0, 300));
    console.error('기존 feed 를 그대로 둡니다.');
    return;
  }

  let json;
  try { json = JSON.parse(text); }
  catch {
    console.error('JSON 파싱 실패. 인증키가 승인 전이거나 잘못됐을 수 있습니다.');
    console.error('응답 앞부분:', text.slice(0, 300));
    return;
  }

  // API 는 파라미터/키 오류를 HTTP 200 + { reqErr: "메시지" } 로 돌려준다.
  // 키 이름만 찍지 말고 실제 메시지를 남겨 원인을 바로 알 수 있게 한다.
  if (json && json.reqErr) {
    console.error('API 오류(reqErr):', String(json.reqErr).trim());
    console.error('기존 feed 를 그대로 둡니다.');
    return;
  }

  const raw = pickArray(json);
  console.log('수집:', raw.length, '건');
  if (!raw.length) {
    console.log('받은 데이터가 없어 기존 feed 를 유지합니다. 응답 키:', Object.keys(json ?? {}).join(', '));
    return;
  }


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

  console.log('선별:', feed.length, '건');
  feed.forEach(b => console.log('  -', b.tag, '|', b.title.slice(0, 46)));

  if (!feed.length) {
    console.log('조건에 맞는 공고가 없어 기존 feed 를 유지합니다.');
    return;
  }

  cur.feed = feed;
  cur.updated = today();
  cur.source = 'bizinfo';
  await fs.writeFile(OUT, JSON.stringify(cur, null, 2) + '\n');
  console.log('banners.json 갱신 완료');
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
