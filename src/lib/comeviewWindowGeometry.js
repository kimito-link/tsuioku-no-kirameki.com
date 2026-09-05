/**
 * comeviewWindowGeometry.js — コメビュ別窓／OBS窓の「大きさと位置を覚える」純関数。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか（実運用の負担・2026-09-03）
 * ─────────────────────────────────────────────────────────────────────────
 *   comeview-entry.js は別窓を必ず `width: 400, height: 640` の【決め打ち】で開いていた。
 *   OBS の運用は「ウィンドウキャプチャで配信画面に重ねる」形なので、
 *   ★窓の大きさが変わると配信レイアウトの合わせ込みがやり直しになる。
 *   開き直すたびに 400x640 に戻る＝毎回サイズと位置を直す手作業が発生していた。
 *
 *   ★これは「配信者が自分の画面を作り込めない」ことの一部でもある。
 *     ウィンドウキャプチャ運用では CSS を配信者が触れないぶん、
 *     せめて【窓の形は覚えている】必要がある。
 *
 * ★この関数がやること: 保存値の正規化と、開くときの引数決定だけ。
 *   chrome.windows も storage も触らない(呼び出し側の仕事)。
 *
 * ★安全側の設計:
 *   - 画面外に飛んだ位置は復元しない(見えない窓を作らない)
 *   - 極端に小さい/大きい値は既定へ倒す(壊れた値で開かない)
 *   - 値が無い/壊れている＝既定(400x640)。★従来と同じ挙動に落ちる
 *
 * @module comeviewWindowGeometry
 */

/** ★従来の決め打ち値。保存が無いときはここへ倒す(挙動を変えない)。 */
export const COMEVIEW_WINDOW_DEFAULT = Object.freeze({ width: 400, height: 640 });

/** 小さすぎ/大きすぎを弾く範囲(壊れた値で開かないための門)。 */
const MIN_W = 240;
const MIN_H = 200;
const MAX_W = 4000;
const MAX_H = 4000;

/** @param {unknown} v @returns {number|null} */
function intOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * storage から読んだ raw を安全な形に正規化する。
 * @param {unknown} raw
 * @returns {{width:number,height:number,left:number|null,top:number|null}}
 */
export function normalizeComeviewWindowGeometry(raw) {
  const o = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const w = intOrNull(o.width);
  const h = intOrNull(o.height);
  const left = intOrNull(o.left);
  const top = intOrNull(o.top);
  return {
    width: w !== null && w >= MIN_W && w <= MAX_W ? w : COMEVIEW_WINDOW_DEFAULT.width,
    height: h !== null && h >= MIN_H && h <= MAX_H ? h : COMEVIEW_WINDOW_DEFAULT.height,
    // ★位置は「妥当なときだけ」返す。負の巨大値などは捨てる(画面外の窓を作らない)。
    left: left !== null && left > -MAX_W && left < MAX_W ? left : null,
    top: top !== null && top > -MAX_H && top < MAX_H ? top : null
  };
}

/**
 * chrome.windows.create に渡す引数を組む。
 * ★位置が分からないときは left/top を【入れない】(ブラウザ既定の配置に任せる)。
 * @param {string} url
 * @param {unknown} savedGeometry
 * @returns {{url:string,type:'popup',width:number,height:number,left?:number,top?:number}}
 */
export function buildComeviewWindowOptions(url, savedGeometry) {
  const g = normalizeComeviewWindowGeometry(savedGeometry);
  /** @type {any} */
  const opts = { url: String(url || ''), type: 'popup', width: g.width, height: g.height };
  if (g.left !== null && g.top !== null) {
    opts.left = g.left;
    opts.top = g.top;
  }
  return opts;
}

/**
 * 今の窓の形を保存してよいか判定する(保存する値も返す)。
 * ★最小化(0x0 など)や、明らかに壊れた値は保存しない
 *   =「最小化したまま閉じたら次から潰れた窓が出る」事故を防ぐ。
 * @param {{width?:unknown,height?:unknown,left?:unknown,top?:unknown}} current
 * @returns {{width:number,height:number,left:number|null,top:number|null}|null} null なら保存しない
 */
export function pickComeviewGeometryToSave(current) {
  const w = intOrNull(current?.width);
  const h = intOrNull(current?.height);
  if (w === null || h === null) return null;
  if (w < MIN_W || h < MIN_H || w > MAX_W || h > MAX_H) return null;
  const left = intOrNull(current?.left);
  const top = intOrNull(current?.top);
  return {
    width: w,
    height: h,
    left: left !== null && left > -MAX_W && left < MAX_W ? left : null,
    top: top !== null && top > -MAX_H && top < MAX_H ? top : null
  };
}
