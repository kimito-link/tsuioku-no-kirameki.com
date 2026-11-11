/**
 * 会場モードの「ピックアップ枠」(BSP風・v0.1.1230)。
 *
 * 【なぜ会場に出すか】
 * v0.1.1226〜1228 でピックアップ選定は動くようになった(実測 scored>0)。しかし出し先が
 * ①POP の `nl-comment-ticker`(「応援 N コメント」の右)で、**会場モードを見ている間は
 * スクロールの外にあって目に入らない**。ユーザー報告「見ため変わってないかも」の正体。
 * 「埋もれるコメントを拾う」のが目的なのに、拾った先がまた埋もれていた。
 *
 * 参照した実物: ニコ生のBSP(バックステージパス)の特別コメント枠
 *   = 画面下に色付きの帯で、流れずに「留まる」1枠。
 *
 * 【設計】
 * - 会場ヘッダーの直下に**常設の1枠**を置く。DOM は一度作ったら remove しない
 *   (churn 地雷対策の流儀に倣う)。中身の差し替えだけで進行する。
 * - **高さを先に確保**する(min-height)。出たり消えたりで下の段が動かない。
 * - 空のときも枠は残し、案内文を出す(死に画面にしない)。
 *
 * @module venuePickupBanner
 */

/** 枠のCSSクラス。見た目は VENUE_PICKUP_CSS(会場の CSS へ差し込む)。 */
export const VENUE_PICKUP_CLASS = 'nlsb-pickup';

/** 吹き出しの上限・下限。親要素の幅ではなく窓(vw)で決める。ニコ生・YouTube・ABEMA で同じ。 */
export const VENUE_PICKUP_MAX_PX = 860;
export const VENUE_PICKUP_MIN_PX = 320;
export const VENUE_PICKUP_VW_GUTTER = 32;
/**
 * これより細い video はコメント欄や小さい要素。幅も位置もそれに合わせない。
 * ニコ生・YouTube の本編映像（おおよそ 600px 以上）だけ、映像の幅に合わせる。
 */
export const VENUE_PICKUP_MAIN_VIDEO_MIN_PX = 480;

/**
 * 吹き出しの幅。放送ページの flex や max-width:100% で親が細くても、1文字幅に潰れない。
 * 本編の映像が十分大きいときだけ映像の幅に合わせる。約250pxの欄や小さい video は無視して窓の幅。
 * ABEMA もニコ生・YouTube も同じ決まり。
 * @param {number} viewportWidth
 * @param {number} [videoWidth]
 * @returns {{ width: number, minWidth: number, maxWidth: number }}
 */
export function venuePickupReadableBox(viewportWidth, videoWidth = 0) {
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const maxWidth = Math.max(160, Math.min(VENUE_PICKUP_MAX_PX, Math.max(160, vw - VENUE_PICKUP_VW_GUTTER)));
  const minWidth = Math.min(VENUE_PICKUP_MIN_PX, maxWidth);
  let width = maxWidth;
  const video = Number(videoWidth);
  if (Number.isFinite(video) && video >= VENUE_PICKUP_MAIN_VIDEO_MIN_PX) {
    width = Math.max(minWidth, Math.min(maxWidth, video - 24));
  }
  return { width: Math.round(width), minWidth: Math.round(minWidth), maxWidth: Math.round(maxWidth) };
}

/**
 * ホストページの CSS(div の max-width・flex・transform・writing-mode)より強いインライン指定。
 * スタイルシートの !important にも勝つよう、幅は要素自身へ important で書く。
 * @param {HTMLElement | { style?: { setProperty?: Function, boxSizing?: string, flexShrink?: string, writingMode?: string, wordBreak?: string, width?: string, minWidth?: string, maxWidth?: string }, classList?: { remove?: Function }, querySelectorAll?: Function } | null | undefined} el
 * @param {number} viewportWidth
 * @param {number} [videoWidth]
 */
