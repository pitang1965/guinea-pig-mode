/* モルモットモード本体：ステージの生成・足場の収集・メインループ */
(function () {
  'use strict';

  if (window.top !== window) return;                       // トップフレームのみ
  if (!document.documentElement) return;
  if (window.__moruModeLoaded) return;
  window.__moruModeLoaded = true;

  const PLATFORM_SELECTOR = [
    'img', 'video', 'canvas', 'button', 'input', 'select', 'textarea',
    'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'pre', 'blockquote', 'figure',
    'nav', 'header', 'footer', 'article', 'section > p', 'li',
    '[role="button"]', '[role="tab"]', '.card'
  ].join(',');

  const PLATFORM_TTL   = 600;    // ms
  const MAX_PLATFORMS  = 140;

  const PERSONAL_SPACE = 0.62;   // 体の横幅に対する最低間隔（1.0 で完全に離れる）
  const PUSH_RATE      = 0.35;   // 1 フレームで詰まりをどれだけ解消するか

  let settings = null;
  let host = null;
  let shadow = null;
  let stage = null;
  let pets = [];
  let rafId = 0;
  let lastTime = 0;
  let platformCache = { time: -1e9, list: [] };
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, seen: false };

  /* ---------- ステージ ---------- */

  let mountSeq = 0;   // 生成中に停止/再開されたことを検出する

  async function mountStage() {
    const token = ++mountSeq;

    const el = document.createElement('div');
    el.id = 'moru-mode-host';
    const style = {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      margin: '0', padding: '0', border: '0', background: 'none',
      pointerEvents: 'none', zIndex: '2147483000', overflow: 'hidden',
      colorScheme: 'normal'
    };
    for (const [k, v] of Object.entries(style)) {
      el.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v, 'important');
    }

    const shadowRoot = el.attachShadow({ mode: 'open' });
    const stageEl = document.createElement('div');
    stageEl.className = 'moru-root';

    // ページの CSP に左右されないよう、構築済みスタイルシートとして流し込む
    let css = '';
    try {
      const res = await fetch(chrome.runtime.getURL('src/content/moru.css'));
      css = await res.text();
    } catch (_) {
      css = '.moru{position:absolute;left:0;top:0}.moru-flip{width:100%;height:100%}' +
            '.moru-svg{width:100%;height:100%;overflow:visible;pointer-events:auto;cursor:grab}';
    }

    // 取得を待つあいだに無効化・再マウントされていたら、この分は捨てる
    if (token !== mountSeq) return false;

    let adopted = false;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadowRoot.adoptedStyleSheets = [sheet];
      adopted = true;
    } catch (_) { /* 未対応環境は <style> にフォールバック */ }
    if (!adopted) {
      const styleEl = document.createElement('style');
      styleEl.textContent = css;
      shadowRoot.appendChild(styleEl);
    }
    shadowRoot.appendChild(stageEl);
    (document.body || document.documentElement).appendChild(el);

    host = el;
    shadow = shadowRoot;
    stage = stageEl;
    return true;
  }

  function unmountStage() {
    mountSeq++;           // 生成中のものがあれば無効にする
    stopLoop();
    pets.forEach((p) => p.destroy());
    pets = [];
    if (host) host.remove();
    host = shadow = stage = null;
  }

  /* ---------- 足場の収集 ---------- */

  function collectPlatforms() {
    const list = [];
    const seen = new Set();
    let nodes;
    try {
      nodes = document.querySelectorAll(PLATFORM_SELECTOR);
    } catch (_) {
      return list;
    }
    for (const el of nodes) {
      if (list.length >= MAX_PLATFORMS) break;
      if (el === host || host.contains(el)) continue;
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 64 || r.height < 14) continue;
      if (r.top < 24 || r.top > innerHeight - 40) continue;
      if (r.right < 0 || r.left > innerWidth) continue;
      const key = (r.top | 0) + ':' + (r.left | 0) + ':' + (r.width | 0);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ el: el, top: r.top, left: Math.max(0, r.left), right: Math.min(innerWidth, r.right) });
    }
    return list;
  }

  function platforms() {
    const now = performance.now();
    if (now - platformCache.time > PLATFORM_TTL) {
      platformCache = { time: now, list: settings.walkOnElements ? collectPlatforms() : [] };
    }
    return platformCache.list;
  }

  /* ---------- 匹数の同期 ---------- */

  function syncPets() {
    const want = Math.max(1, Math.min(5, settings.count | 0 || 1));
    while (pets.length > want) pets.pop().destroy();
    while (pets.length < want) {
      const pet = new globalThis.MoruPet({ settings, mouse, platforms }, pets.length);
      pets.push(pet);
      stage.appendChild(pet.el);
    }
    pets.forEach((p) => p.applySettings(settings));
  }

  /* ---------- 個体同士の間隔 ---------- */

  /**
   * 同じ高さにいるモルモットが完全に重ならないよう、少しずつ横に押し分ける。
   * 押す量を小さくしてあるので、離れるというより「連なって」見える。
   */
  function separatePets() {
    if (pets.length < 2) return;
    let moved = false;

    for (let i = 0; i < pets.length; i++) {
      const a = pets[i];
      if (a.airborne()) continue;
      for (let j = i + 1; j < pets.length; j++) {
        const b = pets[j];
        if (b.airborne()) continue;
        if (Math.abs(a.feetY() - b.feetY()) > a.h * 0.4) continue;   // 段が違えば干渉しない

        const gap = Math.min(a.w, b.w) * PERSONAL_SPACE;
        let dx = (b.x + b.w / 2) - (a.x + a.w / 2);
        if (Math.abs(dx) < 0.01) dx = Math.random() < 0.5 ? -0.01 : 0.01;  // 完全一致をほぐす
        const overlap = gap - Math.abs(dx);
        if (overlap <= 0) continue;

        const sign = dx > 0 ? 1 : -1;
        const push = overlap * PUSH_RATE;
        // ドラッグ中の子はカーソルに従うので動かさず、相手だけがよける
        if (a.dragging && b.dragging) continue;
        if (a.dragging) {
          b.x += sign * push * 2;
        } else if (b.dragging) {
          a.x -= sign * push * 2;
        } else {
          a.x -= sign * push;
          b.x += sign * push;
        }
        moved = true;
      }
    }

    if (moved) {
      for (const pet of pets) {
        if (pet.dragging) continue;
        pet.clampToViewport();
        pet.render();
      }
    }
  }

  /* ---------- メインループ ---------- */

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    for (const pet of pets) pet.update(dt);
    separatePets();
  }

  function startLoop() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- 入力 ---------- */

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.seen = true;
  }

  function isTyping() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = a.tagName;
    return a.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  const KEY_MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump'
  };

  function onKey(e) {
    if (!settings || !settings.keyboardControls || !pets.length) return;
    if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    pets[0].onKey(action, e.type === 'keydown');
  }

  function onVisibility() {
    if (document.hidden) stopLoop();
    else if (pets.length) startLoop();
  }

  function invalidatePlatforms() {
    platformCache.time = -1e9;
  }

  function addListeners() {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('scroll', invalidatePlatforms, { passive: true });
    window.addEventListener('resize', invalidatePlatforms, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
  }

  function removeListeners() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('scroll', invalidatePlatforms);
    window.removeEventListener('resize', invalidatePlatforms);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  /* ---------- 起動・停止 ---------- */

  function shouldRun(s) {
    return s.enabled && !globalThis.MoruSettings.isSiteDisabled(s, location.hostname);
  }

  let running = false;

  async function apply(next) {
    settings = next;
    const want = shouldRun(settings);

    if (want && !running) {
      running = true;
      const mounted = await mountStage();
      if (!mounted || !running) return;   // 待っているあいだに無効化された
      syncPets();
      addListeners();
      startLoop();
    } else if (!want && running) {
      running = false;
      removeListeners();
      unmountStage();
    } else if (want && running && stage) {
      invalidatePlatforms();
      syncPets();
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'moru:ping') {
      sendResponse({ running: running, count: pets.length });
    } else if (msg.type === 'moru:wheek') {
      pets.forEach((p, i) => setTimeout(() => {
        p.say('プイプイ！');
        p.vy = -420;
        p.setState('jump', 0);
      }, i * 140));
      sendResponse({ ok: true });
    }
    return true;
  });

  // 動作確認用の内部フック（tools/ 以下のハーネスから使う）
  globalThis.__moruDebug = () => ({
    running, pets, separate: separatePets, platforms: settings ? platforms() : []
  });

  globalThis.MoruSettings.onChange((next) => { apply(next); });

  globalThis.MoruSettings.get().then(apply).catch(() => {});
})();
