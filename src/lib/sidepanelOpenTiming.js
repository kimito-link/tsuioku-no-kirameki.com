/**
 * sidepanelOpenTiming — ツールバーを押してからサイドパネルが描かれるまでの【実機の時間】を測る純ロジック。
 *
 * ■ なぜ要るか(2026-10-18)
 *   押した瞬間にパネルの中が灰色の縞になる件。縞の並びがウィンドウの余白(拡張が塗れない所)と一致したため、
 *   縞そのものは拡張の絵ではない。拡張が決められるのは「パネルがまだ描かれず下地が透けている時間」だけ。
 *   その長さが 50ms なのか数秒なのか、どこで時間を食っているのかが、実機では一度も測られていなかった。
 *   (ヘッドレスでは最初のフレームまで中央値約60ms。実機の値は未測定。)
 *
 * ■ 測る区間(押した時刻 = SW が onClicked で控えた Date.now())
 *   clickToDocMs        押下 → パネルの文書の開始(Chrome がパネルを用意する時間。拡張のコードは走っていない)
 *   docToFirstPaintMs   文書の開始 → 親の最初の描画(sidepanel.html が自分で描ける時間)
 *   clickToFirstPaintMs 押下 → 親の最初の描画(= 下地が透けて見えている長さの目安)
 *   clickToContentMs    押下 → 中身(popup)の最初の描画
 *
 * ■ 守ること
 *   - 描画には関与しない(読むだけ・失敗しても何も変わらない)。
 *   - 押した時刻が無い・古い(別の経路で開いた)ときは、区間を捏造せず clickMissing にする。
 *   - 原因の断定はしない(行は事実の数値だけ)。
 * @module sidepanelOpenTiming
 */

/** SW が押下時に控える chrome.storage.session のキー(background.js は import できないので文字列が重複する=契約テストで照合)。 */
export const SP_CLICK_KEY = 'nls_sp_click_at_v1';
/** 直近の開き方の履歴(sidepanel が書く)。 */
export const SP_OPEN_TIMING_KEY = 'nls_sp_open_timing_v1';
/** 押下と文書開始の間がこれを超えたら「別の経路で開いた」とみなして区間を出さない。 */
export const MAX_CLICK_TO_DOC_MS = 30_000;
/** 履歴の保持数。 */
export const OPEN_HISTORY_CAP = 8;

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** [開始ms, 長さms] の配列だけ通す(最大6組・壊れた要素は捨てる)。 @param {unknown} v @returns {Array<[number, number]>} */
function pairs(v) {
  if (!Array.isArray(v)) return [];
  /** @type {Array<[number, number]>} */
  const out = [];
  for (const e of v) {
    if (Array.isArray(e) && num(e[0]) != null && num(e[1]) != null) out.push([Math.round(e[0]), Math.round(e[1])]);
    if (out.length >= 6) break;
  }
  return out;
}
/** @param {number|null} a @param {number|null} b */
const diff = (a, b) => (a == null || b == null ? null : Math.round(a - b));

/**
 * @param {{
 *   click?: { at?: number, swAgeMs?: number, armed?: boolean, hasLv?: boolean } | null,
 *   docStartEpoch?: number|null,
 *   firstPaintEpoch?: number|null,
 *   contentPaintEpoch?: number|null,
 *   scriptAtMs?: number|null,
 *   domInteractiveMs?: number|null,
 *   ownLongTasks?: Array<[number, number]>,
 *   stalls?: Array<[number, number]>
 * }} i
 * @returns {{ id: number, clickMissing: boolean, clickToDocMs: number|null, docToFirstPaintMs: number|null, clickToFirstPaintMs: number|null, clickToContentMs: number|null, swAgeMs: number|null, armed: boolean|null, hasLv: boolean|null, scriptAtMs: number|null, domInteractiveMs: number|null, ownLongTasks: Array<[number, number]>, stalls: Array<[number, number]> }}
 */
export function buildOpenTiming(i) {
  const doc = num(i && i.docStartEpoch);
  const clickAt = num(i && i.click && i.click.at);
  const fp = num(i && i.firstPaintEpoch);
  const cp = num(i && i.contentPaintEpoch);
  const toDoc = diff(doc, clickAt);
  const usable = clickAt != null && toDoc != null && toDoc >= 0 && toDoc <= MAX_CLICK_TO_DOC_MS;
  return {
    id: doc == null ? 0 : Math.round(doc),
    clickMissing: !usable,
    clickToDocMs: usable ? toDoc : null,
    docToFirstPaintMs: diff(fp, doc),
    clickToFirstPaintMs: usable ? diff(fp, clickAt) : null,
    clickToContentMs: usable ? diff(cp, clickAt) : null,
    swAgeMs: usable ? num(i.click && i.click.swAgeMs) : null,
    armed: usable && i.click && typeof i.click.armed === 'boolean' ? i.click.armed : null,
    hasLv: usable && i.click && typeof i.click.hasLv === 'boolean' ? i.click.hasLv : null,
    // 押した時刻が無くても測れる「文書の中だけ」の値(ツールバー以外から開いた回も数字が残る)
    scriptAtMs: num(i && i.scriptAtMs) == null ? null : Math.round(/** @type {number} */ (num(i.scriptAtMs))),
    domInteractiveMs: num(i && i.domInteractiveMs) == null ? null : Math.round(/** @type {number} */ (num(i.domInteractiveMs))),
    ownLongTasks: pairs(i && i.ownLongTasks),
    stalls: pairs(i && i.stalls)
  };
}

