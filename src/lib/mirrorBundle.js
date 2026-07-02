/**
 * 5種類の「鏡」を同一 tick の 1 バンドルとして扱うための合流バッファ純関数。
 *
 * ここでは storage read/write や各セクションの再構成はしない。popup が既に作った各鏡
 * snapshot をそのまま section に載せ、flush 直前に gen を 1 回だけ進めるための薄い土台。
 *
 * @module mirrorBundle
 */

/**
 * @typedef {import('./laneMirror.js').LaneMirrorSnapshot} LaneMirrorSnapshot
 * @typedef {import('./statCardsMirror.js').StatCardsMirrorSnapshot} StatCardsMirrorSnapshot
 * @typedef {import('./northStarMirror.js').NorthStarMirrorSnapshot} NorthStarMirrorSnapshot
 * @typedef {import('./commentTimelineMirror.js').CommentTimelineMirrorSnapshot} CommentTimelineMirrorSnapshot
 *
 * @typedef {{ userKey: string, nickname: string, count: number, avatarUrl: string }} TopSupportersMirrorCell
 * @typedef {{ liveId: string, capturedAt: number, rooms: TopSupportersMirrorCell[] }} TopSupportersMirrorSnapshot
 *
 * @typedef {'lane'|'statCards'|'topSupporters'|'northStar'|'commentTimeline'} MirrorBundleSectionKey
 * @typedef {{
 *   lane: LaneMirrorSnapshot|null,
 *   statCards: StatCardsMirrorSnapshot|null,
 *   topSupporters: TopSupportersMirrorSnapshot|null,
 *   northStar: NorthStarMirrorSnapshot|null,
 *   commentTimeline: CommentTimelineMirrorSnapshot|null
 * }} MirrorBundleSections
 * @typedef {{
 *   liveId: string,
 *   gen: number,
 *   capturedAt: number,
 *   sections: MirrorBundleSections
 * }} MirrorBundle
 */

const SECTION_KEYS = /** @type {const} */ ([
  'lane',
  'statCards',
  'topSupporters',
  'northStar',
  'commentTimeline'
]);

/** @returns {MirrorBundleSections} */
function createEmptySections() {
  return {
    lane: null,
    statCards: null,
    topSupporters: null,
    northStar: null,
    commentTimeline: null
  };
}

/** @param {unknown} value @returns {Record<string, any>} */
function objectOrEmpty(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, any>} */ (value) : {};
}

/** @param {unknown} value @returns {string} */
function normalizeLiveId(value) {
  return String(value || '').trim().toLowerCase();
}

/** @param {unknown} value @returns {number} */
function finiteNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** @param {unknown} value @returns {number} */
function genNumberOrZero(value) {
  return Math.max(0, Math.floor(finiteNumberOrZero(value)));
}

/** @param {unknown} value @returns {MirrorBundleSectionKey|null} */
function normalizeSectionKey(value) {
  const key = String(value || '');
  return SECTION_KEYS.includes(/** @type {MirrorBundleSectionKey} */ (key))
    ? /** @type {MirrorBundleSectionKey} */ (key)
    : null;
}

/** @param {unknown} sections @returns {MirrorBundleSections} */
function normalizeSections(sections) {
  const s = objectOrEmpty(sections);
  return {
    lane: s.lane ?? null,
    statCards: s.statCards ?? null,
    topSupporters: s.topSupporters ?? null,
    northStar: s.northStar ?? null,
    commentTimeline: s.commentTimeline ?? null
  };
}

/** @param {unknown} buffer @returns {MirrorBundle} */
function normalizeBundle(buffer) {
  const b = objectOrEmpty(buffer);
  return {
    liveId: normalizeLiveId(b.liveId),
    gen: genNumberOrZero(b.gen),
    capturedAt: finiteNumberOrZero(b.capturedAt),
    sections: normalizeSections(b.sections)
  };
}

/**
 * 空の鏡バンドルを作る。
 * @returns {MirrorBundle}
 */
export function createEmptyMirrorBundle() {
  return {
    liveId: '',
    gen: 0,
    capturedAt: 0,
    sections: createEmptySections()
  };
}