export function applyVenuePickupBox(el, viewportWidth, videoWidth = 0) {
  const box = venuePickupReadableBox(viewportWidth, videoWidth);
  const setOn = (/** @type {any} */ node, /** @type {ReadonlyArray<[string, string]>} */ pairs) => {
    if (node && node.style && typeof node.style.setProperty === 'function') {
      for (const [key, value] of pairs) node.style.setProperty(key, value, 'important');
    }
  };
  setOn(el, [
    ['position', 'absolute'],
    ['box-sizing', 'border-box'],
    ['flex', '0 0 auto'],
    ['flex-shrink', '0'],
    ['flex-wrap', 'nowrap'],
    ['zoom', '1'],
    ['transform', 'translateX(-50%)'],
    ['writing-mode', 'horizontal-tb'],
    ['word-break', 'normal'],
    ['overflow-wrap', 'break-word'],
    ['width', `${box.width}px`],
    ['min-width', `${box.minWidth}px`],
    ['max-width', `${box.maxWidth}px`]
  ]);
  if (el && el.style && typeof el.style.setProperty !== 'function') {
    el.style.boxSizing = 'border-box';
    el.style.flexShrink = '0';
    el.style.writingMode = 'horizontal-tb';
    el.style.wordBreak = 'normal';
    el.style.width = `${box.width}px`;
    el.style.minWidth = `${box.minWidth}px`;
    el.style.maxWidth = `${box.maxWidth}px`;
  }
  if (el && el.classList && typeof el.classList.remove === 'function') el.classList.remove('is-fit-column');
  if (el && typeof el.querySelectorAll === 'function') {
    for (const node of el.querySelectorAll('.nlsb-pickup__badge, .nlsb-pickup__face, .nlsb-pickup__main, .nlsb-pickup__body, .nlsb-pickup__meta, .nlsb-pickup__grip')) {
      /** @type {Array<[string, string]>} */
      const pairs = [
        ['writing-mode', 'horizontal-tb'],
        ['word-break', 'normal'],
        ['overflow-wrap', 'break-word']
      ];
      const cls = String(node.className || '');
      if (cls.includes('nlsb-pickup__face')) pairs.push(['width', '44px'], ['height', '44px'], ['flex', '0 0 auto']);
      if (cls.includes('nlsb-pickup__badge') || cls.includes('nlsb-pickup__meta') || cls.includes('nlsb-pickup__grip')) {
        pairs.push(['white-space', 'nowrap'], ['flex-shrink', '0']);
      }
      if (cls.includes('nlsb-pickup__body')) {
        pairs.push(['font-size', '18px'], ['white-space', 'nowrap'], ['text-overflow', 'ellipsis'], ['overflow', 'hidden'], ['display', 'block']);
      }
      setOn(node, pairs);
    }
  }
  return box;
}

/**
 * 会場 CSS に差し込む PICK UP の見た目。幅は 100vw。親の 100% だと ABEMA の細い枠で
 * calc(100% - 180px) が 1 文字幅になり、本文が 1 字ずつ折れる。
 * 幅・字の折り返し・変形は !important。ABEMA が div へ max-width や scale を important で
 * 書いても、ニコ生・YouTube と同じ大きさのままにする。
 */
