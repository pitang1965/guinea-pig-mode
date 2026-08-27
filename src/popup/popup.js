/* ポップアップ（設定 UI） */
(function () {
  'use strict';

  const { get, set, DEFAULTS, normalizeHost } = globalThis.MoruSettings;
  const { PALETTES, COLOR_KEYS, build, resolveColor, resolveAccessory, ASPECT } =
    globalThis.MoruCharacter;

  const COLOR_LABELS = {
    ginger: '茶', agouti: 'アグーチ', cream: 'クリーム',
    white: '白', black: '黒', tricolor: '三毛',
    random: 'ランダム（1匹ずつちがう毛色）'
  };

  const ACCESSORIES = [
    ['none', 'なし'], ['flower', 'お花'], ['ribbon', 'リボン'],
    ['hat', 'パーティー帽'], ['glasses', 'めがね'], ['crown', '王冠'], ['carrot', 'にんじん'],
    ['random', 'ランダム']
  ];

  const $ = (id) => document.getElementById(id);
  const preview = { color: null, accessory: null };   // ランダム時のプレビュー用の抽選結果
  let settings = null;
  let host = '';
  let tabId = null;
  let injectable = false;

  /* ---------- プレビュー ---------- */

  /** ランダム指定のときは、プレビュー用に 1 匹ぶん抽選して見せる */
  function previewVariant() {
    if (settings.color === 'random' && !preview.color) preview.color = resolveColor('random');
    if (settings.accessory === 'random' && !preview.accessory) {
      preview.accessory = resolveAccessory('random');
    }
    return {
      color: settings.color === 'random' ? preview.color : settings.color,
      accessory: settings.accessory === 'random' ? preview.accessory : settings.accessory
    };
  }

  function renderPreview() {
    const box = $('preview');
    const h = 60;
    box.style.height = h + 'px';
    box.style.width = h * ASPECT + 'px';
    box.querySelector('.moru-flip').innerHTML =
      build(Object.assign({ id: 'pv' }, previewVariant()));
  }

  /** ランダムの抽選をやり直す（各モルモットは variantSeed の変化で引き直す） */
  async function shuffle() {
    preview.color = null;
    preview.accessory = null;
    await update({ variantSeed: (settings.variantSeed || 1) + 1 });
  }

  $('previewBox').addEventListener('click', () => {
    const box = $('preview');
    box.classList.remove('st-popcorn');
    void box.offsetWidth;
    box.classList.add('st-popcorn');
    setTimeout(() => box.classList.remove('st-popcorn'), 520);
  });

  /* ---------- 毛色・アクセサリー ---------- */

  function swatchBackground(key) {
    if (key === 'random') {
      const wheel = COLOR_KEYS.map((k) => PALETTES[k].body);
      return `conic-gradient(from 210deg, ${wheel.concat(wheel[0]).join(', ')})`;
    }
    const p = PALETTES[key];
    const colors = [p.body].concat((p.patches || []).map(([, c]) => c));
    if (colors.length === 1) return colors[0];
    const step = 100 / colors.length;
    const stops = colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`);
    return `linear-gradient(135deg, ${stops.join(', ')})`;
  }

  function buildColors() {
    const wrap = $('colors');
    wrap.textContent = '';
    for (const key of COLOR_KEYS.concat('random')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.color = key;
      btn.title = COLOR_LABELS[key] || key;
      btn.setAttribute('aria-label', btn.title);
      const fill = document.createElement('span');
      fill.style.background = swatchBackground(key);
      if (key === 'random') fill.textContent = '🎲';
      btn.appendChild(fill);
      btn.addEventListener('click', () => {
        // すでにランダムを選んでいるときは、もう一度押すと引き直し
        if (key === 'random' && settings.color === 'random') shuffle();
        else update({ color: key });
      });
      wrap.appendChild(btn);
    }
  }

  function buildAccessories() {
    const wrap = $('accessories');
    wrap.textContent = '';
    for (const [key, label] of ACCESSORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.accessory = key;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (key === 'random' && settings.accessory === 'random') shuffle();
        else update({ accessory: key });
      });
      wrap.appendChild(btn);
    }
  }

  /* ---------- 反映 ---------- */

  function paint() {
    $('enabled').checked = !!settings.enabled;
    $('siteOff').checked = host ? settings.disabledSites.some((d) => normalizeHost(d) === host) : false;

    $('count').value = settings.count;
    $('countVal').textContent = settings.count;
    $('size').value = settings.size;
    $('sizeVal').textContent = settings.size;
    $('speed').value = settings.speed;
    $('speedVal').textContent = Number(settings.speed).toFixed(1);

    for (const id of ['walkOnElements', 'followCursor', 'keyboardControls', 'wheek']) {
      $(id).checked = !!settings[id];
    }

    document.querySelectorAll('.swatch').forEach((b) => {
      b.classList.toggle('on', b.dataset.color === settings.color);
    });
    document.querySelectorAll('.chip').forEach((b) => {
      b.classList.toggle('on', b.dataset.accessory === settings.accessory);
    });

    $('shuffleBtn').hidden = settings.color !== 'random' && settings.accessory !== 'random';
    document.body.classList.toggle('disabled', !settings.enabled);
    $('wheekBtn').disabled = !settings.enabled || !injectable || $('siteOff').checked;

    renderPreview();
  }

  async function update(patch) {
    settings = await set(patch);
    paint();
  }

  function bindRange(id, key, transform) {
    const el = $(id);
    el.addEventListener('input', () => {
      const value = transform ? transform(el.value) : Number(el.value);
      settings[key] = value;
      $(id + 'Val').textContent = key === 'speed' ? value.toFixed(1) : value;
      if (key === 'size') renderPreview();
    });
    el.addEventListener('change', () => {
      update({ [key]: settings[key] });
    });
  }

  /* ---------- 起動 ---------- */

  async function init() {
    buildColors();
    buildAccessories();
    settings = await get();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        tabId = tab.id;
        const url = tab.url || '';
        injectable = /^https?:/.test(url);
        host = injectable ? normalizeHost(url) : '';
        $('siteLabel').textContent = injectable
          ? host
          : 'このページでは動作しません（拡張機能ページ等）';
        $('siteOff').disabled = !injectable;
      }
    } catch (_) {
      $('siteLabel').textContent = '';
    }

    paint();

    $('enabled').addEventListener('change', (e) => update({ enabled: e.target.checked }));

    $('siteOff').addEventListener('change', (e) => {
      if (!host) return;
      const list = settings.disabledSites.filter((d) => normalizeHost(d) !== host);
      if (e.target.checked) list.push(host);
      update({ disabledSites: list });
    });

    bindRange('count', 'count');
    bindRange('size', 'size');
    bindRange('speed', 'speed', (v) => Number(v));

    for (const id of ['walkOnElements', 'followCursor', 'keyboardControls', 'wheek']) {
      $(id).addEventListener('change', (e) => update({ [id]: e.target.checked }));
    }

    $('shuffleBtn').addEventListener('click', shuffle);

    $('wheekBtn').addEventListener('click', async () => {
      if (tabId == null) return;
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'moru:wheek' });
      } catch (_) {
        $('siteLabel').textContent = 'ページを再読み込みしてください';
      }
    });

    $('reset').addEventListener('click', async () => {
      settings = await set(Object.assign({}, DEFAULTS, { disabledSites: settings.disabledSites }));
      paint();
    });
  }

  init();
})();