/**
 * 鏡バンドルの 1 セクションだけを差し替える。
 *
 * ★mergeNorthStarMirrorLanes と同じ不変条件: 配信(liveId)が同じ限り、未指定セクションは温存する。
 *   これにより非決定的な解決順でも「後着セクションが先着セクションを消す」事故を防ぐ。
 *
 * ★gen は配信切替でも巻き戻さない(バンドル生涯で単調)。理由: 読み手(②③)の単調性ガード
 *   isMirrorBundleGenerationStale が gen の数値比較だけで「古い鏡」を弾くため、配信切替で gen を 0 に
 *   戻すと「lv1 を gen5 まで描いた読み手が、lv2 の gen1 を stale と誤判定して新配信を描かない」事故が起きる。
 *   → liveId リセット時もセクションだけ空にし gen は base.gen を温存する。配信切替の検知は liveId 突合で別途行う
 *   (gen は飛び番でよい・単調でありさえすればガードは正しく働く)。council/pop-foundation-then-parity-SYNTHESIS.md §3.5。
 *
 * ★capturedAt は単調化する(Math.max)。理由: フェーズ2の緑条件が「各鏡 capturedAt 同値」を計器に使うため、
 *   nowMs 未指定 merge で 0 に落ちたり古い nowMs で巻き戻ると計器が惑う。時刻は前進のみ。
 *
 * @param {MirrorBundle|unknown} buffer 現在の合流バッファ
 * @param {MirrorBundleSectionKey|unknown} sectionKey 更新するセクション
 * @param {unknown} sectionSnapshot 各鏡 build 関数が返した snapshot
 * @param {{ liveId?: unknown, nowMs?: unknown }|null|undefined} [opts]
 * @returns {MirrorBundle}
 */
export function mergeMirrorBundleSection(buffer, sectionKey, sectionSnapshot, opts = {}) {
  const key = normalizeSectionKey(sectionKey);
  const base = normalizeBundle(buffer);
  if (!key) return base;

  const options = objectOrEmpty(opts);
  const patchLiveId = normalizeLiveId(options.liveId);
  const shouldResetForLive = Boolean(patchLiveId && patchLiveId !== base.liveId);
  // 配信切替時はセクションだけ空にする(gen/capturedAt は温存=巻き戻さない)。
  const seedSections = shouldResetForLive ? createEmptySections() : base.sections;

  return {
    liveId: patchLiveId || base.liveId,
    gen: base.gen, // 配信切替でも巻き戻さない(バンドル生涯で単調)。
    capturedAt: Math.max(base.capturedAt, finiteNumberOrZero(options.nowMs)),
    sections: {
      ...seedSections,
      [key]: sectionSnapshot ?? null
    }
  };
}

/**
 * flush 直前にバンドル世代を 1 回だけ進める。
 * merge のたびに gen を進めると「同一 tick の複数セクション」を表せなくなるため、ここに責務を分ける。
 *
 * @param {MirrorBundle|unknown} buffer
 * @param {unknown} nowMs
 * @returns {MirrorBundle}
 */
export function bumpMirrorBundleGeneration(buffer, nowMs) {
  const base = normalizeBundle(buffer);
  return {
    ...base,
    gen: base.gen + 1,
    // capturedAt は単調化(前進のみ)。nowMs 未指定/巻き戻りで計器が惑わないように。
    capturedAt: Math.max(base.capturedAt, finiteNumberOrZero(nowMs)),
    sections: { ...base.sections }
  };
}

/**
 * 読み手側が古い世代のバンドルで DOM を戻さないための単調性ガード。
 *
 * lastPaintedGen が未定義なら「まだ描いていない」ので初回描画を許す。以後は incomingGen が
 * lastPaintedGen 以下なら stale とみなす。
 *
 * @param {unknown} lastPaintedGen
 * @param {unknown} incomingGen
 * @returns {boolean}
 */
export function isMirrorBundleGenerationStale(lastPaintedGen, incomingGen) {
  if (lastPaintedGen === undefined || lastPaintedGen === null || lastPaintedGen === '') return false;
  const last = genNumberOrZero(lastPaintedGen);
  const incoming = genNumberOrZero(incomingGen);
  return incoming <= last;
}

/**
 * バンドルから指定セクションの snapshot を取り出すだけの null-safe アクセサ。
 * 実際の復元は各鏡ファイルの restore 関数に委ねる。
 *
 * @param {MirrorBundle|unknown} bundle
 * @param {MirrorBundleSectionKey|unknown} sectionKey
 * @returns {unknown|null}
 */
export function restoreMirrorBundleSection(bundle, sectionKey) {
  const key = normalizeSectionKey(sectionKey);
  if (!key) return null;
  const b = objectOrEmpty(bundle);
  const sections = objectOrEmpty(b.sections);
  return sections[key] ?? null;
}
