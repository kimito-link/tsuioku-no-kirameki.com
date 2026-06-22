/**
 * 応援レーンの「鏡」スナップショット純関数。popup がレーンを描いた buckets を、status が本物の
 * paintStoryUserLaneDomFilled + buildPersonTileEl でそっくり再描画できる最小データに間引いて保存する。
 * laneDiag.js(人数だけ)と同思想だが、こちらは avatar/表示名まで含む=別キー(laneMirrorKey.js)に分離。
 *
 * ★buildPersonTileEl が読むのは displaySrc / title / meta.idLine / meta.nameLine / entry.userId の
 *   5フィールドだけ(personTileDom.js)。鏡もこの5つだけ保存=最小化。
 * ★各段 cap で件数を抑え、全体が容量上限(JSON 512KB)を超えるなら cap を半減する二段ガード=status を重くしない。
 *
 * @typedef {{ displaySrc: string, title: string, idLine: string, nameLine: string, userId: string }} LaneMirrorCell
 * @typedef {{
 *   liveId: string,
 *   capturedAt: number,
 *   link: LaneMirrorCell[],
 *   gift: LaneMirrorCell[],
 *   ad: LaneMirrorCell[],
 *   konta: LaneMirrorCell[],
 *   tanu: LaneMirrorCell[],
 *   pickedLength: number,
 *   totalCandidates: number
 * }} LaneMirrorSnapshot
 */

const LANE_MIRROR_TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
/** 1スナップショットの上限(これを超えたら各段 cap を半減して作り直す)。 */
const LANE_MIRROR_MAX_JSON_BYTES = 512 * 1024;

/**
 * buckets の1要素を鏡セルに間引く。
 * @param {unknown} item
 * @returns {LaneMirrorCell|null}
 */
function toMirrorCell(item) {
  const it = /** @type {{ displaySrc?: unknown, title?: unknown, meta?: { idLine?: unknown, nameLine?: unknown }, entry?: { userId?: unknown } }} */ (
    item && typeof item === 'object' ? item : {}
  );
  const displaySrc = String(it.displaySrc || '').trim();
  if (!displaySrc) return null;
  return {
    displaySrc,
    title: String(it.title || '').trim(),
    idLine: String(it.meta?.idLine || ''),
    nameLine: String(it.meta?.nameLine || ''),
    userId: String(it.entry?.userId || '').trim()
  };
}

/**
 * 各段を cap 件に間引いた鏡 buckets を作る。
 * @param {Record<string, unknown[]>} buckets
 * @param {number} cap
 * @returns {Record<typeof LANE_MIRROR_TIERS[number], LaneMirrorCell[]>}
 */
function buildTiers(buckets, cap) {
  const out = /** @type {Record<string, LaneMirrorCell[]>} */ ({});
  for (const tier of LANE_MIRROR_TIERS) {
    const arr = Array.isArray(buckets?.[tier]) ? buckets[tier] : [];
    out[tier] = arr.slice(0, cap).map(toMirrorCell).filter(Boolean);
  }
  return /** @type {any} */ (out);
}

/**
 * storage 書き込み用の鏡スナップショット。容量超過時は cap を半減して作り直す(status を重くしない)。
 * @param {{ liveId?: unknown, buckets?: Record<string, unknown[]>, pickedLength?: unknown, totalCandidates?: unknown }} input
 * @param {{ cap?: number, nowMs?: number }} [opts]
 * @returns {LaneMirrorSnapshot}
 */
export function buildLaneMirrorSnapshot(input, opts = {}) {
  const liveId = String(input?.liveId || '');
  const buckets = input?.buckets && typeof input.buckets === 'object' ? input.buckets : {};
  const pickedLength = Math.max(0, Math.floor(Number(input?.pickedLength) || 0));
  const totalCandidates = Math.max(0, Math.floor(Number(input?.totalCandidates) || 0));
  const nowMs = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : 0;
  let cap = Math.max(1, Math.floor(Number(opts?.cap) || 48));

  /** @param {number} c */
  const make = (c) => ({
    liveId,
    capturedAt: nowMs,
    ...buildTiers(/** @type {any} */ (buckets), c),
    pickedLength,
    totalCandidates
  });

  let snap = make(cap);
  // 容量上限を超えたら cap を半減して作り直す(最大2回まで=最小16件)。
  for (let i = 0; i < 2; i += 1) {
    if (JSON.stringify(snap).length <= LANE_MIRROR_MAX_JSON_BYTES) break;
    cap = Math.max(16, Math.floor(cap / 2));
    snap = make(cap);
  }
  return /** @type {LaneMirrorSnapshot} */ (snap);
}

/**
 * 鏡スナップショットを paintStoryUserLaneDomFilled が受ける buckets 形({displaySrc,title,meta,entry})に復元する。
 * @param {Partial<LaneMirrorSnapshot>|null|undefined} snap
 * @returns {{ link: object[], gift: object[], ad: object[], konta: object[], tanu: object[] }}
 */
export function restoreLaneMirrorBuckets(snap) {
  const s = /** @type {any} */ (snap && typeof snap === 'object' ? snap : {});
  const restore = (/** @type {unknown} */ arr) =>
    (Array.isArray(arr) ? arr : []).map((c) => {
      const cell = /** @type {LaneMirrorCell} */ (c && typeof c === 'object' ? c : {});
      return {
        displaySrc: String(cell.displaySrc || ''),
        title: String(cell.title || ''),
        meta: { idLine: String(cell.idLine || ''), nameLine: String(cell.nameLine || '') },
        entry: { userId: String(cell.userId || '') }
      };
    });
  return {
    link: restore(s.link),
    gift: restore(s.gift),
    ad: restore(s.ad),
    konta: restore(s.konta),
    tanu: restore(s.tanu)
  };
}
