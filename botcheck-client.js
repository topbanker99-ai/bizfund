/* 사장님서랍 — 작업증명(PoW) 봇 차단 클라이언트. 외부 서비스·키 없음.
   powSolve(): /api/pow 퍼즐을 받아 브라우저에서 짧게 풀고(nonce 탐색) 제출 문자열을 돌려준다.
   끈 상태(off)거나 실패하면 ''을 돌려주고 앱은 그대로 진행한다. */
(function () {
  // ── 경량 SHA-256 (ASCII 입력, 32bit 워드 8개 반환) ──
  var K = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
    3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
    3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
    2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
    666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
    2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
    430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
    1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298];
  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
  function sha256(ascii) {
    var words = [], len = ascii.length, bitLen = len * 8, i;
    var hash = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
    for (i = 0; i < len; i++) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - (i & 3)) * 8);
    words[len >> 2] |= 0x80 << ((3 - (len & 3)) * 8);
    words[((len + 8 >> 6) + 1) * 16 - 1] = bitLen;
    var w = [], a, b, c, d, e, f, g, h, j, t1, t2, s0, s1, ch, maj;
    for (j = 0; j < words.length; j += 16) {
      a = hash[0]; b = hash[1]; c = hash[2]; d = hash[3]; e = hash[4]; f = hash[5]; g = hash[6]; h = hash[7];
      for (i = 0; i < 64; i++) {
        if (i < 16) { w[i] = words[j + i] | 0; }
        else {
          s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
          s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        s1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        ch = (e & f) ^ (~e & g);
        t1 = (h + s1 + ch + K[i] + w[i]) | 0;
        s0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        maj = (a & b) ^ (a & c) ^ (b & c);
        t2 = (s0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0; hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0; hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
    }
    return hash;
  }
  function leadingZeroBits(hash) {
    var bits = 0;
    for (var i = 0; i < 8; i++) {
      var wv = hash[i] >>> 0;
      if (wv === 0) { bits += 32; continue; }
      bits += Math.clz32(wv);
      break;
    }
    return bits;
  }

  // 신선한 PoW 해답 문자열을 돌려준다("c.exp.d.sig.nonce"). off/실패 시 ''.
  window.powSolve = async function () {
    try {
      var r = await fetch('/api/pow', { cache: 'no-store' });
      var ch = await r.json();
      if (!ch || ch.off || !ch.c) return '';
      var prefix = ch.c + ':', d = ch.d | 0, nonce = 0, start = Date.now();
      while (true) {
        if (leadingZeroBits(sha256(prefix + nonce)) >= d) break;
        nonce++;
        if ((nonce & 8191) === 0 && Date.now() - start > 5000) break; // 5초 넘으면 중단(사람 기기 보호)
      }
      return ch.c + '.' + ch.exp + '.' + d + '.' + ch.sig + '.' + nonce;
    } catch (e) { return ''; }
  };
})();
