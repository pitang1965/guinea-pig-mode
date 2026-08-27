/* 設定の既定値と共通ヘルパ（content script / popup 両方から読み込む） */
(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    count: 1,
    size: 64,               // モルモットの高さ(px)
    speed: 1.0,             // 移動速度の倍率
    color: 'ginger',        // ginger | agouti | cream | white | black | tricolor | random
    accessory: 'none',      // none | flower | ribbon | hat | glasses | crown | carrot | random
    variantSeed: 1,         // 増やすとランダムの姿を引き直す
    walkOnElements: true,   // ページ内の要素の上に着地する
    keyboardControls: false,// 矢印/WASD で操作
    followCursor: false,    // マウスカーソルを追いかける
    wheek: true,            // 「プイプイ！」の吹き出し
    disabledSites: []       // 無効化するホスト名の配列
  };

  const KEY = 'moru';

  function normalizeHost(input) {
    if (!input) return '';
    let h = String(input).trim().toLowerCase();
    try {
      if (h.includes('://')) h = new URL(h).hostname;
    } catch (_) { /* そのまま扱う */ }
    return h.replace(/^www\./, '');
  }

  async function get() {
    const stored = await chrome.storage.sync.get(KEY);
    const s = Object.assign({}, DEFAULTS, stored[KEY] || {});
    if (!Array.isArray(s.disabledSites)) s.disabledSites = [];
    return s;
  }

  // 読み出し→書き込みの途中に別の set が割り込むと、
  // 先の変更が上書きで消えるので直列化する
  let writeChain = Promise.resolve();

  function set(patch) {
    const run = async () => {
      const current = await get();
      const next = Object.assign({}, current, patch);
      await chrome.storage.sync.set({ [KEY]: next });
      return next;
    };
    const result = writeChain.then(run, run);
    writeChain = result.catch(() => {});
    return result;
  }

  function isSiteDisabled(settings, host) {
    const h = normalizeHost(host);
    return (settings.disabledSites || []).some((d) => normalizeHost(d) === h);
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[KEY]) return;
      callback(Object.assign({}, DEFAULTS, changes[KEY].newValue || {}));
    });
  }

  globalThis.MoruSettings = { DEFAULTS, KEY, get, set, isSiteDisabled, onChange, normalizeHost };
})();
