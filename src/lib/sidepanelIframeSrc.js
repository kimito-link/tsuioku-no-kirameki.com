/**
 * sidepanelIframeSrc.js — サイドパネルの iframe に渡す src を組み立てる純関数。
 *
 * ■ なぜ要るか(2026-08-17 実機の状態速報が真因を名指しした)
 *     🔴 レーンが空: 描画関数が一度も呼ばれていません
 *     laneTickProbe: lidMiss=4 / lidFromInline=0 / lidFromSnapshot=0 / lidFromLastPainted=0
 *   ＝配信ID(lv)の解決3経路が全滅していた。真因は【境界で lv が捨てられていた】こと:
 *
 *     background.js  : `sidepanel.html?lv=lv351195145` と**正しく渡している**
 *     sidepanel.html : iframe src が静的で lv を持たない ← ★ここで消える
 *     popup-entry.js : INLINE_OWN_WATCH_URL は
 *                      `if (!INLINE_EMBED_WATCH) return ''`(:1027)
 *                      ＝サイドパネルでは構造上【常に空】
 *
 *   ＝サイドパネルにとって lv を受け取る道はこの1本しか無いのに、塞がっていた。
 *   ★[[venue-mirror-is-the-primary-path-2026-08-01]] と同じ型:
 *     多段の経路のどこか1段で値が落ちると、下流は「無かった」ようにしか見えない。
 *
 * ■ 掟
 *   - lv の形式は `lv` + 1〜15桁の数字だけを通す(background.js の SIDE_PANEL_LV_RE と同値)。
 *     不正値は**足さない**(付けるくらいなら無いほうが安全＝popup 側の従来経路に落ちる)。
 *   - 既存クエリ(inline/dock)は壊さない。lv だけを足す。
 *   - DOM も location も触らない(呼び出し側が渡す=テスト可能)。
 *
 * @module sidepanelIframeSrc
 */
import { videoPanelSrcForTab } from './videoWatch/videoPanelRoute.js';
import {
  isYtPanelSrc,
  isYtPanelTabUrl,
  ytPanelStreamKeyOfUrl,
  ytPanelSiteOfUrl,
  buildYtPanelSrc,
  readYtPanelStreamKey,
} from './youtube/ytPanelRoute.js';
import { lvFromWatchUrl } from './sidePanelLvFromTabs.js';

/** background.js の SIDE_PANEL_LV_RE と同じ規約(ズレると片方だけ通る穴になる)。 */
const LV_RE = /^lv\d{1,15}$/;

/**
 * sidepanel.html の `?lv=` から、iframe へ渡す lv を取り出す。
 *
 * @param {string} search sidepanel.html 自身の location.search（`?` 付き/無しどちらも可）
 * @returns {string} 正規化した lv（`lv123` 形式・小文字）。取れない/不正なら空文字。
 */
export function readSidePanelLv(search) {
  try {
    const raw = String(new URLSearchParams(String(search || '')).get('lv') || '')
      .trim()
      .toLowerCase();
    return LV_RE.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

/**
 * iframe の src を組み立てる。
 *
 * @param {string} baseSrc data-nl-src に書いてある素の src（`popup.html?inline=1&dock=sidepanel`）
 * @param {string} search sidepanel.html 自身の location.search
 * @returns {string} lv が取れたら `&lv=<lv>` を足した src。取れなければ baseSrc のまま。
 */
export function buildSidePanelIframeSrc(baseSrc, search) {
  const base = String(baseSrc || '').trim();
  if (!base) return '';
  const lv = readSidePanelLv(search);
  if (!lv) return base;
  // 既に lv があるなら二重に足さない(冪等)。
  if (/[?&]lv=/.test(base)) return base;
  return base + (base.includes('?') ? '&' : '?') + 'lv=' + lv;
}

/**
 * v0.1.2265: 前面タブが変わったとき、横の欄の iframe を次に何にするか。
 *   付け替えないときは null(いまの src を保つ)。
 * @param {{ tabUrl?: unknown, currentSrc?: unknown, nicoBase?: unknown, shownLv?: unknown }} p
 * @returns {string | null}
 */
export function nextSidepanelIframeSrc(p = {}) {
  const tabUrl = p.tabUrl;
  const currentSrc = String(p.currentSrc || '');
  const nicoBase = String(p.nicoBase || '');
  const vsrc = videoPanelSrcForTab(tabUrl, currentSrc, nicoBase);
  if (vsrc) return vsrc;
  if (isYtPanelTabUrl(tabUrl)) {
    const k = ytPanelStreamKeyOfUrl(tabUrl);
    if (!isYtPanelSrc(currentSrc) || (k && k !== readYtPanelStreamKey(currentSrc))) {
      return buildYtPanelSrc(k, ytPanelSiteOfUrl(tabUrl));
    }
    return null;
  }
  const lv = lvFromWatchUrl(tabUrl);
  if (!lv || lv === String(p.shownLv || '')) return null;
  return buildSidePanelIframeSrc(nicoBase, `?lv=${lv}`);
}