export const VENUE_PICKUP_CSS = `
  html .nlsb-root .nlsb-pickup,
  html .nlsb-root .nlsb-pickup * {
    writing-mode: horizontal-tb !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
  }
  html .nlsb-root .nlsb-pickup * {
    zoom: 1 !important;
    transform: none !important;
  }
  html .nlsb-root .nlsb-pickup {
    position: absolute !important;
    top: 20px;
    left: 50%;
    z-index: 7;
    transform: translateX(-50%) !important;
    zoom: 1 !important;
    box-sizing: border-box !important;
    width: min(860px, calc(100vw - 32px)) !important;
    min-width: min(320px, calc(100vw - 32px)) !important;
    max-width: min(860px, calc(100vw - 32px)) !important;
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
    flex-wrap: nowrap !important;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 10px 22px;
    border-radius: 28px;
    border: 2px solid rgba(255, 176, 62, 0.9);
    background: #fffdf8;
    color: #1f2328;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    font-size: 18px !important;
    line-height: 1.4;
    pointer-events: auto;
    white-space: normal !important;
  }
  .nlsb-pickup::before, .nlsb-pickup::after { content: ''; position: absolute; left: 48px; width: 0; height: 0; border-style: solid; }
  .nlsb-pickup::before { bottom: -20px; border-width: 20px 14px 0 0; border-color: rgba(255, 176, 62, 0.9) transparent transparent transparent; }
  .nlsb-pickup::after { bottom: -15px; left: 50px; border-width: 16px 11px 0 0; border-color: #fffdf8 transparent transparent transparent; }
  html .nlsb-root .nlsb-pickup[data-empty='1'] { display: none !important; }
  .nlsb-pickup__badge {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 152, 0, 0.9);
    color: #fff;
    white-space: nowrap;
  }
  html .nlsb-root .nlsb-pickup .nlsb-pickup__face {
    flex: 0 0 auto !important;
    width: 44px !important;
    height: 44px !important;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(0, 0, 0, 0.06);
    box-shadow: 0 0 0 2px rgba(255, 176, 62, 0.7);
  }
  .nlsb-pickup__face[hidden] { display: none; }
  html .nlsb-root .nlsb-pickup .nlsb-pickup__main {
    flex: 1 1 auto;
    min-width: 0 !important;
    width: auto !important;
    max-width: 100% !important;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  html .nlsb-root .nlsb-pickup .nlsb-pickup__body {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    width: auto !important;
    max-width: 100% !important;
    min-width: 0 !important;
    display: block !important;
    text-overflow: ellipsis;
    overflow-wrap: normal;
    white-space: nowrap !important;
    font-size: 18px !important;
    font-weight: 700;
  }
  .nlsb-pickup__meta {
    flex: 0 0 auto;
    font-size: 12px;
    opacity: 0.75;
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .nlsb-pickup__meta:empty { display: none; }
  a.nlsb-pickup__meta[href] { text-decoration: underline; text-underline-offset: 2px; }
  html .nlsb-root .nlsb-pickup .nlsb-pickup__badge,
  html .nlsb-root .nlsb-pickup .nlsb-pickup__meta,
  html .nlsb-root .nlsb-pickup .nlsb-pickup__grip {
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    width: auto !important;
    max-width: 100% !important;
  }
`;

/**
 * ピックアップ枠のDOMを作る(1回だけ呼ぶ)。
 *
 * @param {Document} doc
 * @returns {{ root: HTMLElement, body: HTMLElement, meta: HTMLElement, face: HTMLElement, main: HTMLElement }}
 */
export function createVenuePickupBanner(doc) {
  const root = doc.createElement('div');
  root.className = VENUE_PICKUP_CLASS;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'ピックアップされた応援コメント');

  const badge = doc.createElement('span');
  badge.className = 'nlsb-pickup__badge';
  badge.textContent = 'PICK UP';

  // 発言者のサムネ(2026-10-17・§3.5 サムネ+ハンドル名+ID+リンクをセットで出す)。無いときは隠す(空の枠を作らない)。
  const face = doc.createElement('img');
  face.className = 'nlsb-pickup__face';
  face.setAttribute('alt', '');
  face.setAttribute('hidden', '');

  // 名前の行を本文の上に置く（ニコ生・YouTube・ABEMA で同じ）。数値IDはユーザーページへのリンク(a)、匿名はリンクなし。
  const main = doc.createElement('span');
  main.className = 'nlsb-pickup__main';
  const body = doc.createElement('span');
  body.className = 'nlsb-pickup__body';
  const meta = doc.createElement('a');
  meta.className = 'nlsb-pickup__meta';
  main.append(meta, body);

  root.append(badge, face, main);
  return { root, body, meta, face, main };
}

