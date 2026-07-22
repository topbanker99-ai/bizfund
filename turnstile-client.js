/* 사장님서랍 — Cloudflare Turnstile 클라이언트(보이지 않는 봇 차단).
   /api/turnstile 로 사이트키를 받아 위젯을 숨겨 렌더하고, 필요할 때 tsToken()으로 토큰을 만든다.
   설정이 없으면(enabled=false) tsToken()은 ''을 돌려주고 앱은 그대로 진행한다(무마찰). */
(function () {
  var widgetId = null, ready = false, siteKey = '', pending = null, initP = null;
  window.__TS = { enabled: false };

  function loadScript() {
    return new Promise(function (res, rej) {
      if (window.turnstile) return res();
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function init() {
    if (initP) return initP;
    initP = (async function () {
      try {
        var r = await fetch('/api/turnstile');
        var cfg = await r.json();
        if (!cfg || !cfg.enabled || !cfg.siteKey) return; // 기능 off
        siteKey = cfg.siteKey;
        await loadScript();
        var el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;overflow:hidden';
        document.body.appendChild(el);
        widgetId = window.turnstile.render(el, {
          sitekey: siteKey,
          execution: 'execute',          // 우리가 부를 때만 토큰 생성
          appearance: 'interaction-only', // 사람에겐 안 보이고, 정말 필요할 때만 잠깐 표시
          callback: function (t) { if (pending) { pending(t); pending = null; } },
          'error-callback': function () { if (pending) { pending(''); pending = null; } },
          'expired-callback': function () { if (pending) { pending(''); pending = null; } }
        });
        ready = true; window.__TS.enabled = true;
      } catch (e) { ready = false; }
    })();
    return initP;
  }

  // 신선한 토큰 1개를 돌려준다. 비활성/실패 시 ''.
  window.tsToken = async function () {
    await init();
    if (!ready || !window.turnstile) return '';
    return await new Promise(function (res) {
      pending = res;
      try { window.turnstile.reset(widgetId); } catch (e) {}
      try { window.turnstile.execute(widgetId); }
      catch (e) { pending = null; return res(''); }
      setTimeout(function () { if (pending) { pending = null; res(''); } }, 8000); // 타임아웃 폴백
    });
  };

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
