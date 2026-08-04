/**
 * 応援レーンの供給元(誰が entriesProvisional を書いたか)を名指しする計器。
 *
 * ★なぜ要るか(2026-08-04):
 *   `syncStorySourceEntries` は 5 箇所から呼ばれ、うち 3 箇所は opts 無指定
 *   (= provisional が既定値になる)。実配信で `provisional-false` によりタイル消失が
 *   起きたとき、**どの呼び出し元が書いたのかを機械的に特定する手段が無かった**。
 *   過去10回のちらつき修正が「効いたのか、たまたま出なかったのか」を判別できず
 *   再発を繰り返した根本には、この「原因を名指しできない」構造がある
 *   ([[instrument-must-name-the-cause-2026-08-01]])。
 *
 * ★設計方針: 計器は原因を出す。症状(回数)だけを出しても開発者は誤判定する。
 *   - 呼び出し元タグ別に「provisional=true/false のどちらで書いたか」を数える
 *   - 既定値のまま書かれた(=申告漏れの疑い)回数を独立して数える
 *   - 「タイルが減った瞬間の供給元」を最後の1件だけ保持する(犯人の現行犯記録)
 */

/**
 * @typedef {{ provTrue: number, provFalse: number, defaulted: number }} LaneSupplyOriginCell
 * @typedef {{ origin: string, provisional: number, prevTiles: number, nextTiles: number }} LaneSupplyShrinkCulprit
 * @typedef {object} LaneSupplyOriginDiag
 * @property {Record<string, LaneSupplyOriginCell>} byOrigin タグ別の内訳
 * @property {number} defaultedTotal provisional を明示しなかった書き込み総数(申告漏れの疑い)
 * @property {string} lastOrigin 直近に書いた供給元タグ
 * @property {number} lastProvisional 直近の provisional 実値(-1=未計測 / 0=false / 1=true)
 * @property {LaneSupplyShrinkCulprit|null} shrinkCulprit タイルが減った直前の供給元(現行犯記録)
 * @property {number} shrinkObservedCount 縮小を観測した回数
 */

/** 供給元タグの正本(状態速報のラベルにそのまま使う)。 */
export const LANE_SUPPLY_ORIGIN = Object.freeze({
  HEAVY: 'heavy_refresh', // 本線(refresh の heavy 経路)
  LIGHT: 'light_summary', // 軽量 summary+tail 経路
  FALLBACK: 'storage_fallback', // storage から復元する経路
  RESET_NO_WATCH: 'reset_no_watch', // watch タブを見失った時のリセット
  UNKNOWN: 'unknown'
});

/** @returns {LaneSupplyOriginDiag} 供給元計器の初期状態 */
export function createLaneSupplyOriginDiag() {
  return {
    /** タグ別 { provTrue, provFalse, defaulted } */
    byOrigin: {},
    /** 既定値のまま(opts 無指定)で書かれた総数=申告漏れの疑い。 */
    defaultedTotal: 0,
    /** 直近に書いた供給元タグ。 */
    lastOrigin: '',
    /** 直近に書いた provisional 実値(-1=未計測 / 0=false / 1=true)。 */
    lastProvisional: -1,
    /**
     * ★現行犯記録: タイルが減った paint の直前に供給を書いた者。
     *   { origin, provisional, prevTiles, nextTiles } を1件だけ保持する。
     */
    shrinkCulprit: null,
    /** 縮小を観測した回数(shrinkCulprit の更新回数)。 */
    shrinkObservedCount: 0
  };
}

/**
 * 供給の書き込みを1件記録する(計器の失敗は描画を止めない)。
 *
 * @param {LaneSupplyOriginDiag|null|undefined} diag createLaneSupplyOriginDiag() の戻り
 * @param {{ origin?: string, provisional?: unknown, defaulted?: boolean }} info
 *   defaulted=true は「呼び出し側が provisional を明示しなかった」を意味する。
 */
export function noteLaneSupplyWrite(diag, info) {
  if (!diag || typeof diag !== 'object') return;
  try {
    const origin = String(info?.origin || LANE_SUPPLY_ORIGIN.UNKNOWN);
    const prov = info?.provisional === true;
    const bag = diag.byOrigin || (diag.byOrigin = {});
    const cell = bag[origin] || (bag[origin] = { provTrue: 0, provFalse: 0, defaulted: 0 });
    if (prov) cell.provTrue += 1;
    else cell.provFalse += 1;
    if (info?.defaulted === true) {
      cell.defaulted += 1;
      diag.defaultedTotal = (Number(diag.defaultedTotal) || 0) + 1;
    }
    diag.lastOrigin = origin;
    diag.lastProvisional = prov ? 1 : 0;
  } catch { /* 計器の失敗は描画を止めない */ }
}

