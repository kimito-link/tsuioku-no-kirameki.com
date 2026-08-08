/**
 * sidepanelSelfDiag — サイドパネルが「自分がいま黒くないか」を自己申告するための純ロジック。
 *
 * 【なぜ要るか】
 *   サイドパネルの黒画面は 2026-08-08 時点で【私の環境では再現しない】。
 *   実機だけで起きるので、ユーザーに DevTools を開いてもらう往復が必要だった。
 *   → パネル自身に状態を書かせれば、いつもの「状態速報コピー」だけで原因が分かる。
 *
 * 【担う責務】
 *   DOM から読み取った生の値を受け取り、「黒く見える状態か」を判定して1行にする。
 *   ★DOM も chrome API も触らない(呼び出し側が値を集めて渡す)＝テスト容易。
 *
 * 【判定の考え方】
 *   3層(外側html / iframe / 中身html)のどれかが「塗っていない」なら黒が出うる。
 *   塗っている = 背景色が透明でない or 背景画像(グラデ)がある。
 *   さらに colorScheme が light でなければ、塗る前の地が暗色になる。
 *
 * @module sidepanelSelfDiag
 */

/** 透明とみなす背景色。 */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/**
 * @typedef {{
 *   bgColor?: unknown,
 *   bgImage?: unknown,
 *   colorScheme?: unknown,
 *   styleAttr?: unknown
 * }} LayerSample
 */

/** その層が「地を塗っている」か。 @param {LayerSample|null|undefined} L */
export function layerPaints(L) {
  if (!L || typeof L !== 'object') return false;
  const color = String(L.bgColor || '').trim();
  const image = String(L.bgImage || '').trim();
  const hasColor = Boolean(color) && color !== TRANSPARENT && color !== 'transparent';
  const hasImage = Boolean(image) && image !== 'none';
  return hasColor || hasImage;
}

/**
 * サイドパネルの3層サンプルから「黒く見える状態か」を判定して1行にする。
 *
 * @param {{
 *   version?: unknown,
 *   panelW?: unknown, panelH?: unknown,
 *   outer?: LayerSample|null,
 *   iframe?: (LayerSample & { w?: unknown, h?: unknown, canRead?: unknown, ready?: unknown })|null,
 *   inner?: (LayerSample & { bodyKids?: unknown, cloak?: unknown })|null
 * }} s
 * @returns {{ ok: boolean, line: string, cause: string }}
 */
export function judgeSidepanelBlack(s) {
  const v = s && typeof s === 'object' ? s : {};
  const ver = String(v.version || '不明');
  const pw = Math.max(0, Math.round(Number(v.panelW) || 0));
  const ph = Math.max(0, Math.round(Number(v.panelH) || 0));

  const outerPaints = layerPaints(v.outer);
  const ifrPaints = layerPaints(v.iframe);
  const innerPaints = layerPaints(v.inner);

  const ifrW = Math.max(0, Math.round(Number(v.iframe?.w) || 0));
  const ifrH = Math.max(0, Math.round(Number(v.iframe?.h) || 0));
  const canRead = v.iframe?.canRead === true;
  const bodyKids = Math.max(0, Math.round(Number(v.inner?.bodyKids) || 0));
  const cloak = String(v.inner?.cloak || '');

  const outerCS = String(v.outer?.colorScheme || '');
  const innerCS = String(v.inner?.colorScheme || '');
  /** @param {string} cs */
  const darkish = (cs) => Boolean(cs) && cs !== 'light';

  // ★原因を1つに絞って名指しする(件数だけ出しても次の一手が決まらない)。
  let cause = '';
  if (!outerPaints) cause = '外側(sidepanel.html)が塗っていない';
  else if (ifrW === 0 || ifrH === 0) cause = `iframeが潰れている(${ifrW}x${ifrH})`;
  else if (!canRead) cause = 'iframeの中身を読めない(別オリジン/未ロード)';
  else if (bodyKids === 0) cause = '中身が空(bodyの子要素0=描画前か失敗)';
  else if (cloak === '1') cause = '幕(cloak)が残っている=JSが途中で止まった疑い';
  else if (!innerPaints) cause = '中身(popup.html)が塗っていない';
  else if (darkish(outerCS) || darkish(innerCS)) {
    cause = `color-schemeがlightでない(外${outerCS || '?'}/中${innerCS || '?'})`;
  }

  const ok = cause === '';
  const layers = `外${outerPaints ? '✅' : '🔴'} iframe${ifrPaints ? '✅' : '🔴'} 中${innerPaints ? '✅' : '🔴'}`;
  const line = ok
    ? `サイドパネル自己診断: ✅正常 / v${ver} / ${pw}x${ph} / ${layers}`
    : `サイドパネル自己診断: 🔴黒くなりうる / v${ver} / ${pw}x${ph} / ${layers} / 原因=${cause}`;

  return { ok, line, cause };
}