/**
 * 表示用の内容を組み立てる純関数(DOMに触れない=テストしやすい)。
 *
 * @param {{ entry?: any, why?: string }|null|undefined} picked pickTickerHighlightEntry の戻り
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ text: string, meta: string, empty: boolean, speaker: any }}
 */
export function buildVenuePickupView(picked, opts = {}) {
  const maxChars = Math.max(8, Math.floor(Number(opts.maxChars) || 60));
  const p = picked && typeof picked === 'object' ? picked : null;
  const e = p?.entry && typeof p.entry === 'object' ? /** @type {any} */ (p.entry) : null;
  const raw = String(e?.text ?? '').replace(/\s+/g, ' ').trim();
  const isGift = String(p?.why || '') === 'gift';
  const giftName = String(e?.name ?? e?.nickname ?? '').trim();
  /** 発言者の情報セット(venuePickupSpeaker.js)。無い行(旧入力)は従来の表示。 */
  const speaker = e?.speaker && typeof e.speaker === 'object' ? e.speaker : null;
  if (!raw) {
    // ★ギフト行は本文が空のことがある(会場の行は text:'' で kind:'gift')。
    //   選ばれているのに案内文が出ると「動いていない」ように見えるので、
    //   ギフトはギフトとして必ず言葉にする(実データで踏んだ穴)。
    if (isGift) {
      return {
        text: giftName ? `${giftName} さんがギフトを贈りました` : 'ギフトが届きました',
        meta: '🎁 ギフト',
        empty: false,
        speaker
      };
    }
    return {
      text: 'コメントが流れると、ここに1件ずつ大きく出るよ',
      meta: '',
      empty: true,
      speaker: null
    };
  }
  const chars = Array.from(raw);
  const text = chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : raw;
  // 誰の発言かを添える(匿名は名前を出さない=無い名前を捏造しない)。
  const speakerMeta = speaker ? [String(speaker.name || ''), String(speaker.idLine || '')].filter(Boolean).join(' ・ ') : '';
  const meta = isGift ? '🎁 ギフト' : (speakerMeta || giftName || '');
  return { text, meta, empty: false, speaker };
}

/**
 * 枠の中身を更新する。同じ内容なら DOM を書き換えない(diff-skip)。
 *
 * ★「消す側」も同じ経路を通す(消す/空にする側に計器も diff-skip も無いのが
 *   ちらつき7版の真犯人だった、という既存の教訓に倣う)。
 *
 * @param {{ root: HTMLElement, body: HTMLElement, meta: HTMLElement, face?: HTMLElement|any }|null|undefined} els
 * @param {{ text: string, meta: string, empty: boolean, speaker?: any }} view
 * @returns {boolean} DOM を書き換えたら true
 */
