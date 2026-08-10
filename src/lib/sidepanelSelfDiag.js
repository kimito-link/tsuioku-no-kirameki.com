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

/**
 * ★v0.1.1302: 「窓が 0x0 だった時間帯」を測定系列から要約する純関数。
 *
 * ■ なぜ継続時間が要るか(ユーザー証言 2026-08-10「でる瞬間黒いが見える感じ」)
 *   窓が未レイアウト(0x0)なら全層が高さ0=塗るピクセルが無い。
 *   ただし【何ms続いたか】で意味が真逆になる:
 *     60ms  → 人間の目には見えない = 黒の正体は別にある
 *     800ms → これが見えている黒 = 面積側の対策へ進む
 *   従来は最後の1点しか残らず、この区別ができなかった。
 *
 * @param {ReadonlyArray<{ t?: unknown, w?: unknown, h?: unknown }>|null|undefined} series
 *   各測定点の {t: 起動からのms, w: 窓幅, h: 窓高}
 * @returns {{ everZero: boolean, firstZeroT: number|null, lastZeroT: number|null,
 *   zeroCount: number, settledT: number|null, line: string }}
 *   settledT = 初めて面積を持った時刻(null=最後まで 0x0 のまま)
 */
export function summarizeZeroAreaWindow(series) {
  const list = Array.isArray(series) ? series : [];
  /** @type {number[]} */
  const zeroTs = [];
  /** @type {number|null} */
  let settledT = null;
  for (const raw of list) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const t = Number(s.t);
    if (!Number.isFinite(t)) continue;
    const w = Math.max(0, Math.floor(Number(s.w) || 0));
    const h = Math.max(0, Math.floor(Number(s.h) || 0));
    if (w === 0 || h === 0) {
      zeroTs.push(t);
    } else if (settledT === null) {
      settledT = t;
    }
  }
  const everZero = zeroTs.length > 0;
  const firstZeroT = everZero ? Math.min(...zeroTs) : null;
  const lastZeroT = everZero ? Math.max(...zeroTs) : null;
  let line = '';
  if (!everZero) {
    line = list.length ? '窓0x0 ✅観測されず' : '窓0x0 ⚪未観測';
  } else if (settledT != null) {
    // ★「lastZero と settled の間」で直った=上限は settledT。断定せず範囲で出す。
    line = `窓0x0の継続=t=${firstZeroT}〜${lastZeroT}ms(${settledT}msまでに面積確定・${zeroTs.length}点)`;
  } else {
    line = `窓0x0が最後まで継続=t=${firstZeroT}〜${lastZeroT}ms(面積が確定しなかった・${zeroTs.length}点)`;
  }
  return { everZero, firstZeroT, lastZeroT, zeroCount: zeroTs.length, settledT, line };
}

/**
 * ★v0.1.1302: 「その座標を実際に塗っているのは誰か」を、祖先チェーンから判定する純関数。
 *
 * ■ なぜ CSS 値を読むだけでは足りないか(実機で確定)
 *   自己診断は 外✅ iframe✅ 中✅(=3層とも塗っている)と報告したのに、
 *   ユーザーには黒が見えていた。層ごとの値を見るだけでは
 *   「その値が実際に画面に出ているか」が分からない。
 *   → 呼び出し側が elementFromPoint で拾った【実在の要素チェーン】を渡し、
 *     ここで「最初に不透明な背景を持つ要素」を探す。誰も居なければ本物の黒。
 *
 * ■ 入力はDOMではなく要約(この関数はDOMに触らない=テスト可能)
 * @param {ReadonlyArray<{ tag?: unknown, bgColor?: unknown, bgImage?: unknown }>|null|undefined} chain
 *   画面上の点から祖先へ向かう順の要素要約(先頭=最前面)
 * @returns {{ painter: string|null, chain: string[] }}
 *   painter=null は「その座標を塗る人が誰も居ない」=黒が出る
 */
export function findCenterPainter(chain) {
  const list = Array.isArray(chain) ? chain : [];
  /** @type {string[]} */
  const trail = [];
  /** @type {string|null} */
  let painter = null;
  for (const raw of list) {
    const el = raw && typeof raw === 'object' ? raw : {};
    const tag = String(el.tag || '?');
    const paints = layerPaints(el);
    const color = String(el.bgColor || '').trim();
    const img = String(el.bgImage || '').trim();
    const what = paints ? (img && img !== 'none' ? 'image' : color) : 'transparent';
    trail.push(`${tag}:${what}`);
    // ★最前面から見て最初に塗っている要素が「地の色の出どころ」。
    if (paints && painter === null) painter = `${tag} → ${what}`;
  }
  return { painter, chain: trail };
}

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
  /*
   * ★v0.1.1302(6回外した真因): 窓そのものが 0x0 のときを【最初に】分ける。
   *
   * ■ 何が起きていたか(2026-08-09 実機)
   *     🔴黒くなりうる / 0x0 / 外✅ iframe✅ 中✅ / 原因=iframeが潰れている(0x0)
   *   この名指しに従って v0.1.1299(<html>を1行目へ)を出荷し、外した。
   *
   * ■ 名指しが誤りだった理由
   *   sidepanel.html は html,body{height:100%} → iframe{height:100%} の連鎖なので、
   *   【窓に高さが無ければ全層が高さ0】になる。iframe の 0x0 は原因ではなく【結果】。
   *   ここで iframe を名指しすると、iframe 側を直しに行って必ず外す。
   *
   * ■ さらに: この時点の判定は他の項目も当てにならない
   *   sidepanel-entry.js の t=0 サンプルはレイアウト【前】に走りうる。
   *   面積ゼロの瞬間に「塗っていない」等を断定すると偽陽性になる。
   *   → 原因を名乗らず「未レイアウト」と正直に出す(次の一手を誤らせない)。
   */
  if (pw === 0 || ph === 0) {
    cause = `未レイアウト(窓が${pw}x${ph}=この時点の判定は当てにならない)`;
  } else if (!outerPaints) cause = '外側(sidepanel.html)が塗っていない';
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
  /*
   * ★v0.1.1302: 未レイアウトは「🔴黒くなりうる」と名乗らない。
   *   これを🔴で出すと、読み手は【本物の不具合】だと信じて原因を追う
   *   (実際に v0.1.1299 でそうして外した)。まだ測れないだけなので ⏳ で出す。
   */
  const unlaidOut = cause.startsWith('未レイアウト');
  let line;
  if (ok) {
    line = `サイドパネル自己診断: ✅正常 / v${ver} / ${pw}x${ph} / ${layers}`;
  } else if (unlaidOut) {
    line = `サイドパネル自己診断: ⏳判定保留 / v${ver} / ${pw}x${ph} / ${layers} / ${cause}`;
  } else {
    line = `サイドパネル自己診断: 🔴黒くなりうる / v${ver} / ${pw}x${ph} / ${layers} / 原因=${cause}`;
  }

  return { ok, line, cause };
}
