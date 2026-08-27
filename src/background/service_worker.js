/* ツールバーアイコンのバッジをタブごとに更新する */
const KEY = 'moru';

const DEFAULTS = {
  enabled: true, count: 1, size: 64, speed: 1.0,
  color: 'ginger', accessory: 'none', variantSeed: 1,
  walkOnElements: true, keyboardControls: false,
  followCursor: false, wheek: true, disabledSites: []
};

function normalizeHost(input) {
  if (!input) return '';
  let h = String(input).trim().toLowerCase();
  try { if (h.includes('://')) h = new URL(h).hostname; } catch (_) {}
  return h.replace(/^www\./, '');
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(KEY);
  const s = Object.assign({}, DEFAULTS, stored[KEY] || {});
  if (!Array.isArray(s.disabledSites)) s.disabledSites = [];
  return s;
}

async function updateBadge(tabId, url) {
  if (!tabId) return;
  const s = await getSettings();
  const host = normalizeHost(url);
  const off = !s.enabled || s.disabledSites.some((d) => normalizeHost(d) === host);
  try {
    await chrome.action.setBadgeText({ tabId, text: off ? 'OFF' : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#9a8a74' });
  } catch (_) { /* タブが閉じられた等 */ }
}

async function updateAllBadges() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) updateBadge(t.id, t.url);
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(KEY);
  if (!stored[KEY]) await chrome.storage.sync.set({ [KEY]: DEFAULTS });
  updateAllBadges();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' || info.url) updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateBadge(tabId, tab.url);
  } catch (_) {}
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[KEY]) updateAllBadges();
});
