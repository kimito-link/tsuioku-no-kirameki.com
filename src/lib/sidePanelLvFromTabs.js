/**
 * sidePanelLvFromTabs.js — サイドパネルが【自力で】配信IDを見つけるための純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18 ユーザーの訴え)
 *   「サービスワーカーが無効になる確率が多すぎて確認に時間がかかる」
 *   「会場モードはすぐにうごくけど」
 *
 *   ★この差には構造的な理由がある(コードで確認済み):
 *     会場モード    … watchページ内のクラス付け外しだけ = SWを起こさない = すぐ動く
 *     サイドパネル  … ツールバー押下 → SWの onClicked → setOptions → open
 *                     = SWが寝ていると【起動待ちがそのまま体感の遅さ】になる
 *   MV3のSWは無操作30秒で止まるので、これはユーザーが毎回味わう遅さ。
 *
 * ■ 直し方: 経路からSWを外す(会場モードが速いのと同じ構造にする)
 *   公式ドキュメント:
 *     "The Tabs API can be used by the service worker and extension pages"
 *   サイドパネルは【拡張ページ】なので chrome.tabs.query を自分で呼べる。
 *   ＝SWの起動を1ミリ秒も待たずに配信IDを取れる。
 *   ★実測で確認済み: パネルのページから chrome.tabs.query がエラーなく呼べた
 *     (tabs 権限は manifest に既に在る)。
 *
 * ■ ★曖昧なときは選ばない(ユーザー確定:「ユーザーにとってのベストで」)
 *   現状の `?lv=` は【ツールバーを押したそのタブ】のURLから取るので常に正確。
 *   一方この関数は「押したタブ」を知らない。だから:
 *     watchタブ1つ  → 採用(誤りようがない・待ち時間が消える)
 *     watchタブ複数 → ★採用しない(従来経路に倒す。遅いが正しい)
 *   ＝「速いが違う配信」より「遅いが正しい」を選ぶ。
 *     別の配信のコメントが出るのは、使う人にとって【壊れている】のと同じ。
 *
 * ■ ★active に頼らない(過去の事故の記録に従う)
 *   popup-entry.js:1013-1016 に「裏タブでは chrome.tabs.query({active,currentWindow})
 *   が前面の別タブを返す＝パネルが永久に固まる」事故の記録がある。
 *   ★実測でも、パネル自身がタブとして開いていると active は【自分】を返した。
 *   よってこの関数は active を一切見ない。URLの形だけで判断する。
 *
 * ■ 掟
 *   - 純関数。chrome API も DOM も触らない(タブ一覧は呼び出し側が渡す)。
 *   - lv の書式は sidepanelIframeSrc.js / background.js と同一規約
 *     (`lv` + 1〜15桁)。ここで独自に緩めない。
 *
 * @module sidePanelLvFromTabs
 */

/** background.js の SIDE_PANEL_LV_RE / sidepanelIframeSrc.js の LV_RE と同一規約。 */
const LV_RE = /^lv\d{1,15}$/;

/** watch URL から配信IDを抜く。ニコ生の watch ページの形。 */
const WATCH_URL_RE = /\/watch\/(lv\d{1,15})(?:[/?#]|$)/;

/**
 * @typedef {{
 *   lv: string,
 *   reason: 'single' | 'none' | 'ambiguous'
 * }} SidePanelLvPick
 *   lv     … 採用した配信ID(採用しないときは '')
 *   reason … single=1つに定まった / none=候補なし / ambiguous=複数あるので選ばない
 */

/**
 * タブ一覧から「自力で使ってよい配信ID」を1つだけ選ぶ。
 *
 * @param {ReadonlyArray<{ url?: unknown }>|null|undefined} tabs
 *   chrome.tabs.query の結果(url だけ使う)。★active は見ない。
 * @returns {SidePanelLvPick}
 */
export function pickLvFromTabs(tabs) {
  const list = Array.isArray(tabs) ? tabs : [];
  /** @type {Set<string>} */
  const found = new Set();
  for (const t of list) {
    const url = String(t?.url ?? '');
    if (!url) continue;
    const m = WATCH_URL_RE.exec(url);
    if (!m) continue;
    const lv = m[1];
    if (LV_RE.test(lv)) found.add(lv);
  }
  if (found.size === 0) return { lv: '', reason: 'none' };
  // ★複数の配信を同時に開いているときは【選ばない】。
  //   どれを見ているかはこの関数からは分からないので、推測で掴むと
  //   「別の配信のコメントが出る」= 使う人にとって壊れている状態になる。
  if (found.size > 1) return { lv: '', reason: 'ambiguous' };
  return { lv: [...found][0], reason: 'single' };
}

/**
 * chrome.tabs.query に渡す条件(呼び出し側が使う)。
 * ★`url` で絞る = active を根拠にしない。
 */
export const SIDE_PANEL_WATCH_TAB_QUERY = Object.freeze({
  url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
});
