/**
 * charaLiveStage.js
 *
 * 「キャラライブ」の描画層。charaLiveState.js が決めた状態を DOM に落とすだけ。
 *   判断(誰が喋るか/どの表情か/どこに浮かぶか)は **一切ここに書かない**。
 *   ここが薄いほど、3 年後に見た目を変えるのが安全になる。
 *
 * 構造:
 *   .nlcl-stage                 常駐レイヤー(pointer-events:none=配信の操作を邪魔しない)
 *     .nlcl-chara[data-chara]   1 体ぶん
 *       .nlcl-chara__img        立ち絵(表情差分を src 差し替え)
 *       .nlcl-chara__bubble     吹き出し(相槌/返事の時だけ出る)
 *       .nlcl-chara__think      シンキングの「…」(AI 思考中だけ出る)
 *
 * 設計上の約束:
 *   - 画像は 3 体 × 表情ぶんを **先読みして持っておく**。src を都度差し替えると
 *     初回だけ一瞬消える(ちらつき)ため、preload してブラウザキャッシュに載せる。
 *   - transform は 1 本にまとめて書く(translate/rotate/scale を別々に当てると上書き事故になる)。
 *   - prefers-reduced-motion を尊重する(既存 .nls-inline-loading と同じ方針)。
 */

import { CHARA_LIVE_MEMBERS, CHARA_LIVE_IDS } from './charaLiveState.js';
import { yukkuriCharacterImagePath } from './yukkuriBroadcastSummary.js';

/**
 * ★軽量サムネ(.thumb128)への解決。2026-08-25 の実害から。
 *
 * 当初フルサイズ(1500x1500)を 23 枚先読みしていた = **9.6MB を起動時に一括デコード**。
 * 展開後は 1500*1500*4byte ≒ 9MB/枚 で、23 枚なら約 200MB。
 * ユーザー報告「押したらすぐ起動していたのに反応が悪くなった」の主犯。
 * 既存 venueCharacterFrame.js が「画像は軽量な .thumb128 を使う(会場を重くしない)」と
 * 明記していたのに、それを無視していた。
 *
 * 実表示は 116px なので 1500px は完全な無駄。thumb128 は全 14 枚で 303KB(フルの 3%)。
 * thumb128 に無い表情は、見た目が最も近い実在サムネへ倒す(壊れ画像を絶対に出さない)。
 *
 * @type {Readonly<Record<string, string>>} フルパス → thumb128 パス
 */
const THUMB_FALLBACK = Object.freeze({
  // smile-mouth-closed の thumb は存在しない → 口を閉じた normal で代用。
  'link/link-yukkuri-smile-mouth-closed': 'link/link-yukkuri-normal-mouth-closed',
  'tanunee/tanuki-yukkuri-smile-mouth-closed': 'tanunee/tanuki-yukkuri-normal-mouth-closed',
  'konta/kitsune-yukkuri-smile-mouth-closed': 'konta/kitsune-yukkuri-normal',
  // blink-mouth-open / half-eyes-mouth-open の thumb は無い → 口を閉じた同表情へ。
  'link/link-yukkuri-blink-mouth-open': 'link/link-yukkuri-blink-mouth-closed',
  'konta/kitsune-yukkuri-blink-mouth-open': 'konta/kitsune-yukkuri-blink-mouth-closed',
  'tanunee/tanuki-yukkuri-blink-mouth-open': 'tanunee/tanuki-yukkuri-blink-mouth-closed',
  'link/link-yukkuri-half-eyes-mouth-open': 'link/link-yukkuri-half-eyes-mouth-closed',
  'konta/kitsune-yukkuri-half-eyes-mouth-open': 'konta/kitsune-yukkuri-half-eyes-mouth-closed',
  'tanunee/tanuki-yukkuri-half-eyes-mouth-open': 'tanunee/tanuki-yukkuri-half-eyes-mouth-closed',
  // konta は normal-mouth-open の実体が無い(fullでも) → smile-mouth-open で口を開ける。
  'konta/kitsune-yukkuri-normal-mouth-open': 'konta/kitsune-yukkuri-smile-mouth-open'
});

const IMG_BASE = 'images/yukkuri-charactore-english/';

/**
 * フルサイズのパスを、実在する軽量サムネ(.thumb128)へ解決する。
 *
 * @param {string} fullPath yukkuriCharacterImagePath の戻り値
 * @returns {string} .thumb128 のパス(実在するものだけを返す)
 */
export function toThumbPath(fullPath) {
  const rel = String(fullPath).startsWith(IMG_BASE)
    ? String(fullPath).slice(IMG_BASE.length)
    : String(fullPath);
  const stem = rel.replace(/\.png$/, '');
  const mapped = THUMB_FALLBACK[stem] || stem;
  return `${IMG_BASE}${mapped}.thumb128.png`;
}

/** 立ち絵の一辺(px)。会場の邪魔をしない大きさ。 */
export const CHARA_LIVE_SIZE_PX = 116;

