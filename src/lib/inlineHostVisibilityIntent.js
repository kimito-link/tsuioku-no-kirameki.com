/**
 * 応援パネル(inline host)を「見せる/消す」1回分の指示を組み立てる純関数。
 * DOM は一切触らない。値を決めるだけ。
 *
 * ★v0.1.1255 の動機(2026-08-04・会議の結論に沿った Phase A):
 *   本日の事故4件はすべて【副作用層】で起きた(純ロジックは毎回正しかった)。
 *   会議(4体・独立に同結論)の指示は「ディレクトリ移動より先に副作用を正本化せよ」。
 *   その最初の対象が、最も事故が集中した「パネルを見せる/消す」操作。
 *
 * ■ 何が問題だったか
 *   「見せる」という1つの操作が、実際には4行に分かれていた:
 *     host.style.pointerEvents = 'auto';
 *     host.setAttribute('aria-hidden', 'false');
 *     setInlineHostDisplay(host, 'block', 'xxx_show');  // ← ここだけ集約済み
 *     host.style.opacity = '1';                          // ← ここが漏れていた
 *
 *   消す側(content-entry.js:5652)には既にこの問題を証言するコメントがあった:
 *     「display:none のみ残すと pointerEvents/opacity が中途半端に残り、
 *       次回ツールバー直後の前面化判定やヒット領域が不安定になることがある」
 *
 *   つまり「片方だけ書いて中途半端になる」は既知の地雷だったのに、
 *   書く場所が分かれたままだったので防ぎようが無かった。
 *
 * ■ なぜ純関数に切り出すか
 *   「見せるとき/消すときに、どの値の組になるべきか」をテストで固定できる。
 *   値をセットで検証すれば、片方だけ書き換える変異が必ず赤になる。
 *   ([[wiring-test-must-assert-counts-2026-08-04]] と同じ発想を値の側でやる)
 *
 * ■ ★この関数を使ってはいけない場所(重要)
 *   `display` を触らない reveal 経路
 *   (content-entry.js:3697 attachInlineIframeRevealFallback / 3832 same-src 再入)
 *   には使わないこと。あちらは「iframe の準備ができたので透明度だけ戻す」処理で、
 *   display は意図的に触っていない。ここで display:'block' を書くと
 *   【意図的に消されている状態を勝手に復活させる】= v0.1.1250 の逆向きの事故になる。
 */

/**
 * 見せる/消す1回分の指示。
 * @typedef {{
 *   display: 'block'|'none',
 *   opacity: '1'|'0',
 *   pointerEvents: 'auto'|'none',
 *   ariaHidden: 'false'|'true',
 *   hiddenAttr: '1'|null,
 *   cause: string
 * }} InlineHostVisibilityIntent
 */

/**
 * 「見せる/消す」の値の組を決める。★必ずセットで返す(片方だけ返さない)。
 *
 * @param {{ visible?: unknown, cause?: unknown }} args
 * @returns {InlineHostVisibilityIntent}
 */
export function buildInlineHostVisibilityIntent(args) {
  // visible は明示的な true のときだけ「見せる」。曖昧な値は消す側(安全側)へ倒す。
  //   ※「見せるつもりが消える」より「消すつもりが見える」方が、
  //     ユーザーにとって被害が小さい…とは限らないが、
  //     v0.1.1250 の事故(消えたまま戻らない)を踏まえ、
  //     ここは呼び出し側に明示を強制する形にする(暗黙の true を作らない)。
  const visible = args?.visible === true;
  return {
    display: visible ? 'block' : 'none',
    opacity: visible ? '1' : '0',
    pointerEvents: visible ? 'auto' : 'none',
    ariaHidden: visible ? 'false' : 'true',
    // ★v0.1.1266: 「消えている」の正本は【属性】(data-nls-hidden)であって
    //   インラインスタイルではない。理由は buildInlineHostHiddenAttrIntent を参照。
    hiddenAttr: visible ? null : '1',
    cause: String(args?.cause || '')
  };
}

/**
 * host が「今おおやけに消えているか」を属性の有無だけで判定する。
 *
 * ★v0.1.1266 の動機(2026-08-05・実測で確定):
 *   消えた瞬間の実測値が【CSS 既定値と完全に一致】した:
 *     実測  : display:none / opacity:0 / visibility:visible / connected:true
 *     CSS既定: #nls-inline-popup-host { display:none; opacity:0 }
 *   同時に計器は全部 0 だった(hostFlipCensus=0 / hostStyleTrace=0 / connected=true)。
 *   = 誰も「消して」いない。インラインの上書きが失われて CSS 既定に戻っているだけ。
 *
 * ■ だから犯人探しをやめて「消えない構造」にする
 *   インラインスタイルは失われうる(誰が落としているか特定できなかった)。
 *   ならばインラインに依存するのをやめる:
 *     CSS 既定を display:block にし、消したいときだけ属性を付ける。
 *   こうすると【インラインが失われても既定は "見えている"】ので、
 *   上書きの消失は「勝手に消える」ではなく無害な no-op になる。
 *
 * @param {HTMLElement|null|undefined} host
 * @returns {boolean} true=属性により消されている
 */
export function isInlineHostHiddenByAttr(host) {
  try {
    return host?.getAttribute?.(INLINE_HOST_HIDDEN_ATTR) === '1';
  } catch {
    return false;
  }
}

/** 消えている状態を表す属性名(CSS 側のセレクタと必ず一致させること)。 */
export const INLINE_HOST_HIDDEN_ATTR = 'data-nls-hidden';

/**
 * 指示どおりの状態に既になっているか(＝書く必要が無いか)を判定する。
 *
 * ★既存 setInlineHostDisplay の `prev === display なら計上しない` と同じ思想。
 *   計器を水増ししないために、状態が変わるときだけ書く/数えることが要る。
 *   (2026-08-04、計器の値を信じて2日間誤診した反省)
 *
 * @param {{ display?: unknown, opacity?: unknown, pointerEvents?: unknown }} current
 * @param {InlineHostVisibilityIntent} intent
 * @returns {boolean} true=既に同じ状態=書かなくてよい
 */
export function isInlineHostVisibilityUnchanged(current, intent) {
  if (!current || !intent) return false;
  return (
    String(current.display || '') === intent.display &&
    String(current.opacity || '') === intent.opacity &&
    String(current.pointerEvents || '') === intent.pointerEvents
  );
}
