/**
 * sidepanelIframeReveal.js — iframe を【出来上がってから見せる】ための純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18 ユーザー:「黒い幕がでなくなるまでやって」)
 *   サイドパネルを開く瞬間に真っ黒(ダークでは灰色の横縞つき)が見える。
 *
 * ■ ★真因(世界調査でCSS仕様レベルまで確定・推測ではない)
 *   iframe は src が commit されるまで【initial about:blank】状態で存在する。
 *   この文書は色スキーム情報を持たないため、CSS Color Adjust L1 の
 *   「親と色スキームが食い違う」条件に合致し、UAが【不透明キャンバス】
 *   (OSがダークなら黒系)を敷く。
 *   ★W3C CSSWG は2024年2月に「initial about:blank は常に透明にする」と決議し、
 *     その理由を【作者にはコントロールできず、ちらつきを引き起こすため】と
 *     明記している = 作者側の小細工では消せないと仕様側が認定している。
 *
 * ■ ★なぜ「色を宣言する」方式ではダメだったか(このリポの実績)
 *   meta color-scheme / html インライン style / iframe への background+color-scheme
 *   という世界標準の3手は【すべて実装済み】。それでも v0.1.1279〜1423 の
 *   12版・200行を費やして一度も消えなかった。
 *   ＝「画面に出ている iframe を白く塗ろうとする」方向は行き止まり。
 *
 * ■ ★この実装の考え方(会議のラテラルシンキングで出た第三の道)
 *   黒が出るのは【画面に出ている iframe が about:blank の間】。
 *   ならば その間だけ iframe を画面から外せば、黒は見えようがない。
 *     1. iframe を hidden(display:none 相当)で読み込ませる
 *     2. load 完了 = 中身が出来た時点で表示に切り替える
 *   ★実測: 非表示のまま読み込み91ms、表示に切り替えた瞬間には既に
 *     クリーム色(rgb(255,250,242))が付いていた = 黒の期間は画面に無い。
 *
 * ■ ★絶対に守ること(退化させない)
 *   - load が来ない/JSが落ちる場合でも【必ず表示に戻す】。
 *     さもないと「黒」が「真っ白で何も出ない」に変わるだけ = より悪い退化。
 *     そのための保険が REVEAL_FALLBACK_MS。
 *   - このリポは「描画を JS に依存させない」方針
 *     (sidepanel-entry.js 冒頭)。だから【隠すのも JS から】行う。
 *     HTML 側で hidden にすると、JS が動かない環境で永久に真っ白になる。
 *
 * @module sidepanelIframeReveal
 */

/**
 * ★保険のしきい値(ms)。load が来なくてもこの時間で必ず見せる。
 *   実測の読み込みは91msだったので、その約10倍を上限に置く。
 *   ここを長くすると「白いまま待つ」時間が伸びる = 体感が悪化するので伸ばさない。
 */
export const REVEAL_FALLBACK_MS = 1200;

/** 隠している間に付けるクラス名(CSS 側と一致させる)。 */
export const HIDDEN_CLASS = 'nl-ifr-loading';

/**
 * 「いま隠してよいか」を判定する。
 *
 * ★隠してよいのは【これから読み込む】ときだけ。
 *   既に中身が出来ている iframe を隠すと、画面が一度消えてから戻る
 *   = ちらつきを自分で作ることになる。
 *
 * @param {{
 *   hasIframe?: boolean,
 *   alreadyLoaded?: boolean,
 *   supportsHiding?: boolean
 * }} ctx
 * @returns {boolean}
 */
export function shouldHideUntilReady(ctx) {
  if (!ctx || typeof ctx !== 'object') return false;
  if (ctx.hasIframe !== true) return false;
  // ★既に読み終わっているなら隠さない(消えてから戻る=自作のちらつき)
  if (ctx.alreadyLoaded === true) return false;
  // ★classList などが使えない環境では触らない(素のまま表示される方が安全)
  if (ctx.supportsHiding === false) return false;
  return true;
}

/**
 * 表示に戻す理由を決める。★構造で返す(文字列に閉じない)
 * [[judgement-trapped-in-a-string-2026-08-15]]
 *
 * @param {{ loaded?: boolean, timedOut?: boolean, errored?: boolean }} ev
 * @returns {{ reveal: boolean, reason: 'load'|'timeout'|'error'|'none' }}
 */
export function decideReveal(ev) {
  if (!ev || typeof ev !== 'object') return { reveal: false, reason: 'none' };
  // ★どの理由でも「見せる」に倒す。見せない分岐を作らない(白紙固着の防止)。
  if (ev.loaded === true) return { reveal: true, reason: 'load' };
  if (ev.errored === true) return { reveal: true, reason: 'error' };
  if (ev.timedOut === true) return { reveal: true, reason: 'timeout' };
  return { reveal: false, reason: 'none' };
}