/**
 * 履歴へ今回分を入れる(同じ id は置き換え=1回の起動で複数回書いても1件)。古い順・最大 OPEN_HISTORY_CAP 件。
 * @param {unknown} prev
 * @param {{ id: number }} cur
 * @returns {any[]}
 */
export function mergeOpens(prev, cur) {
  const list = Array.isArray(prev) ? prev.filter((e) => e && typeof e === 'object' && num(e.id) != null) : [];
  const rest = list.filter((e) => e.id !== cur.id);
  rest.push(cur);
  rest.sort((a, b) => a.id - b.id);
  return rest.slice(-OPEN_HISTORY_CAP);
}

/** @param {number[]} xs */
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * 状態速報に出す1行。事実の数値だけで、原因は断定しない。
 * @param {any[]} opens
 * @returns {string} 計測が1件も無ければ ''
 */
export function formatOpenTimingLine(opens) {
  const all = Array.isArray(opens) ? opens.filter((e) => e && typeof e === 'object') : [];
  if (!all.length) return '';
  const ok = all.filter((e) => !e.clickMissing);
  /** @param {string} k */
  const col = (k) => ok.map((e) => e[k]).filter((v) => typeof v === 'number');
  /** @param {string} label @param {string} k */
  const part = (label, k) => {
    const xs = col(k);
    return xs.length ? `${label} 中央値${median(xs)}ms(最大${Math.max(...xs)}ms)` : `${label} 未測定`;
  };
  /** 押した時刻が無くても出せる文書内の数字(全回)。 @param {string} k */
  const docCol = (k) => all.map((e) => e[k]).filter((v) => typeof v === 'number');
  const docPart = () => {
    const fp = docCol('docToFirstPaintMs');
    const sa = docCol('scriptAtMs');
    if (!fp.length && !sa.length) return '';
    const stalls = all.reduce((n, e) => n + (Array.isArray(e.stalls) ? e.stalls.length : 0), 0);
    const lts = all.reduce((n, e) => n + (Array.isArray(e.ownLongTasks) ? e.ownLongTasks.length : 0), 0);
    const last = all[all.length - 1];
    const lastStalls = Array.isArray(last.stalls) && last.stalls.length ? last.stalls.map((/** @type {[number, number]} */ x) => `${x[0]}ms地点で${x[1]}ms`).join('・') : 'なし';
    return (
      ` / 全${all.length}回の文書内: 開始→最初の描画${fp.length ? ` 中央値${median(fp)}ms(最大${Math.max(...fp)}ms)` : ' 未測定'}` +
      ` / 文書作成→スクリプト開始${sa.length ? ` 中央値${median(sa)}ms(最大${Math.max(...sa)}ms)` : ' 未測定'}` +
      ` / 最初の3秒の主スレッド停止(120ms超)${stalls}件・自文書の長い処理${lts}件 / 直近の停止: ${lastStalls}`
    );
  };
  if (!ok.length) {
    return `サイドパネルを開く時間: 押した時刻が取れた回が0/${all.length}回(ツールバー以外で開いた・SW が控えられなかった等)${docPart()}`;
  }
  const cold = ok.filter((e) => typeof e.swAgeMs === 'number' && e.swAgeMs < 3000).length;
  const armed = ok.filter((e) => e.armed === true).length;
  const last = ok[ok.length - 1];
  const lastTxt = `直近 押下→文書開始${last.clickToDocMs ?? '?'}ms→最初の描画${last.clickToFirstPaintMs ?? '?'}ms→中身${last.clickToContentMs ?? '?'}ms`;
  return (
    `サイドパネルを開く時間(押下から・${ok.length}回): ` +
    [part('文書開始', 'clickToDocMs'), part('親の最初の描画', 'clickToFirstPaintMs'), part('中身の描画', 'clickToContentMs')].join(' / ') +
    ` / SW起こし直し直後${cold}回 / 事前用意済み${armed}回 / ${lastTxt}` +
    (ok.length < all.length ? ` / 押した時刻なし${all.length - ok.length}回` : '') +
    docPart()
  );
}