export function applyVenuePickupView(els, view) {
  if (!els || !els.root || !els.body) return false;
  const sp = view?.speaker && typeof view.speaker === 'object' ? view.speaker : null;
  const key = `${view?.empty ? 'e' : 'f'}|${view?.text || ''}|${view?.meta || ''}|${sp ? `${sp.avatar || ''}|${sp.href || ''}` : ''}`;
  if (els.root.dataset.nlPickupKey === key) return false;
  els.root.dataset.nlPickupKey = key;
  els.body.textContent = String(view?.text || '');
  if (els.meta) {
    els.meta.textContent = String(view?.meta || '');
    // 数値IDだけユーザーページへのリンク(匿名・ギフトは href なし=リンクにしない)。
    if (sp && sp.href) {
      els.meta.setAttribute('href', String(sp.href));
      els.meta.setAttribute('target', '_blank');
      els.meta.setAttribute('rel', 'noopener noreferrer');
    } else {
      els.meta.removeAttribute('href');
      els.meta.removeAttribute('target');
      els.meta.removeAttribute('rel');
    }
  }
  if (els.face) {
    // サムネ: 発言者がいれば出す。画像が壊れていたら代替顔(identicon)へ1回だけ差し替える(白丸・壊れ画像を出さない)。
    if (sp && sp.avatar) {
      els.face.removeAttribute('hidden');
      els.face.onerror = () => {
        els.face.onerror = null;
        if (sp.fallbackAvatar && sp.fallbackAvatar !== sp.avatar) els.face.setAttribute('src', String(sp.fallbackAvatar));
        else els.face.setAttribute('hidden', '');
      };
      els.face.setAttribute('src', String(sp.avatar));
    } else {
      els.face.setAttribute('hidden', '');
      els.face.removeAttribute('src');
    }
  }
  // v0.1.1900: 顔/名前クリックで「この人の発言」パネルを開くための手がかり(venuePickupDrag.js が読む)。
  els.root.dataset.nlPickupUid = sp ? String(sp.uid || '') : '';
  els.root.dataset.nlPickupName = sp ? String(sp.name || '') : '';
  els.root.dataset.nlPickupAvatar = sp ? String(sp.avatar || '') : '';
  if (view?.empty) els.root.setAttribute('data-empty', '1');
  else els.root.removeAttribute('data-empty');
  return true;
}

/**
 * v0.1.1869 PICK UP の吹き出しを「映像の上端中央」に置く位置(純関数)。
 *   会場全体の中央だと YouTube のチャット欄に はみ出した(PC 実測 1400px で 146px)。
 *   上端は額縁の3キャラ(会場の上の余白)に重ならないよう minTop より上へは出さない。
 * @param {{ left:number, top:number, width:number, height:number } | null | undefined} video 映像の矩形(画面座標)
 * @param {{ left:number, top:number, width:number }} layout 吹き出しの親(stageLayout)の矩形(画面座標)
 * @param {{ maxWidth?: number, minTop?: number, margin?: number }} [opts]
 * @returns {{ left:number, top:number, width:number } | null} 親の中での中心 x・上端・幅(映像が分からなければ null=CSS の既定)
 */
export function venuePickupPlacement(video, layout, opts = {}) {
  if (!video || !layout || !(video.width >= VENUE_PICKUP_MAIN_VIDEO_MIN_PX) || !(video.height >= 120)) return null;
  const maxWidth = opts.maxWidth ?? 860;
  const minTop = opts.minTop ?? 20;
  const margin = opts.margin ?? 12;
  const width = Math.round(Math.max(200, Math.min(maxWidth, video.width - margin * 2)));
  const left = Math.round(video.left - layout.left + video.width / 2);
  const top = Math.round(Math.max(minTop, video.top - layout.top + 8));
  return { left, top, width };
}

/**
 * v0.1.1899 PICK UP の吹き出しをドラッグで好きな位置へ(りんく「ドラッグでうごかせるようにしておきたい」)。
 *   位置は会場(stageLayout)に対する割合で覚える=窓の大きさが変わっても同じあたりに出る。
 *   置ける範囲は画面(窓)の内側(吹き出しが丸ごと見える範囲に締める・画面の外へ失くさない)。
 *   ★会場の枠ではなく窓で締める: 放送ページの会場は上端がニコ生のヘッダーの下にあり、映像の上端より上へ持っていけなかった(りんく実機 11/06)。
 *   そのため保存する割合は会場の外(負や1超)もあり得る(-2〜3 に締める)。
 *   ★ダブルクリックで元の自動位置(映像の上端中央)に戻す。
 */

/** これ未満の動きはクリック扱い(ドラッグにしない)。 */
export const VENUE_PICKUP_DRAG_THRESHOLD_PX = 4;

