/**
 * sidePanelPrearm.js — サイドパネルを【押される前に】用意しておく純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ユーザーの訴え(2026-08-19)
 *   「また会場モードがたちあがるけど サイドパネルなかなか出ない現象ですよ」
 *
 * ■ ★なぜ会場モードだけ速いのか(コードで確認済み・推測ではない)
 *     会場モード   … watchページ内でクラスを付け外しするだけ = SWを起こさない
 *     サイドパネル … ツールバー押下 → SWの onClicked → setOptions → open
 *                    = 【SWが寝ていれば起動待ちがそのまま体感の遅さ】
 *   MV3のSWは無操作30秒で止まる。さらに実測(2026-08-19)では、
 *   ★SWが【応答不能に陥っている】状態も観測した
 *     (同じ拡張のSWが2つ生きており、片方は `() => 1` すら返せずタイムアウト)。
 *   その間ツールバーを押しても onClicked が処理されない = パネルが出ない。
 *
 * ■ この模組がやること: 押される前に setOptions を済ませておく
 *   watchページを開いた/遷移した時点で、そのタブのパネルの path と enabled を
 *   確定させておく。すると押下時に SW がやることが減り、
 *   ★SWが寝ていても Chrome 側に用意ができているので出が速くなる。
 *
 * ■ ★やらないこと(既存の判断を壊さない)
 *   - `openPanelOnActionClick: true` にはしない。
 *     ★これを true にすると action.onClicked が発火しなくなり、
 *       埋め込み派(prefer_focus_inline / always_open_popup)のユーザーが
 *       ツールバーを押しても何も起きなくなる = 退化
 *       (src/lib/sidePanel.wiring.test.js が禁止として機械照合している)。
 *   - watchページ以外では何もしない(空のパネルを出す事故を避ける)。
 *
 * 掟: chrome API も DOM も触らない(判定だけ返す)。
 *
 * @module sidePanelPrearm
 */

/** 配信IDの書式規約(background.js / sidePanelLvFromTabs.js と同一)。 */
const LV_RE = /^lv\d{1,15}$/;
/** watch URL から配信IDを抜く。 */
const WATCH_URL_RE = /\/watch\/(lv\d{1,15})(?:[/?#]|$)/;

/**
 * @typedef {{
 *   prearm: boolean,
 *   lv: string,
 *   path: string,
 *   reason: 'ok'|'not-watch'|'no-tab'|'bad-lv'
 * }} PrearmDecision
 */

/**
 * このタブに対してパネルを事前用意すべきかを決める。
 *
 * @param {{ id?: unknown, url?: unknown }|null|undefined} tab
 * @returns {PrearmDecision}
 */
export function decidePrearm(tab) {
  const id = tab && tab.id != null ? Number(tab.id) : NaN;
  if (!Number.isFinite(id) || id < 0) {
    return { prearm: false, lv: '', path: '', reason: 'no-tab' };
  }
  const url = String((tab && tab.url) || '');
  const m = WATCH_URL_RE.exec(url);
  if (!m) return { prearm: false, lv: '', path: '', reason: 'not-watch' };
  const lv = m[1];
  // ★書式を必ず通す(生値を path に載せない = injection 面を作らない)
  if (!LV_RE.test(lv)) return { prearm: false, lv: '', path: '', reason: 'bad-lv' };
  return { prearm: true, lv, path: `sidepanel.html?lv=${lv}`, reason: 'ok' };
}

/**
 * 事前用意の設計が「既存を壊す形」に退化していないかを判定する。★構造で返す。
 *
 * @param {{ opensOnActionClick?: boolean, touchesNonWatch?: boolean }} spec
 * @returns {{ ok: boolean, reason: 'ok'|'steals-action-click'|'touches-non-watch' }}
 */
export function judgePrearmSpec(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  // ★これを true にすると埋め込み派のツールバーが死ぬ(既存テストが禁止)
  if (s.opensOnActionClick === true) return { ok: false, reason: 'steals-action-click' };
  if (s.touchesNonWatch === true) return { ok: false, reason: 'touches-non-watch' };
  return { ok: true, reason: 'ok' };
}
