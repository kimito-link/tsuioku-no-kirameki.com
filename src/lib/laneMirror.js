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
 * @typedef {{ visible: number, tileW: number, tileH: number }} LaneMirrorDomTier
 * @typedef {{ measured: boolean,
 *   perTier: { link: LaneMirrorDomTier, gift: LaneMirrorDomTier, ad: LaneMirrorDomTier, konta: LaneMirrorDomTier, tanu: LaneMirrorDomTier },
 *   dpr: number }} LaneMirrorDomSelf
 * @typedef {{
 *   liveId: string,
 *   capturedAt: number,
 *   link: LaneMirrorCell[],
 *   gift: LaneMirrorCell[],
 *   ad: LaneMirrorCell[],
 *   konta: LaneMirrorCell[],
 *   tanu: LaneMirrorCell[],
 *   domSelf: LaneMirrorDomSelf,
 *   pickedLength: number,
 *   totalCandidates: number,
 *   contentHash: string
 * }} LaneMirrorSnapshot
 *
 * ★pickedLength = popup が paint に渡す laneDisplayedTotal(全5段=りんく+ギフト+広告+こん太+たぬ姉の
 *   合計枠)。フッター「いま N 件を表示中」「ほか M人」が popup と一致するための数=りんく段だけの
 *   picked.length ではない(取り違え注意)。totalCandidates=素性が取れた候補総数(cap 前)で「ほか M人」用。
 */

// v0.1.1112(鏡スリム化 B-1・読み手先行): displaySrc が空で userId が有るセルは、読み手が
//   anonymousIdenticonDataUrl(uid, 64)(純関数・①と同じ顔)を再生成して復元する。
//   これは B-2(書き手が匿名 data URL を鏡から落とす)の前提となる後方互換フォールバック。
//   旧鏡(data URL入り)では displaySrc 非空→再生成パス不発=byte同一出力(退行ゼロ)。
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
// v0.1.1137(lanescene-structural-review MVP): 一致証明の contentHash は capturedAt 確定前の
//   確定フィールド(userId/displaySrc/title)のみで計算する(揺れるフィールドを混ぜない=既知地雷)。
import { laneSceneContentHash } from './laneSceneEnvelope.js';

const LANE_MIRROR_TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
/** 1スナップショットの上限(これを超えたら各段 cap を半減して作り直す)。 */
const LANE_MIRROR_MAX_JSON_BYTES = 512 * 1024;

/** @param {unknown} value @param {boolean} [integer] */
function nonNegativeMetric(value, integer = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return integer ? Math.floor(n) : Math.round(n * 100) / 100;
}

/** @param {unknown} input @returns {LaneMirrorDomSelf} */
function normalizeDomSelf(input) {
  const source = /** @type {any} */ (input && typeof input === 'object' ? input : {});
  const sourceTiers = source.perTier && typeof source.perTier === 'object' ? source.perTier : {};
  /** @type {Record<string, LaneMirrorDomTier>} */
  const perTier = {};
  for (const tier of LANE_MIRROR_TIERS) {
    const raw = sourceTiers[tier] && typeof sourceTiers[tier] === 'object' ? sourceTiers[tier] : {};
    perTier[tier] = {
      visible: nonNegativeMetric(raw.visible, true),
      tileW: nonNegativeMetric(raw.tileW),
      tileH: nonNegativeMetric(raw.tileH)
    };
  }
  const rawDpr = Number(source.dpr);
  return {
    measured: source.measured === true,
    perTier: /** @type {LaneMirrorDomSelf['perTier']} */ (perTier),
    dpr: Number.isFinite(rawDpr) && rawDpr > 0 ? Math.round(rawDpr * 1000) / 1000 : 1
  };
}

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
 * @param {{ liveId?: unknown, buckets?: Record<string, unknown[]>, pickedLength?: unknown,
 *   totalCandidates?: unknown, domSelf?: unknown }} input
 * @param {{ cap?: number, nowMs?: number }} [opts]
 * @returns {LaneMirrorSnapshot}
 */
export function buildLaneMirrorSnapshot(input, opts = {}) {
  const liveId = String(input?.liveId || '');
  const buckets = input?.buckets && typeof input.buckets === 'object' ? input.buckets : {};
  const pickedLength = Math.max(0, Math.floor(Number(input?.pickedLength) || 0));
  const totalCandidates = Math.max(0, Math.floor(Number(input?.totalCandidates) || 0));
  const domSelf = normalizeDomSelf(input?.domSelf);
  const nowMs = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : 0;
  let cap = Math.max(1, Math.floor(Number(opts?.cap) || 48));

  /** @param {number} c */
  const make = (c) => {
    const tiers = buildTiers(/** @type {any} */ (buckets), c);
    return {
      liveId,
      capturedAt: nowMs,
      ...tiers,
      domSelf,
      pickedLength,
      totalCandidates,
      // v0.1.1137(lanescene-structural-review MVP): revisionはcapturedAt(壁時計)をそのまま使う
      //   (新規カウンタを作らない)。contentHashはcap後の実際のセル列から計算=会場が受け取る
      //   restoreLaneMirrorBuckets後の中身と同じ範囲で突合できる。
      contentHash: laneSceneContentHash(/** @type {any} */ (tiers))
    };
  };

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
      const userId = String(cell.userId || '').trim();
      // v0.1.1112 B-1: displaySrc 空+uid有り=スリム化された匿名セル→①と同じ顔を再生成(冪等)。
      const displaySrc =
        String(cell.displaySrc || '') || (userId ? anonymousIdenticonDataUrl(userId, 64) : '');
      return {
        displaySrc,
        title: String(cell.title || ''),
        meta: { idLine: String(cell.idLine || ''), nameLine: String(cell.nameLine || '') },
        entry: { userId }
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