/**
 * 保存値の形を確かめる(壊れた値・旧形は null=自動位置。§3.6 fail-soft)。
 * @param {unknown} raw
 * @returns {{ cx: number, top: number } | null} cx=中心xの割合・top=上端の割合(会場に対して。窓で締めるので -2〜3)
 */
export function normalizeVenuePickupSavedPos(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {any} */ (raw);
  const cx = Number(o.cx);
  const top = Number(o.top);
  if (!Number.isFinite(cx) || !Number.isFinite(top)) return null;
  const c = (/** @type {number} */ v) => Math.min(3, Math.max(-2, v));
  return { cx: c(cx), top: c(top) };
}

/**
 * 吹き出しの中心x・上端(会場の中の px)を、吹き出しが丸ごと置ける範囲に収まるよう締める。
 * @param {number} cxPx
 * @param {number} topPx
 * @param {{ width:number, height:number }} layout 会場の大きさ
 * @param {{ width:number, height:number }} box 吹き出しの大きさ(尻尾 20px 込みで見る)
 * @param {{ minX:number, minY:number, maxX:number, maxY:number }} [bounds] 置ける範囲(会場の座標)。省略時は会場の内側
 * @returns {{ left:number, top:number }} left=中心x(CSS の translateX(-50%) と対)
 */
export function clampVenuePickupPx(cxPx, topPx, layout, box, bounds) {
  const W = Math.max(0, Number(layout?.width) || 0);
  const H = Math.max(0, Number(layout?.height) || 0);
  const B = bounds || { minX: 0, minY: 0, maxX: W, maxY: H };
  const w = Math.max(0, Number(box?.width) || 0);
  const h = Math.max(0, Number(box?.height) || 0) + 20; // 尻尾(::before bottom:-20px)まで見せる
  const minX = B.minX + w / 2;
  const maxX = B.maxX - w / 2;
  const left = maxX < minX ? (B.minX + B.maxX) / 2 : Math.min(maxX, Math.max(minX, Number(cxPx) || 0));
  const maxY = B.maxY - h;
  const top = maxY < B.minY ? B.minY : Math.min(maxY, Math.max(B.minY, Number(topPx) || 0));
  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * 窓(画面)の内側を、会場の座標で表す(clampVenuePickupPx の bounds)。
 * @param {{ left:number, top:number }} layoutRect 会場の矩形(画面座標)
 * @param {{ width:number, height:number }} viewport 窓の大きさ
 */
export function venuePickupViewportBounds(layoutRect, viewport) {
  return { minX: -layoutRect.left, minY: -layoutRect.top, maxX: viewport.width - layoutRect.left, maxY: viewport.height - layoutRect.top };
}

/**
 * 保存値(割合)→ 会場の中の px(締めたあと)。
 * @param {{ cx:number, top:number } | null} saved
 * @param {{ width:number, height:number }} layout
 * @param {{ width:number, height:number }} box
 * @param {{ minX:number, minY:number, maxX:number, maxY:number }} [bounds]
 * @returns {{ left:number, top:number } | null} 保存値が無ければ null(=自動位置)
 */
export function venuePickupSavedPlacement(saved, layout, box, bounds) {
  const s = normalizeVenuePickupSavedPos(saved);
  if (!s || !(Number(layout?.width) > 0) || !(Number(layout?.height) > 0)) return null;
  return clampVenuePickupPx(s.cx * layout.width, s.top * layout.height, layout, box, bounds);
}

/**
 * ドラッグで置いた px(締めたあと)→ 保存する割合。
 * @param {{ left:number, top:number }} px
 * @param {{ width:number, height:number }} layout
 * @returns {{ cx:number, top:number } | null}
 */
export function venuePickupPosToSave(px, layout) {
  if (!(Number(layout?.width) > 0) || !(Number(layout?.height) > 0)) return null;
  return normalizeVenuePickupSavedPos({
    cx: Math.round((px.left / layout.width) * 10000) / 10000,
    top: Math.round((px.top / layout.height) * 10000) / 10000
  });
}
