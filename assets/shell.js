/* ─────────────────────────────────────────────
   사장님서랍 공통 셸 (A + B 혼합)
   · 사장님 모드 — 하단 탭 / PC 사이드바
   · 지원자 모드 — 탭 없이 진행 막대 + 다음 단계 안내
   쓰는 법: <body data-sd="hire"> 처럼 현재 탭을 적고 이 파일을 불러오면 됩니다.
   ───────────────────────────────────────────── */
(function () {
  var P = new URLSearchParams(location.search);
  var g = function (k) { return (P.get(k) || '').trim(); };

  /* 코스 정의 — 지원자가 차례로 거치는 단계 */
  var STEP = {
    game:      { name: '직무체험', page: 'hire.html' },
    empathy:   { name: '고객감정', page: 'empathy.html' },
    interview: { name: '영상면접', page: 'interview.html' }
  };

  var SD = {
    board: g('board'),
    who: g('who').slice(0, 20),
    company: g('co').slice(0, 30),
    set: g('set'),
    /* 남은 단계 목록 (쉼표 구분) */
    course: g('course').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return STEP[s]; }),
    step: parseInt(g('st'), 10) || 1,
    total: parseInt(g('tt'), 10) || 0,
    applyMode: g('apply') === '1' || !!g('course') || (!!g('board') && !!g('st'))
  };
  if (!SD.total) SD.total = SD.step + SD.course.length;

  /* 현재 단계 이름 — data-sd 값으로 판단 */
  var CUR = (document.body && document.body.getAttribute('data-sd')) || '';
  var CURKEY = CUR === 'hire' ? 'game' : CUR === 'empathy' ? 'empathy' : CUR === 'interview' ? 'interview' : '';

  /* ── 다음 단계 URL ── */
  SD.next = function () {
    if (!SD.course.length) return null;
    var key = SD.course[0], rest = SD.course.slice(1);
    var q = ['board=' + encodeURIComponent(SD.board)];
    if (SD.who) q.push('who=' + encodeURIComponent(SD.who));
    if (SD.company) q.push('co=' + encodeURIComponent(SD.company));
    if (SD.set) q.push('set=' + encodeURIComponent(SD.set));
    if (rest.length) q.push('course=' + rest.join(','));
    q.push('st=' + (SD.step + 1), 'tt=' + SD.total);
    return { key: key, name: STEP[key].name, url: STEP[key].page + '?' + q.join('&') };
  };

  /* ── 다음 단계 버튼을 특정 요소 맨 앞에 꽂는다 ── */
  SD.mountNext = function (container) {
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    if (el.querySelector('.sd-next, .sd-done')) return;
    var n = SD.next(), box;
    if (n) {
      box = document.createElement('a');
      box.className = 'sd-next';
      box.href = n.url;
      box.innerHTML = '다음 단계 · ' + n.name + ' →<small>' + SD.step + '단계 끝 · 모두 ' + SD.total + '단계</small>';
    } else if (SD.applyMode && SD.total > 1) {
      /* 여러 단계짜리 코스를 모두 끝냈을 때만 마무리 안내를 띄웁니다 */
      box = document.createElement('div');
      box.className = 'sd-done';
      box.innerHTML = '모든 단계를 끝냈습니다. 수고하셨어요!<br>결과는 사장님 현황판으로 전달됩니다.';
    } else return;
    el.insertBefore(box, el.firstChild);
  };

  /* ── 진행 막대 ── */
  function rail() {
    if (SD.total < 2) return null;
    var names = [];
    /* 이미 지난 단계 이름은 알 수 없으므로 현재 단계와 남은 단계로 채운다 */
    for (var i = 1; i < SD.step; i++) names.push({ t: '완료', s: 'dn' });
    names.push({ t: (CURKEY && STEP[CURKEY] ? STEP[CURKEY].name : '진행 중'), s: 'on' });
    SD.course.forEach(function (k) { names.push({ t: STEP[k].name, s: '' }); });

    var wrap = document.createElement('div');
    wrap.className = 'sd-rail';
    wrap.innerHTML =
      '<div class="sd-in"><div class="sd-bars">' +
      names.map(function (n) { return '<i class="' + n.s + '"></i>'; }).join('') +
      '</div><div class="sd-lb">' +
      names.map(function (n) {
        return '<span>' + (n.s === 'on' ? '<b>' + n.t + '</b>' : n.s === 'dn' ? '<s>✓ 완료</s>' : n.t) + '</span>';
      }).join('') +
      '</div></div>';
    return wrap;
  }

  /* ── 사장님 탭 ── */
  var ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/>',
    hire: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8 9.5h8M8 13.5h5"/>',
    empathy: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10.5h.01M15 10.5h.01M8.8 14.5c.9 1.2 2 1.8 3.2 1.8s2.3-.6 3.2-1.8"/>',
    interview: '<rect x="6" y="3" width="12" height="14" rx="2.5"/><path d="M12 17v4M9 21h6"/>',
    board: '<path d="M4 5.5h16v14H4z"/><path d="M8 10h8M8 14h8"/>'
  };
  function tabs() {
    var items = [
      { k: 'home', t: '홈', h: './' },
      { k: 'hire', t: '직무체험', h: 'hire.html' },
      { k: 'empathy', t: '고객감정', h: 'empathy.html' },
      { k: 'interview', t: '영상면접', h: 'interview.html' },
      { k: 'board', t: '현황판', h: 'hire.html#board' }
    ];
    var nav = document.createElement('nav');
    nav.className = 'sd-tab';
    nav.setAttribute('aria-label', '사장님 메뉴');
    nav.innerHTML =
      '<a class="sd-brand" href="./">사장님<em>서랍</em></a>' +
      '<div class="sd-grp">채용 도구</div>' +
      items.map(function (it, i) {
        var on = it.k === CUR ? ' on' : '';
        var grp = i === 4 ? '<div class="sd-grp">사장님</div>' : '';
        return grp + '<a class="sd-it' + on + '" href="' + it.h + '"' + (on ? ' aria-current="page"' : '') + '>' +
          '<svg class="ic" viewBox="0 0 24 24">' + ICON[it.k] + '</svg>' + it.t + '</a>';
      }).join('');
    return nav;
  }

  /* ── 붙이기 ── */
  function mount() {
    if (!document.body) return;
    var anchor = document.querySelector('.top');
    if (SD.applyMode) {
      var r = rail();
      if (r) {
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(r, anchor.nextSibling);
        else document.body.insertBefore(r, document.body.firstChild);
      }
    } else if (CUR) {
      document.body.appendChild(tabs());
      document.body.classList.add('sd-on');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.SD = SD;
})();