/**
 * 先読みすべき画像パスの一覧。
 *
 * 実際に使う組み合わせだけに絞る(全 24 通りは要らない):
 *   表情 normal/smile/blink/half-eyes × 口 open/closed。
 * konta の normal は単独ファイルに落ちるので重複が出る→ Set で潰す。
 *
 * @returns {string[]} 拡張ルート相対パス(重複なし)
 */
export function listCharaLiveImagePaths() {
  /** @type {Set<string>} */
  const out = new Set();
  for (const id of CHARA_LIVE_IDS) {
    for (const expression of /** @type {const} */ (['normal', 'smile', 'blink', 'half-eyes'])) {
      for (const mouthOpen of [false, true]) {
        out.add(toThumbPath(yukkuriCharacterImagePath(id, expression, mouthOpen)));
      }
    }
  }
  return [...out];
}

/**
 * 常駐レイヤーの CSS。既存 .nls-inline-loading の作法(丸く白抜き+濃い縁+硬い影)を踏襲して、
 * 拡張全体で「同じキャラ表現」に見えるようにする。
 *
 * @returns {string}
 */
export function charaLiveStageCss() {
  return `
.nlcl-stage {
  /*
   * ★会場ステージ(.nlsb-stage)の内側に入る前提の配置(2026-08-25 実機で踏んだ)。
   *   当初 body 直下に fixed + z-index:2147483000 で置いたが、会場ルート(.nlsb-root)が
   *   まったく同じ z-index の全画面要素で、かつ後から DOM に入るため【完全に覆われて
   *   一度も見えなかった】。同値 z-index は DOM 順で後勝ちになる。
   *   会場の既存階層(客席 z4 / 吹き出し z5 / 常駐・roster z6 / 投げ物 z7)。
   *
   * ★z6 も間違いだった(2回目の同じ失敗・2026-08-25):
   *   stage.append(stageLayout, bubbleLayer, rosterPanel, ...) は startCharaLive より
   *   先に実行されるので、【同じ z6 の rosterPanel より DOM順で前】に置かれてしまい、
   *   また負けた(venueBar.js:2711 のコメントが「stage.appendの最後に置くことで同z-index(6)
   *   の常駐レイヤーより手前に来る」と明言している＝先に入る側は負ける)。
   *   実測: 会場内で使われている z-index の最大は 7(投げ物)。よって 8 で最前面を取る。
   *   ★「最大値を名乗る」でも「既存に合わせる」でもなく【実測して1つ上】が正解。
   */
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 8;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  /* 配信の操作を絶対に奪わない。吹き出しも含めて素通し。 */
  pointer-events: none;
  /* 親の文字設定に引きずられない(ニコ生ページに寄生するため)。 */
  font: 13px/1.5 system-ui, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
}
.nlcl-chara {
  position: relative;
  width: ${CHARA_LIVE_SIZE_PX}px;
  height: ${CHARA_LIVE_SIZE_PX}px;
  /* transform の原点を足元に。浮遊しても「立っている」感じが崩れない。 */
  transform-origin: 50% 90%;
  will-change: transform;
}
.nlcl-chara__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  /* 立ち絵を背景から浮かせる(配信映像の上でも輪郭が見える)。 */
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45));
  -webkit-user-select: none;
  user-select: none;
}
/* 喋っている子を少し持ち上げて前に出す(誰が喋ったか一目で分かる)。 */
.nlcl-chara.is-speaking { z-index: 2; }
.nlcl-chara.is-speaking .nlcl-chara__img {
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.5));
}
.nlcl-chara__bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  max-width: 190px;
  width: max-content;
  padding: 6px 10px;
  border-radius: 12px;
  background: #fffdf7;
  color: #23303f;
  border: 2px solid #2f3a46;
  box-shadow: 2px 2px 0 rgba(47, 58, 70, 0.9);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
  /* 長文でも会場を覆わない。3 行で切る。 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  animation: nlcl-pop 160ms ease-out;
}
/* 吹き出しのしっぽ。 */
.nlcl-chara__bubble::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -6px;
  border: 6px solid transparent;
  border-top-color: #2f3a46;
}
.nlcl-chara__name {
  display: block;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.7;
  margin-bottom: 1px;
}
/* シンキングの「…」。考えている間だけ出る。 */
.nlcl-chara__think {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 7px 11px;
  border-radius: 999px;
  background: #fffdf7;
  border: 2px solid #2f3a46;
  box-shadow: 2px 2px 0 rgba(47, 58, 70, 0.9);
}
.nlcl-chara__think i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4b5b6b;
  animation: nlcl-think 1.25s ease-in-out infinite;
}
.nlcl-chara__think i:nth-child(2) { animation-delay: 0.18s; }
.nlcl-chara__think i:nth-child(3) { animation-delay: 0.36s; }
/* ★hidden を必ず効かせる(2026-08-25 発見のバグ):
   display:flex は hidden 属性の既定 display:none に勝ってしまうため、
   setVisible(false) しても隠れない。明示的に打ち消す。 */
.nlcl-stage[hidden] { display: none; }
@keyframes nlcl-pop {
  from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.94); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
}
@keyframes nlcl-think {
  0%, 100% { opacity: 0.28; transform: translateY(0); }
  50%      { opacity: 1;    transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .nlcl-chara__bubble { animation: none; }
  .nlcl-chara__think i { animation: none; opacity: 0.7; }
}
`.trim();
}