/**
 * タイルが減った瞬間を記録する(犯人の現行犯記録)。
 *
 * ★判定はここに閉じる: 呼び出し側(popup-entry)に条件式を書くと、計器の都合で
 *   hot path の行数と分岐が増える。「記録すべきか」は計器の責務。
 *   guardHit=true(ガードが守って描かない)ときは画面が減らないので記録しない。
 *
 * @param {LaneSupplyOriginDiag|null|undefined} diag
 * @param {{ prevTiles?: number, nextTiles?: number, guardHit?: boolean }} info
 */
export function noteLaneSupplyShrink(diag, info) {
  if (!diag || typeof diag !== 'object') return;
  const prev = Math.max(0, Math.floor(Number(info?.prevTiles) || 0));
  const next = Math.max(0, Math.floor(Number(info?.nextTiles) || 0));
  if (info?.guardHit === true || prev <= 0 || next >= prev) return; // 実際には減っていない
  try {
    diag.shrinkObservedCount = (Number(diag.shrinkObservedCount) || 0) + 1;
    diag.shrinkCulprit = {
      origin: String(diag.lastOrigin || LANE_SUPPLY_ORIGIN.UNKNOWN),
      provisional: Number(diag.lastProvisional),
      prevTiles: prev,
      nextTiles: next
    };
  } catch { /* 計器の失敗は描画を止めない */ }
}

/**
 * 診断JSONに出す形へ(そのまま状態速報 lite に通す)。
 * @param {LaneSupplyOriginDiag|null|undefined} diag
 * @returns {object|null}
 */
export function snapshotLaneSupplyOriginDiag(diag) {
  if (!diag || typeof diag !== 'object') return null;
  const bag = diag.byOrigin && typeof diag.byOrigin === 'object' ? diag.byOrigin : {};
  /** @type {Record<string, LaneSupplyOriginCell>} */
  const byOrigin = {};
  for (const k of Object.keys(bag)) {
    const c = bag[k] || /** @type {LaneSupplyOriginCell} */ ({});
    byOrigin[k] = {
      provTrue: Number(c.provTrue) || 0,
      provFalse: Number(c.provFalse) || 0,
      defaulted: Number(c.defaulted) || 0
    };
  }
  return {
    byOrigin,
    defaultedTotal: Number(diag.defaultedTotal) || 0,
    lastOrigin: String(diag.lastOrigin || ''),
    lastProvisional: Number.isFinite(diag.lastProvisional) ? Number(diag.lastProvisional) : -1,
    shrinkObservedCount: Number(diag.shrinkObservedCount) || 0,
    shrinkCulprit: diag.shrinkCulprit || null,
    line: formatLaneSupplyOriginLine(diag)
  };
}

/**
 * 状態速報の1行にする。★症状でなく原因を名指しする。
 * @param {LaneSupplyOriginDiag|null|undefined} diag
 * @returns {string}
 */
export function formatLaneSupplyOriginLine(diag) {
  if (!diag || typeof diag !== 'object') return 'レーン供給元 —';
  const bag = diag.byOrigin && typeof diag.byOrigin === 'object' ? diag.byOrigin : {};
  const parts = [];
  for (const k of Object.keys(bag)) {
    const c = bag[k] || /** @type {LaneSupplyOriginCell} */ ({});
    const t = Number(c.provTrue) || 0;
    const f = Number(c.provFalse) || 0;
    const d = Number(c.defaulted) || 0;
    parts.push(`${k}(暫定${t}/確定${f}${d > 0 ? `・既定のまま${d}` : ''})`);
  }
  const head = parts.length ? parts.join(' / ') : '観測なし';
  const lines = [`レーン供給元: ${head}`];

  const defaulted = Number(diag.defaultedTotal) || 0;
  if (defaulted > 0) {
    lines.push(`  → ⚠ provisional を明示せず書いた呼び出しが ${defaulted} 回=申告漏れの疑い(既定値に依存)`);
  }

  const culprit = diag.shrinkCulprit;
  if (culprit && typeof culprit === 'object') {
    const provLabel = Number(culprit.provisional) === 1 ? '暫定' : '確定';
    lines.push(
      `  → ★タイルが減った直前の供給元: ${culprit.origin}(${provLabel}) ` +
      `${culprit.prevTiles}枚→${culprit.nextTiles}枚` +
      (Number(culprit.provisional) === 1 ? '' : ' ← 確定を名乗ったため縮小ガードが素通り')
    );
  } else if ((Number(diag.shrinkObservedCount) || 0) === 0) {
    lines.push('  → ✅ タイルの縮小は観測されていません');
  }
  return lines.join('\n');
}
