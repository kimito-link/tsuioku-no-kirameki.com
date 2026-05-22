/**
 * やさしさナッジ（コメント送信前の言い換え促し）の「表示モデル」を導出する純関数。
 *
 * popup-entry.js の paintCommentKindnessUi から「DOM 非依存の表示判断」だけを
 * 抽出したもの（pure refactor、挙動不変）。DOM への適用（textContent / hidden /
 * dataset / face.src / hop アニメ）と module グローバル状態
 * （COMMENT_KINDNESS_UI_STATE）の読み書きは呼び出し側（popup）に残す。
 *
 * 設計意図（会議室レビュー反映）: 2 回押しハンドシェイク（armedText）等の可変
 * 状態は lib に持ち込まない。ここは「与えられた view と前回の表示キー/forceHop
 * から、見せるべき内容と hop すべきか」を決めるだけの参照透明な関数。
 *
 * @typedef {{
 *   warning: ({ level?: string, title?: string, body?: string, confirm?: string, id?: string }|null),
 *   confirmPending?: boolean,
 *   visibleKey?: string
 * }} KindnessView
 *
 * @typedef {{
 *   visible: boolean,
 *   level: string,
 *   title: string,
 *   body: string,
 *   confirmText: string,
 *   faceLevel: string,
 *   shouldHop: boolean,
 *   visibleKey: string
 * }} KindnessDisplayModel
 *
 * @param {KindnessView} view
 * @param {{
 *   forceHop?: boolean,
 *   lastVisibleKey?: string,
 *   faceLevels?: readonly string[],
 *   softNudgeText?: string
 * }} [opts]
 * @returns {KindnessDisplayModel}
 */
export function resolveCommentKindnessDisplayModel(view, opts = {}) {
  const faceLevels =
    Array.isArray(opts.faceLevels) && opts.faceLevels.length > 0
      ? opts.faceLevels
      : ['mild'];
  const softNudgeText =
    typeof opts.softNudgeText === 'string' && opts.softNudgeText
      ? opts.softNudgeText
      : '送る前に、ひと呼吸おいて言い換えも考えてみよう。';

  const warning = view && typeof view === 'object' ? view.warning : null;

  if (!warning) {
    return {
      visible: false,
      // 非表示時の既定 level は 'mild'（従来の wrap.dataset.level = 'mild' と一致）
      level: 'mild',
      title: '',
      body: '',
      confirmText: '',
      faceLevel: 'mild',
      shouldHop: false,
      visibleKey: ''
    };
  }

  const level = String(warning.level || 'mild');
  // face は対応する level が無ければ 'mild' にフォールバック（従来挙動）。
  const faceLevel = faceLevels.includes(level) ? level : 'mild';
  const confirmText =
    view.confirmPending && warning.confirm ? String(warning.confirm) : softNudgeText;
  const visibleKey = String(view.visibleKey || '');
  const shouldHop = Boolean(opts.forceHop) || String(opts.lastVisibleKey || '') !== visibleKey;

  return {
    visible: true,
    level,
    title: String(warning.title || ''),
    body: String(warning.body || ''),
    confirmText,
    faceLevel,
    shouldHop,
    visibleKey
  };
}