/**
 * 常駐レイヤーの DOM を作る(まだ動かさない)。
 *
 * @param {Document} doc
 * @param {(path: string) => string} resolveUrl chrome.runtime.getURL 相当(テストで差し替え可能に)
 * @returns {{
 *   root: HTMLElement,
 *   nodes: Record<string, { el: HTMLElement, img: HTMLImageElement, bubble: HTMLElement, think: HTMLElement }>
 * }}
 */
export function buildCharaLiveStageDom(doc, resolveUrl) {
  const root = doc.createElement('div');
  root.className = 'nlcl-stage';
  // 読み上げと同じ内容を SR にも届ける。会話が流れるので polite(割り込まない)。
  root.setAttribute('aria-live', 'polite');

  /** @type {any} */
  const nodes = {};
  for (const member of CHARA_LIVE_MEMBERS) {
    const el = doc.createElement('div');
    el.className = 'nlcl-chara';
    el.dataset.chara = member.id;

    const img = doc.createElement('img');
    img.className = 'nlcl-chara__img';
    img.alt = member.displayName;
    img.decoding = 'async';
    img.src = resolveUrl(toThumbPath(yukkuriCharacterImagePath(member.id, 'normal', false)));

    const bubble = doc.createElement('div');
    bubble.className = 'nlcl-chara__bubble';
    bubble.hidden = true;

    const think = doc.createElement('div');
    think.className = 'nlcl-chara__think';
    think.hidden = true;
    // 「…」の 3 点。装飾なので SR からは隠す。
    think.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) think.appendChild(doc.createElement('i'));

    el.append(img, bubble, think);
    root.appendChild(el);
    nodes[member.id] = { el, img, bubble, think };
  }
  return { root, nodes };
}

/**
 * 1 フレームぶんを DOM に反映する。
 *
 * ちらつき対策として **変わった時だけ書く**(src/textContent/hidden の無駄な代入をしない)。
 * DOM 書き込みは再レイアウトを誘発するので、毎フレーム 3 体ぶん無条件に書くと重くなる。
 *
 * @param {ReturnType<typeof buildCharaLiveStageDom>['nodes']} nodes
 * @param {ReturnType<typeof import('./charaLiveState.js').buildCharaLiveRenderModel>} model
 * @param {(path: string) => string} resolveUrl
 * @returns {void}
 */
export function applyCharaLiveFrame(nodes, model, resolveUrl) {
  for (const item of model) {
    const node = nodes?.[item.charaId];
    if (!node) continue;

    // ① 立ち絵(表情+口)。src は変化時のみ差し替える。
    const nextSrc = resolveUrl(toThumbPath(item.imagePath));
    if (node.img.getAttribute('src') !== nextSrc) {
      node.img.setAttribute('src', nextSrc);
    }

    // ② 位置と姿勢。1 本の transform にまとめる(個別指定の上書き事故を防ぐ)。
    const { x, y, rotateDeg, scale } = item.float;
    const speaking = item.mode === 'react' || item.mode === 'answer';
    // 喋っている子はほんの少し大きく前に出す。
    const emphasise = speaking ? 1.06 : 1;
    const transform =
      `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
      `rotate(${(rotateDeg + item.tiltDeg).toFixed(2)}deg) ` +
      `scale(${(scale * emphasise).toFixed(4)})`;
    if (node.el.style.transform !== transform) {
      node.el.style.transform = transform;
    }
    if (node.el.classList.contains('is-speaking') !== speaking) {
      node.el.classList.toggle('is-speaking', speaking);
    }

    // ③ 吹き出し(相槌/返事の本文があるときだけ)。
    const showBubble = speaking && !!item.text;
    if (showBubble) {
      // 名前 + 本文。textContent 経由なので HTML 混入の余地は無い。
      if (node.bubble.dataset.text !== item.text) {
        node.bubble.textContent = '';
        const name = node.bubble.ownerDocument.createElement('b');
        name.className = 'nlcl-chara__name';
        name.textContent = item.displayName;
        node.bubble.append(name, node.bubble.ownerDocument.createTextNode(item.text));
        node.bubble.dataset.text = item.text;
      }
      if (node.bubble.hidden) node.bubble.hidden = false;
    } else if (!node.bubble.hidden) {
      node.bubble.hidden = true;
      delete node.bubble.dataset.text;
    }

    // ④ シンキングの「…」。
    const showThink = item.mode === 'thinking';
    if (node.think.hidden === showThink) node.think.hidden = !showThink;
  }
}

/**
 * 画像を先読みする。表情が初めて出る瞬間のちらつきを消す。
 *
 * @param {Document} doc
 * @param {(path: string) => string} resolveUrl
 * @returns {HTMLImageElement[]} 参照を保持するための配列(GC で捨てられないように呼び出し側が持つ)
 */
export function preloadCharaLiveImages(doc, resolveUrl) {
  return listCharaLiveImagePaths().map((path) => {
    const img = doc.createElement('img');
    img.decoding = 'async';
    img.src = resolveUrl(path);
    return img;
  });
}
