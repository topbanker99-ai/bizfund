/* ============================================================
   사장님서랍 AI 음성 상담 — OpenAI Realtime (WebRTC)
   흐름: 관점 선택 → 비밀번호 → /api/realtime-token(ek_) →
        RTCPeerConnection + 마이크 + data channel → SDP offer →
        oai-events 로 자막 수신 + search_cases 도구 호출 중계(/api/rag-search)
   ============================================================ */
(function () {
  var TOKEN_ENDPOINT = '/api/realtime-token';
  var RAG_ENDPOINT = '/api/rag-search';
  var REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
  var SESSION_MIN = 20; // 1회 상담 최대 분

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

  var PERSP = '';            // '운영중' | '폐업·회생'
  var pc, dc, micStream, timerId, seconds = 0, turns = [], curAiEl = null, sysTimers = [];
  var connected = false;

  // ── 화면 전환 ──
  function setStatus(t) { var e = $('vStatus'); if (e) e.textContent = t; }
  function setOrb(s) { var o = $('orb'); if (o) o.className = 'orb' + (s ? ' ' + s : ''); }
  function showGate() { $('persGate').style.display = ''; $('consultMain').style.display = 'none'; }
  function showMain() {
    $('persGate').style.display = 'none'; $('consultMain').style.display = '';
    var b = $('persBadge'); if (b) { b.style.display = ''; b.textContent = (PERSP === '운영중' ? '운영 중' : '폐업·회생') + ' 상담'; }
  }

  function addTurn(who, text, partial) {
    var box = $('transcript'); var empty = $('trEmpty'); if (empty) empty.style.display = 'none';
    var el = document.createElement('div');
    el.className = 'tr-turn ' + who + (partial ? ' partial' : '');
    el.innerHTML = '<div class="who">' + (who === 'ai' ? 'AI 상담원' : '사장님') + '</div><div class="bubble"></div>';
    el.querySelector('.bubble').textContent = text;
    box.appendChild(el); box.scrollTop = box.scrollHeight; return el;
  }

  function setMic(on) { try { if (micStream) micStream.getAudioTracks().forEach(function (t) { t.enabled = on; }); } catch (e) {} }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function stopAll() {
    stopTimer(); sysTimers.forEach(function (t) { clearTimeout(t); }); sysTimers = [];
    try { if (dc) dc.close(); } catch (e) {}
    try { if (pc) pc.close(); } catch (e) {}
    try { if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    micStream = null; pc = null; dc = null; connected = false;
  }

  function pickMime() { return 'audio/webm'; }

  // ── 시작 ──
  async function start() {
    if (!PERSP) { showGate(); return; }
    var btn = $('btnStart'); btn.disabled = true;
    setStatus('연결 중…');
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      btn.disabled = false; setStatus(''); alert('마이크 권한이 필요합니다. 브라우저 설정에서 허용 후 다시 시도해주세요.'); return;
    }
    micStream.getAudioTracks().forEach(function (tr) { tr.enabled = false; }); // 첫 인사 끝난 뒤 켠다
    try {
      var ts = (typeof tsToken === 'function') ? await tsToken() : ''; // 보이지 않는 봇 확인(설정 시)
      var url = TOKEN_ENDPOINT + '?perspective=' + encodeURIComponent(PERSP);
      var tr = await fetch(url, { headers: ts ? { 'cf-turnstile-token': ts } : {} });
      if (tr.status === 503) { throw new Error('음성 상담이 아직 열리지 않았어요. (관리자에게 문의)'); }
      if (tr.status === 429) { throw new Error('연결 시도가 잦거나 오늘 이용량이 소진되었습니다. 잠시 후 다시 시도해주세요.'); }
      if (!tr.ok) throw new Error('연결 준비 실패 (' + tr.status + ')');
      var tok = await tr.json();
      var EK = tok.value || (tok.client_secret && tok.client_secret.value);
      if (!EK) throw new Error('연결 토큰을 받지 못했습니다.');
      await connectRealtime(EK);
    } catch (err) {
      stopAll(); btn.disabled = false; setStatus(''); setOrb('');
      alert(err.message || '연결에 실패했어요. 잠시 후 다시 시도해주세요.');
      $('btnStart').style.display = ''; $('btnEnd').style.display = 'none';
    }
  }

  async function connectRealtime(EK) {
    pc = new RTCPeerConnection();
    var audioEl = document.createElement('audio'); audioEl.autoplay = true;
    pc.ontrack = function (e) {
      audioEl.srcObject = e.streams[0];
      try {
        var actx = new (window.AudioContext || window.webkitAudioContext)();
        var srcNode = actx.createMediaStreamSource(e.streams[0]);
        audioEl.muted = true;
        var gain = actx.createGain(); gain.gain.value = 2.2; srcNode.connect(gain); gain.connect(actx.destination);
        if (actx.state === 'suspended') actx.resume();
        var an = actx.createAnalyser(); an.fftSize = 512; srcNode.connect(an);
        var buf = new Uint8Array(an.frequencyBinCount);
        var mouth = $('orbMouth');
        (function lip() {
          an.getByteFrequencyData(buf);
          var s = 0; for (var i = 2; i < 42; i++) s += buf[i];
          var v = Math.min(1, (s / 40) / 135);
          if (mouth) mouth.style.transform = 'translate(-50%,-50%) scaleY(' + (0.12 + v * 0.85).toFixed(3) + ') scaleX(' + (1 + v * 0.12).toFixed(3) + ')';
          if (connected) requestAnimationFrame(lip);
        })();
      } catch (err) {}
    };
    pc.addTrack(micStream.getTracks()[0]);
    dc = pc.createDataChannel('oai-events');
    dc.onopen = function () {
      // 인사 1회 (지침·도구는 서버가 토큰에 설정)
      if (!window.__greeted) { window.__greeted = true; setTimeout(function () { try { dc.send(JSON.stringify({ type: 'response.create' })); } catch (e) {} }, 400); }
      // 상담 시간 관리: (SESSION_MIN-3)분 마무리 안내 → (SESSION_MIN-1)분 마지막 인사 → SESSION_MIN분 종료
      var inject = function (txt) { try { dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: txt }] } })); } catch (_) {} };
      sysTimers.push(setTimeout(function () {
        inject('상담 시간이 약 3분 남았다. 사장님의 현재 이야기가 일단락되면 자연스럽게 안내하라: "사장님, 상담 시간이 이제 3분 정도 남았습니다. 더 여쭤보실 게 있으면 지금 편하게 말씀해 주세요." 이후로는 새 주제를 확장하지 말고 마무리에 집중하라.');
        setStatus('상담 마무리 단계 (약 3분 남음)');
      }, (SESSION_MIN - 3) * 60000));
      sysTimers.push(setTimeout(function () {
        inject('상담 시간이 약 1분 남았다. 사장님 발언이 끝나는 대로 마무리 인사를 하라: "오늘 나눈 내용을 참고해서 준비하시면 도움이 되실 겁니다. 정확한 한도와 자격은 소상공인시장진흥공단이나 소관기관 상담에서 확인하세요. 시간 내주셔서 감사합니다." 이 인사 후에는 새 질문을 하지 마라.');
        setStatus('상담 종료 임박 (약 1분)');
      }, (SESSION_MIN - 1) * 60000));
      sysTimers.push(setTimeout(function () { endVoice(); }, SESSION_MIN * 60000));
    };
    dc.onmessage = onEvent;

    var offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    var sdpRes = await fetch(REALTIME_CALLS_URL, { method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + EK, 'Content-Type': 'application/sdp' } });
    if (!sdpRes.ok) throw new Error('음성 연결 실패 (' + sdpRes.status + ')');
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
    connected = true;
    $('btnStart').style.display = 'none'; $('btnEnd').style.display = '';
    setOrb('listening'); setStatus('듣는 중…'); seconds = 0;
    $('vTimer').style.display = '';
    timerId = setInterval(function () { seconds++; $('vTimer').textContent = fmt(seconds); if (seconds >= SESSION_MIN * 60) endVoice(); }, 1000);
  }

  function onEvent(e) {
    var m; try { m = JSON.parse(e.data); } catch (_) { return; }
    var t = m.type || '';
    // 사례검색 도구 호출 → 서버 검색 → 결과 주입 → 답변 재개
    if (t === 'response.function_call_arguments.done') {
      (async function () {
        var args = {}; try { args = JSON.parse(m.arguments || '{}'); } catch (_) {}
        setStatus('유사 사례 찾는 중…');
        var out = '검색 중 오류가 발생했습니다. 일반 기준으로 안내하세요.';
        try {
          var r = await fetch(RAG_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: args.query || '', perspective: PERSP }) });
          var j = await r.json(); out = j.result || out;
        } catch (_) {}
        try {
          dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: m.call_id, output: out } }));
          dc.send(JSON.stringify({ type: 'response.create' }));
        } catch (_) {}
      })();
      return;
    }
    if (t === 'response.created') { setMic(false); }
    if (t === 'response.done') { setTimeout(function () { setMic(true); }, 350); }
    if (t.endsWith('speech_started')) { setOrb('listening'); setStatus('듣는 중…'); }
    if (t.endsWith('speech_stopped')) {
      setStatus('생각 중…');
      var ph = addTurn('user', '…', true); (window.__pendingUser = window.__pendingUser || []).push(ph);
    }
    if (t.indexOf('input_audio_transcription.completed') >= 0) {
      var x = (m.transcript || '').trim();
      var ph2 = (window.__pendingUser || []).shift();
      if (ph2) { if (x) { ph2.querySelector('.bubble').textContent = x; ph2.classList.remove('partial'); turns.push({ who: 'user', text: x }); } else { ph2.remove(); } }
      else if (x) { addTurn('user', x); turns.push({ who: 'user', text: x }); }
    }
    if (t.indexOf('output_audio_transcript.delta') >= 0 || t.indexOf('audio_transcript.delta') >= 0) {
      setOrb('speaking'); setStatus('답변 중…');
      if (!curAiEl) { curAiEl = addTurn('ai', '', true); curAiEl._buf = ''; }
      curAiEl._buf += (m.delta || ''); curAiEl.querySelector('.bubble').textContent = curAiEl._buf;
      var box = $('transcript'); box.scrollTop = box.scrollHeight;
    }
    if (t.indexOf('output_audio_transcript.done') >= 0 || t.indexOf('audio_transcript.done') >= 0 || t === 'response.done') {
      if (curAiEl) { turns.push({ who: 'ai', text: curAiEl._buf || '' }); curAiEl.classList.remove('partial'); curAiEl = null; }
      setOrb('listening'); setStatus('듣는 중…');
    }
  }

  function endVoice() {
    stopAll(); setOrb(''); setStatus('상담이 종료되었습니다.');
    $('vTimer').style.display = 'none';
    $('btnEnd').style.display = 'none'; var bs = $('btnStart'); bs.style.display = ''; bs.disabled = false; bs.textContent = '다시 상담하기';
  }

  function boot() {
    if (!$('btnStart')) return;
    document.querySelectorAll('.pers-choice').forEach(function (b) { b.onclick = function () { PERSP = b.dataset.persp; showMain(); }; });
    var pc2 = $('persChange'); if (pc2) pc2.onclick = function () { if ($('btnEnd').style.display !== 'none') { alert('진행 중인 상담을 종료한 뒤 관점을 바꿀 수 있습니다.'); return; } PERSP = ''; showGate(); };
    $('btnStart').onclick = start;
    $('btnEnd').onclick = endVoice;
    window.addEventListener('pagehide', stopAll);
    showGate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
