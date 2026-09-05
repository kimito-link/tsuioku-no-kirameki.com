/**
 * charaLiveController.js
 *
 * 「キャラライブ」の配線係。charaLiveState(判断) と charaLiveStage(描画) を繋ぎ、
 *   実際のイベント源(読み上げ・配信者の呼びかけ・AI 思考)に接続する。
 *
 * ここが持つ唯一の責務は **タイミング**:
 *   - 毎フレーム描く(rAF)
 *   - 「いつ」相槌を入れるか = 読み上げが本当に鳴った瞬間(onAudioStart)
 *   - 「いつ」黙るか       = 読み上げが終わった瞬間(onAudioEnd)
 *
 * ★相槌を「コメントが届いた瞬間」でなく「読み上げが鳴った瞬間」に出すのが肝。
 *   届いた瞬間に出すと、読み上げキューが詰まっている時に **声より先にキャラが相槌を打つ**
 *   (聞く前に頷く)ことになり、露骨に嘘くさくなる。voicePlayer は v0.1.799 で
 *   onAudioStart(本当に audio.play() が走った時だけ)/ onAudioEnd / onDropped(鳴らず破棄)
 *   を出せるようになっているので、それに乗る。
 *   ※onPlayStart は「再生でも破棄でも鳴る」曖昧な信号なので **使わない**。
 *
 * DOM/chrome への依存は注入で受ける(テスト可能に保つ)。
 */

import {
  makeInitialCharaLiveState,
  expireCharaModes,
  triggerCharaReaction,
  triggerCharaAnswer,
  startCharaThinking,
  endCharaThinking,
  buildCharaLiveRenderModel,
  REACT_MIN_MS
} from './charaLiveState.js';
import {
  buildCharaLiveStageDom,
  applyCharaLiveFrame,
  charaLiveStageCss,
  preloadCharaLiveImages
} from './charaLiveStage.js';

/** 相槌のあいづち文例。読み上げ内容に依存しない短い反応(AI 不要で常に動く土台)。 */
export const CHARA_BACKCHANNELS = Object.freeze([
  'うんうん',
  'なるほど〜',
  'たしかに',
  'わかる',
  'おお〜',
  'それな',
  'いいね！',
  'ふむふむ'
]);

/** 描画の目標 fps。18fps は venueBar の群衆アニメと同じ(会場を重くしない実績値)。 */
export const CHARA_LIVE_FPS = 18;

/** 描画の最小間隔(ms)。rAF が 60fps で来ても、これ未満の間隔では描き直さない。 */
export const FRAME_MIN_GAP_MS = Math.round(1000 / CHARA_LIVE_FPS);

/**
 * 相槌の間引き。全部のコメントに反応すると、コメントが速い放送で
 * 3 体が喋りっぱなしになり「ざわめき」でなく「うるさい」になる。
 * 直前の相槌からこの時間が経つまでは新しい相槌を出さない。
 */
export const REACTION_MIN_GAP_MS = 2600;

/**
 * キャラライブを起動する。
 *
 * @param {{
 *   doc: Document,
 *   mount?: HTMLElement|null,
 *   resolveUrl: (path: string) => string,
 *   now?: () => number,
 *   requestFrame?: (cb: FrameRequestCallback) => number,
 *   cancelFrame?: (id: number) => void,
 *   getHeatLevel?: () => number,
 *   reducedMotion?: boolean,
 *   backchannels?: readonly string[]
 * }} deps
 * @returns {{
 *   root: HTMLElement,
 *   preloadedImages: HTMLImageElement[],
 *   setVisible: (next: boolean) => void,
 *   onCommentSpoken: (input: { commentKey: string, text?: string }) => void,
 *   onCommentSpokenEnd: () => void,
 *   onStreamerAddressed: (input: { prompt: string, answer?: string, durationMs?: number }) => string,
 *   beginThinking: (input?: { prompt?: string, charaId?: string|null }) => string,
 *   endThinking: (input?: { charaId?: string|null }) => string[],
 *   destroy: () => void
 * }}
 */
