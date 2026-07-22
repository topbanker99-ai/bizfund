// core-only CORS — 인증·쿠키(자격증명)를 쓰지 않는 공개 도구.
// 피칭 페이지가 API와 같은 배포 도메인에서 호출하는 게 기본이라,
// 요청 Origin을 그대로 허용한다(자격증명 미전송). 유지보수할 허용목록 없음.
export function applyCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function handleOptions(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
