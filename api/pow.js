// GET /api/pow — 작업증명 퍼즐 발급. 클라이언트가 풀어서 비싼 호출에 첨부한다.
import { handleOptions } from './_lib/cors.js';
import { botcheckEnabled, issueChallenge } from './_lib/botcheck.js';

export default function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!botcheckEnabled()) return res.json({ off: true });
  res.json(issueChallenge());
}
