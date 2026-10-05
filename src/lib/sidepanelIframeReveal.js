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
 * ■ ★実機で分かったこと(2026-08-18・ここを誤ると退化する)
 *   1. このモジュールの JS だけでは【戻せないことがある】。
 *      パネルは 2.3MB のバンドルを読む間イベントループが止まるので、
 *      load ハンドラも setTimeout も発火できない
 *      [[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]]。
 *      ★だから【CSS アニメーションの保険を sidepanel.html 側に置いている】。
 *      この JS は【早く開けるときだけ早く開ける】役割に降格している。
 *   2. 隔すのは opacity。透明の間は親(sidepanel.html)のクリーム色が透ける。
 *      実測: 透明にした状態で親の色を読むと rgb(255,250,242)。
 *      ★つまり黒の代わりにクリーム色が見える(穴にはならない)。
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
export const REVEAL_FALLBACK_MS = 1500;

/**
 * ★v0.1.1561: load から【中身の初回描画】を待つ猶予(ms)。
 *   load では見せず、中身が初めて描かれた合図(paint entry)で見せる。
 *   ■ なぜ(2026-10-05 実測・devtools Chrome・lv342383970)
 *     load(739ms)→中身の first-paint(1,104ms)の【365ms】、iframe は見えているのに
 *     中身がまだ一度も描かれておらず、直前の about:blank の暗いフレームが残る。
 *     これが「押した瞬間の黒」。速い回でも 53ms(3フレーム)あった。
 *     ＝ load は「中身が出来た」ではなく「HTML を読み終えた」に過ぎない。
 *   描画の合図が来なくてもこの猶予で必ず見せる(白紙固着の防止)。
 *   ★iframe を opacity:0 で隠していた間は、中身の描画が【見せた後】まで後回しにされ、
 *     この猶予がいくつでも黒い 2〜3 フレームが残った(2026-10-05 実測)。v0.1.1561 で隠し方を
 *     「上に覆いを置く」に変えたので、中身は覆いの下で描かれ、load 時点で paint entry が揃っている
 *     のが通常。この猶予は「paint entry が取れない環境」のための保険。
 */
export const REVEAL_AFTER_LOAD_GRACE_MS = 600;

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
 * ★v0.1.1561: `loaded` だけでは見せない(load→初回描画の隙間が黒の正体・上の定数の説明)。
 *   見せる合図は painted(中身が描かれた) / loadGraceElapsed(load から猶予が過ぎた) /
 *   errored / timedOut の 4 つ。どれかが来れば必ず見せる(見せない分岐は『まだ何も来ていない』だけ)。
 *
 * @param {{ loaded?: boolean, painted?: boolean, loadGraceElapsed?: boolean, timedOut?: boolean, errored?: boolean }} ev
 * @returns {{ reveal: boolean, reason: 'paint'|'load-grace'|'timeout'|'error'|'wait-paint'|'none' }}
 */
export function decideReveal(ev) {
  if (!ev || typeof ev !== 'object') return { reveal: false, reason: 'none' };
  if (ev.painted === true) return { reveal: true, reason: 'paint' };
  if (ev.errored === true) return { reveal: true, reason: 'error' };
  if (ev.timedOut === true) return { reveal: true, reason: 'timeout' };
  if (ev.loadGraceElapsed === true) return { reveal: true, reason: 'load-grace' };
  // load だけ=まだ中身が描かれていない。猶予(REVEAL_AFTER_LOAD_GRACE_MS)か描画の合図を待つ。
  if (ev.loaded === true) return { reveal: false, reason: 'wait-paint' };
  return { reveal: false, reason: 'none' };
}
