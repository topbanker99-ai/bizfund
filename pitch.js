// 영상면접 — 카메라·마이크로 실전 인성면접 연습.
//  · 6대 영역에서 랜덤 출제(서버 /api/content?name=video-interview)
//  · 질문 음성 재생 시점부터 답변 60초(최소 10초) 녹음 시작 · 질문은 OpenAI TTS로 음성 안내
//  · 제출 시 답변 음성 → 서버 Whisper 스크립트화 + 캠 스냅샷 1장 수집
//  · 마지막에 /api/video-interview(evaluate)로 내용+태도 종합 평가
(function () {
  var CFG = { ansMax: 60, ansMin: 10, frameW: 320 };
  var CONTENT = '/api/content?name=video-interview';
  var API = '/api/video-interview';
  var AREA_NAME = {
    bizmodel: '사업모델', finplan: '자금계획', repay: '상환능력',
    credit: '신용·재무', market: '시장이해', customer: '고객·매출'
  };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function fmt(sec) { sec = Math.max(0, sec | 0); var m = (sec / 60) | 0, s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  var stream = null, recorder = null, chunks = [], recMime = 'audio/webm';
  var session = [], idx = 0, answers = [], frames = [];
  var timer = null, phase = '', remainSec = 0, totalElapsed = 0;
  var hasVideo = false, recording = false, capturedThisQ = false, pendingAction = '';
  var curAudio = null, active = false, flowStarted = false;

  function stopAudio() { try { if (curAudio) { curAudio.pause(); curAudio.currentTime = 0; } } catch (e) {} }

  // 질문을 음성으로 읽어준다(OpenAI TTS). 문항별로 한 번 받아 캐시.
  async function speakQuestion() {
    var q = session[idx];
    if (!q) return;
    var rb = $('viReplay');
    if (rb) rb.disabled = true;
    try {
      if (!q._tts) {
        var hdrs = (typeof tbAuthHeaders === 'function') ? await tbAuthHeaders() : { 'Content-Type': 'application/json' };
        var r = await fetch(API, { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'tts', text: q.question }) });
        if (r.ok) { var d = await r.json(); q._tts = d.audio || ''; }
      }
      if (q._tts) {
        stopAudio();
        curAudio = new Audio(q._tts);
        // 질문 음성이 "재생 시작"되는 순간부터 타이머·녹음을 시작한다(요구사항).
        curAudio.addEventListener('play', startFlow, { once: true });
        curAudio.play().catch(function () { startFlow(); }); // 자동재생 차단 시에도 흐름은 시작
      } else {
        startFlow(); // TTS 실패 시에도 진행되도록 폴백
      }
    } catch (e) { startFlow(); }
    if (rb) rb.disabled = false;
  }

  function pickMime() {
    var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < cands.length; i++) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (e) {}
    }
    return '';
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function stopStream() {
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    stream = null;
  }

  // ── 시작 ──
  async function start() {
    var btn = $('viStart');
    btn.disabled = true;
    $('viStartMsg').textContent = '카메라·마이크를 준비하고 있어요…';
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      } catch (e1) {
        // 카메라 거부/부재 → 음성만으로 진행
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (e2) {
      btn.disabled = false;
      $('viStartMsg').textContent = '마이크 권한이 필요합니다. 브라우저 설정에서 허용 후 다시 시도해주세요.';
      return;
    }
    hasVideo = stream.getVideoTracks().length > 0;
    recMime = pickMime();

    var cam = $('viCam');
    if (hasVideo) { cam.srcObject = stream; $('viCamMsg').style.display = 'none'; }
    else { $('viCamMsg').textContent = '🎙 음성만으로 진행합니다 (카메라 미사용 — 태도 평가는 생략돼요).'; }

    // 세션 로드
    try {
      var r = await fetch(CONTENT, { cache: 'no-store' });
      var data = await r.json();
      session = Array.isArray(data.session) ? data.session : [];
    } catch (e) { session = []; }
    if (!session.length) {
      btn.disabled = false;
      $('viStartMsg').textContent = '문항을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
      stopStream();
      return;
    }

    answers = []; frames = []; idx = 0;
    $('viIntro').hidden = true;
    $('viResult').hidden = true;
    $('viStage').hidden = false;
    beginQuestion(0);
  }

  // ── 문항 시작 ──
  function beginQuestion(i) {
    stopTimer(); stopAudio();
    if (i >= session.length) { finish(); return; }
    idx = i;
    var q = session[i];
    // 매 문항마다 상태 완전 초기화 → 타이머가 새 문항에 맞춰 다시 흐르게 한다.
    capturedThisQ = false; active = false; flowStarted = false; totalElapsed = 0; recording = false;
    $('viAreaName').textContent = AREA_NAME[q.areaId] || q.areaName || '질문';
    $('viQNo').textContent = String(i + 1);
    $('viRemain').textContent = String(session.length - i);
    $('viQuestion').textContent = q.question;
    $('viRec').classList.remove('on');
    $('viHint').classList.remove('show');
    var sb = $('viSubmit'); sb.disabled = true; sb.textContent = '제출하기';
    $('viRedo').disabled = false;
    $('viBarFill').style.width = '0%';
    setPhase('answer');
    remainSec = CFG.ansMax;
    $('viClock').textContent = fmt(remainSec); // 음성 재생 전까지 초기값(01:00) 표시(정지)
    speakQuestion(); // 음성이 "재생 시작"되면 startFlow()가 타이머·녹음을 시작
  }

  function setPhase(p) {
    phase = p;
    var pp = $('viPhasePrep'); if (pp) pp.classList.toggle('active', p === 'prep');
    var pa = $('viPhaseAns'); if (pa) pa.classList.toggle('active', p === 'answer');
  }

  // ── 질문 음성 재생과 동시에 시작: 녹음(스크립트 캡처) + 답변 타이머(60초) ──
  // 준비 구간 없이 질문 시작 시점부터 바로 답변·녹음이 연속 진행된다.
  function startFlow() {
    if (flowStarted) return; // 문항당 1회
    flowStarted = true; active = true;
    startRecording();               // 질문이 나오는 시점부터 스크립트 받아적기 시작
    $('viRec').classList.add('on');
    $('viHint').classList.add('show');
    setPhase('answer');
    remainSec = CFG.ansMax; totalElapsed = 0;
    $('viClock').textContent = fmt(remainSec);
    $('viBarFill').style.width = '0%';
    stopTimer();
    timer = setInterval(tick, 1000);
  }

  function tick() {
    totalElapsed++;
    remainSec--;
    // 최소 답변 시간이 지나면 제출 가능
    if (totalElapsed >= CFG.ansMin) { $('viSubmit').disabled = false; $('viHint').classList.remove('show'); }
    if (hasVideo && !capturedThisQ && totalElapsed === 6) { grabFrame(); capturedThisQ = true; }
    $('viBarFill').style.width = Math.min(100, (totalElapsed / CFG.ansMax) * 100) + '%';
    $('viClock').textContent = fmt(remainSec);
    if (remainSec <= 0) { stopTimer(); doSubmit(); }
  }

  function startRecording() {
    chunks = [];
    try {
      var audioStream = new MediaStream(stream.getAudioTracks());
      recorder = recMime ? new MediaRecorder(audioStream, { mimeType: recMime }) : new MediaRecorder(audioStream);
    } catch (e) { recorder = null; return; }
    recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = onRecStop;
    recording = true;
    recorder.start();
  }

  function grabFrame() {
    try {
      var v = $('viCam');
      if (!v.videoWidth) return;
      var w = CFG.frameW, h = Math.round(w * v.videoHeight / v.videoWidth);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(v, 0, 0, w, h);
      if (frames.length < 8) frames.push(c.toDataURL('image/jpeg', 0.5));
    } catch (e) {}
  }

  // 제출(사용자 클릭 또는 시간초과)
  function doSubmit() {
    if (!active) return;
    active = false;
    stopTimer(); stopAudio();
    $('viRec').classList.remove('on');
    var sb = $('viSubmit'); sb.disabled = true; sb.textContent = '처리 중…';
    $('viRedo').disabled = true;
    pendingAction = 'submit';
    if (recording && recorder) { try { recorder.stop(); } catch (e) { onRecStop(); } }
    else onRecStop();
  }

  // 다시하기
  function redo() {
    stopTimer(); stopAudio();
    active = false;
    $('viRec').classList.remove('on');
    if (recording && recorder) {
      pendingAction = 'cancel';
      try { recorder.stop(); } catch (e) { recording = false; beginQuestion(idx); }
    } else {
      beginQuestion(idx);
    }
  }

  function onRecStop() {
    recording = false;
    if (pendingAction === 'cancel') { pendingAction = ''; beginQuestion(idx); return; }
    pendingAction = '';
    var blob = chunks.length ? new Blob(chunks, { type: recMime || 'audio/webm' }) : null;
    transcribe(blob).then(function (text) {
      var q = session[idx];
      answers.push({
        areaId: q.areaId,
        sitId: q.sitId || '',
        areaName: AREA_NAME[q.areaId] || q.areaName || '',
        question: q.question,
        transcript: text || ''
      });
      beginQuestion(idx + 1);
    });
  }

  function transcribe(blob) {
    return new Promise(function (resolve) {
      if (!blob || blob.size < 400) { resolve(''); return; }
      var reader = new FileReader();
      reader.onloadend = async function () {
        try {
          var hdrs = (typeof tbAuthHeaders === 'function') ? await tbAuthHeaders() : { 'Content-Type': 'application/json' };
          var r = await fetch(API, {
            method: 'POST', headers: hdrs,
            body: JSON.stringify({ action: 'transcribe', audio: String(reader.result), mime: recMime || 'audio/webm' })
          });
          var d = await r.json().catch(function () { return {}; });
          resolve(r.ok ? (d.text || '') : '');
        } catch (e) { resolve(''); }
      };
      reader.readAsDataURL(blob);
    });
  }

  // ── 종합 평가 ──
  async function finish() {
    stopTimer();
    stopAudio();
    $('viStage').hidden = true;
    $('viLoading').hidden = false;
    stopStream();
    try {
      var hdrs = (typeof tbAuthHeaders === 'function') ? await tbAuthHeaders() : { 'Content-Type': 'application/json' };
      var r = await fetch(API, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ action: 'evaluate', answers: answers, frames: frames })
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        $('viLoading').hidden = true;
        showError(d.error || '평가 중 오류가 발생했어요.');
        return;
      }
      $('viLoading').hidden = true;
      renderResult(d.content || {}, d.attitude || null);
    } catch (e) {
      $('viLoading').hidden = true;
      showError('네트워크 오류로 평가에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  function showError(msg) {
    var el = $('viResult');
    el.hidden = false;
    el.innerHTML =
      '<div class="vi-rhd">평가를 완료하지 못했어요</div>' +
      '<p class="vi-desc">' + esc(msg) + '</p>' +
      '<div class="vi-startbar"><button class="vi-btn" id="viRetry2">처음으로</button></div>';
    $('viRetry2').addEventListener('click', resetToIntro);
  }

  function band(pct) {
    if (pct >= 80) return { t: '우수', c: '#1B3A5C' };
    if (pct >= 60) return { t: '양호', c: '#2E8B6E' };
    if (pct >= 40) return { t: '보통', c: '#BA7517' };
    return { t: '보강 필요', c: '#C0504D' };
  }
  function barColor(score10) { return score10 >= 7 ? '#2E8B6E' : score10 >= 4 ? '#BA7517' : '#C0504D'; }

  function renderResult(content, attitude) {
    var scores = Array.isArray(content.scores) ? content.scores : [];
    var total = Number(content.totalScore) || 0;
    var max = Number(content.maxScore) || (scores.length * 10) || 60;
    var pct = max ? Math.round((total / max) * 100) : 0;
    var b = band(pct);

    // 모델 scores는 문항 순서와 동일 → answers와 인덱스로 짝지어 경험/상황 분리 렌더
    var expRows = '', sitRows = '';
    answers.forEach(function (a, i) {
      var s = scores[i] || {};
      var sc = Math.max(0, Math.min(10, Number(s.score) || 0));
      if (a.areaId === 'situation') {
        var ok = !!s.correct;
        sitRows += '<div class="vi-sit ' + (ok ? 'ok' : 'no') + '">' +
          '<div class="vi-sithd"><span class="vi-sitq">' + esc(a.question) + '</span>' +
            '<span class="vi-sitbadge ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✅ 정답' : '✍ 보완 필요') + '</span></div>' +
          (s.comment ? '<div class="vi-arcm">' + esc(s.comment) + '</div>' : '') +
        '</div>';
      } else {
        var name = AREA_NAME[a.areaId] || a.areaName || '영역';
        expRows += '<div class="vi-ar">' +
          '<div class="vi-arname">' + esc(name) + '</div>' +
          '<div class="vi-arbody">' +
            '<div class="vi-artk"><div class="vi-arfill" style="width:' + (sc * 10) + '%;background:' + barColor(sc) + '"></div></div>' +
            '<div class="vi-arsc">' + sc + '/10</div>' +
            (s.comment ? '<div class="vi-arcm">' + esc(s.comment) + '</div>' : '') +
          '</div></div>';
      }
    });

    var attHtml = '';
    if (attitude) {
      var cells = [
        ['시선', attitude.eyeContact], ['표정', attitude.expression],
        ['자세', attitude.posture], ['안정감', attitude.stability]
      ].map(function (x) {
        return '<div class="vi-att"><div class="vi-attn">' + x[0] + '</div><div class="vi-attv">' + (Number(x[1]) || 0) + '</div></div>';
      }).join('');
      var obs = (attitude.observations || []).map(function (o) { return '<div class="vi-li">' + esc(o) + '</div>'; }).join('');
      var adv = (attitude.advice || []).map(function (o) { return '<div class="vi-li">' + esc(o) + '</div>'; }).join('');
      attHtml =
        '<div class="vi-block"><div class="vi-rhd">🎥 태도(비언어) 평가</div>' +
          '<div class="vi-attitude">' + cells + '</div>' +
          (obs ? '<div style="margin-top:6px;">' + obs + '</div>' : '') +
          (adv ? '<div style="margin-top:10px;"><b style="font-size:13px;color:var(--navy);">개선 조언</b>' + adv + '</div>' : '') +
          '<div class="vi-caveat">※ 정지 이미지 몇 장에 기반한 AI 추정치입니다. 참고용으로 활용하세요.</div>' +
        '</div>';
    } else {
      attHtml = '<div class="vi-block"><div class="vi-caveat">🎥 카메라를 사용하지 않아 태도 평가는 생략되었습니다. 다음엔 카메라를 켜고 응시하면 시선·표정·안정감까지 진단받을 수 있어요.</div></div>';
    }

    var recs = (content.recommendations || []).map(function (o) { return '<div class="vi-li">' + esc(o) + '</div>'; }).join('');

    var el = $('viResult');
    el.hidden = false;
    el.innerHTML =
      '<div class="vi-eyebrow">자금 피칭 리허설 · 종합 평가</div>' +
      '<div class="vi-scorehero">' +
        '<div><div class="vi-bignum">' + total + '<small>/' + max + '</small></div></div>' +
        '<div><span class="vi-grade" style="background:' + b.c + '">' + b.t + '</span>' +
          '<div class="vi-desc" style="margin-top:8px;">답변한 문항 ' + (Number(content.answeredCount) || answers.length) + '개 · 경험 6 + 상황 2</div></div>' +
      '</div>' +
      (content.verdict ? '<div class="vi-block" style="margin-top:0;"><div class="vi-rhd">🧭 한 줄 요약</div><div class="vi-verdict">' + esc(content.verdict) + '</div></div>' : '') +
      '<div class="vi-block"><div class="vi-rhd">📋 경험질문 평가</div>' +
        '<div class="vi-arlist">' + (expRows || '<div class="vi-desc">평가 결과가 없습니다.</div>') + '</div></div>' +
      (sitRows ? '<div class="vi-block"><div class="vi-rhd">🧩 상황질문 평가</div>' + sitRows + '</div>' : '') +
      attHtml +
      (recs ? '<div class="vi-block"><div class="vi-rhd">🎯 보완 방향</div>' + recs + '</div>' : '') +
      '<div class="vi-startbar" style="margin-top:20px;">' +
        '<button class="vi-btn" id="viAgain">다시 해보기</button>' +
        '<a class="vi-btn ghost" href="./" style="text-decoration:none;">홈으로</a>' +
      '</div>';
    $('viAgain').addEventListener('click', resetToIntro);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetToIntro() {
    stopTimer(); stopStream(); stopAudio();
    $('viResult').hidden = true;
    $('viStage').hidden = true;
    $('viLoading').hidden = true;
    $('viIntro').hidden = false;
    var btn = $('viStart'); btn.disabled = false;
    $('viStartMsg').textContent = '시작을 누르면 카메라·마이크 사용을 요청합니다.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 탭을 벗어나면 카메라 해제
  function guardLeave(e) {
    var t = e.target && e.target.closest && e.target.closest('[data-tab]');
    if (!t) return;
    if (t.getAttribute('data-tab') !== 'vinterview' && (stream || timer)) {
      stopTimer(); stopStream(); stopAudio();
      // 진행 중이던 상태는 인트로로 되돌린다
      if (!$('viResult') || $('viResult').hidden) resetToIntro();
    }
  }

  function boot() {
    if (!$('viStart')) return;
    $('viStart').addEventListener('click', start);
    $('viSubmit').addEventListener('click', doSubmit);
    $('viRedo').addEventListener('click', redo);
    var rb = $('viReplay');
    if (rb) rb.addEventListener('click', speakQuestion);
    document.addEventListener('click', guardLeave, true);
    window.addEventListener('pagehide', function () { stopTimer(); stopStream(); stopAudio(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