export function startCharaLive(deps) {
  const doc = deps.doc;
  const resolveUrl =
    typeof deps.resolveUrl === 'function' ? deps.resolveUrl : (/** @type {string} */ p) => p;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  /*
   * ★既定は必ず requestAnimationFrame(2026-08-25 の実害):
   *   既定を setTimeout にしていたため、venueBar から requestFrame を渡していない本番では
   *   【タブが背面でも止まらない・ブラウザの間引きも効かない】タイマーが回り続け、
   *   ユーザー報告「押したらすぐ起動していたのに反応が悪くなった」の一因になった。
   *   rAF ならタブが隠れれば自動で止まり、描画と歩調も合う。
   */
  const view = doc.defaultView;
  const raf =
    typeof deps.requestFrame === 'function'
      ? deps.requestFrame
      : typeof view?.requestAnimationFrame === 'function'
        ? view.requestAnimationFrame.bind(view)
        : (/** @type {FrameRequestCallback} */ cb) =>
            /** @type {any} */ (setTimeout(() => cb(now()), Math.round(1000 / CHARA_LIVE_FPS)));
  const caf =
    typeof deps.cancelFrame === 'function'
      ? deps.cancelFrame
      : typeof view?.cancelAnimationFrame === 'function'
        ? view.cancelAnimationFrame.bind(view)
        : (/** @type {number} */ id) => clearTimeout(id);
  const getHeat = typeof deps.getHeatLevel === 'function' ? deps.getHeatLevel : () => 0;
  const backchannels =
    Array.isArray(deps.backchannels) && deps.backchannels.length
      ? deps.backchannels
      : CHARA_BACKCHANNELS;

  const reducedMotion =
    typeof deps.reducedMotion === 'boolean'
      ? deps.reducedMotion
      : typeof doc.defaultView?.matchMedia === 'function' &&
        doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;


  // ---- CSS を 1 回だけ入れる ------------------------------------------------
  const STYLE_ID = 'nlcl-stage-style';
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = charaLiveStageCss();
    (doc.head || doc.documentElement).appendChild(style);
  }

  const { root, nodes } = buildCharaLiveStageDom(doc, resolveUrl);
  (deps.mount || doc.body || doc.documentElement).appendChild(root);

  // 表情差分を先読み(初回のちらつき防止)。
  // ★参照を捨てると GC でデコード結果ごと回収され、先読みの意味が消える。
  //   下の戻り値(preloadedImages)に載せて、呼び出し側が生かし続ける形にする。
  const preloadedImages = preloadCharaLiveImages(doc, resolveUrl);

  const state = makeInitialCharaLiveState();
  let lastReactionAt = -Infinity;
  // 会場を閉じている間は描かない(rAF を回し続けると閉じても CPU を食う)。
  let visible = true;
  // 描画の間引き用(最後に実際に描いた時刻)。
  let lastDrawMs = -Infinity;
  // 状態が変わった直後は間引きを1回だけ飛ばして即描く(反応の鈍さを出さない)。
  let needsImmediateDraw = false;
  /** 読み上げ中の相槌担当。onAudioEnd で黙らせるために覚えておく。 */
  let speakingChara = /** @type {import('./charaLiveState.js').CharaId|null} */ (null);
  let frameId = 0;
  let destroyed = false;

  // ---- 毎フレーム ----------------------------------------------------------
  const tick = () => {
    if (destroyed) return;
    // 非表示なら次のフレームを予約せずに抜ける(setVisible(true) が再開させる)。
    if (!visible) {
      frameId = 0;
      return;
    }
    const t = now();
    // ★rAF は毎秒60回来る。会場を重くしないため描画は約18fpsに間引く
    //   (群衆canvasと同じ方針)。間引いても浮遊は滑らかに見える。
    //   ただし相槌/返事/思考が入った直後だけは即座に描く(反応が鈍く見えないように)。
    if (!needsImmediateDraw && t - lastDrawMs < FRAME_MIN_GAP_MS) {
      frameId = raf(tick);
      return;
    }
    needsImmediateDraw = false;
    lastDrawMs = t;
    expireCharaModes(state, t);
    const model = buildCharaLiveRenderModel(state, {
      timeMs: t,
      heatLevel: getHeat(),
      reducedMotion
    });
    applyCharaLiveFrame(nodes, model, resolveUrl);
    frameId = raf(tick);
  };
  frameId = raf(tick);

  return {
    root,
    /** 先読み画像。GC 回収を防ぐために参照を公開して保持する(見た目には使わない)。 */
    preloadedImages,

    /**
     * 表示/非表示。会場を閉じている間は描画を止める(閉じても CPU を食い続けない)。
     * destroy と違い、再び true にすれば同じ状態から復帰する。
     * @param {boolean} next
     */
    setVisible(next) {
      const on = next !== false;
      if (on === visible) return;
      visible = on;
      root.hidden = !on;
      if (on && !frameId && !destroyed) {
        frameId = raf(tick);
      }
    },

    /**
     * コメントの読み上げが **実際に鳴り始めた** ときに呼ぶ(voicePlayer の onAudioStart)。
     * 3 体のうち 1 体が相槌を入れる。
     *
     * @param {{ commentKey: string, text?: string }} input
     */
    onCommentSpoken(input) {
      const t = now();
      // 間引き: 直前の相槌から十分空いていなければ黙っている(全部に反応しない)。
      if (t - lastReactionAt < REACTION_MIN_GAP_MS) return;
      const key = String(input?.commentKey ?? '');
      // 相槌の文面は commentKey で決定論的に選ぶ(同じコメントなら毎回同じ=テスト可能)。
      const idx = Math.abs(hashForPick(key)) % backchannels.length;
      const who = triggerCharaReaction(state, {
        commentKey: key,
        text: backchannels[idx],
        nowMs: t,
        // 読み上げが終わるまで相槌を出し続けたいので長めに取り、onAudioEnd で早めに畳む。
        durationMs: Math.max(REACT_MIN_MS, 6000)
      });
      if (who) {
        lastReactionAt = t;
        speakingChara = who;
        needsImmediateDraw = true;
      }
    },

    /**
     * 読み上げが終わった/破棄されたときに呼ぶ(onAudioEnd / onDropped)。
     * 相槌を畳んで idle に戻す。声が止まっているのに口が動き続ける事故を防ぐ。
     */
    onCommentSpokenEnd() {
      if (!speakingChara) return;
      const slot = state.slots[speakingChara];
      // 返事(answer)や思考(thinking)に化けていたら触らない=別の意図を潰さない。
      if (slot && slot.mode === 'react') {
        slot.untilMs = now();
        needsImmediateDraw = true;
      }
      speakingChara = null;
    },

    /**
     * 配信者が「〇〇さん、〇〇だよね」と話しかけたときに呼ぶ。
     * 名指しがあればその子が、無ければ誰かが答える。
     *
     * @param {{ prompt: string, answer?: string, durationMs?: number }} input
     * @returns {string} 答える子の id
     */
    onStreamerAddressed(input) {
      needsImmediateDraw = true;
      return triggerCharaAnswer(state, {
        prompt: String(input?.prompt ?? ''),
        answer: String(input?.answer ?? ''),
        nowMs: now(),
        durationMs: input?.durationMs
      });
    },

    /**
     * AI が考え始めたときに呼ぶ。返り値の id を endThinking に渡すと確実に閉じられる。
     * @param {{ prompt?: string, charaId?: string|null }} [input]
     * @returns {string}
     */
    beginThinking(input = {}) {
      needsImmediateDraw = true;
      return startCharaThinking(state, {
        nowMs: now(),
        prompt: input.prompt,
        charaId: /** @type {any} */ (input.charaId ?? null)
      });
    },

    /**
     * AI の思考が終わったときに呼ぶ。**必ず finally で呼ぶこと**
     * (例外で抜けると考え込んだまま固まる)。
     * @param {{ charaId?: string|null }} [input]
     * @returns {string[]}
     */
    endThinking(input = {}) {
      needsImmediateDraw = true;
      return endCharaThinking(state, {
        nowMs: now(),
        charaId: /** @type {any} */ (input.charaId ?? null)
      });
    },

    destroy() {
      destroyed = true;
      if (frameId) caf(frameId);
      frameId = 0;
      root.remove();
    }
  };
}

/**
 * 文字列→符号付き整数。相槌の文面選びにだけ使う軽いハッシュ。
 * @param {string} s
 * @returns {number}
 */
function hashForPick(s) {
  let h = 0;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  }
  return h;
}
