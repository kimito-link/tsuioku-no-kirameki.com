/**
 * 鏡バンドルの flush スケジューラ(状態を内部に閉じた純ロジック・タイマー非依存)。
 *
 * 5種類の鏡(応援レーン/数字カード/応援者ランキング/北極星/コメント流れ)を、popup がバラバラの tick で
 * 書くのをやめ、**1つの合流バッファに反映 → まとめて 1 回だけ storage へ書く**ための土台。
 * 実際の setTimeout / chrome.storage.local.set は呼び手(popup-entry.js)に薄く置き、ここは
 * 「反映・min-gap 判定・出すべきペイロード(旧5キー同梱)の組み立て」だけを純粋に担う(テスト容易・行数を popup に足さない)。
 *
 * 設計正本: council/pop-foundation-then-parity-SYNTHESIS.md(§3.5/§3.6)。
 * 手本: commentMirrorPublishGate.js(状態を lib factory に閉じる流儀)・mergeNorthStarMirrorLanes(合流の不変条件)。
 *
 * ★min-gap はここに一元化する(各 publishXxx の個別 min-gap を廃止)。gap 中に来た更新はバッファに
 *   残り、次の flush で必ず載る=「gap 中の最新データを捨てる」取りこぼし(F-1)を根治。
 *
 * @module mirrorBundleFlushScheduler
 */
import {
  createEmptyMirrorBundle,
  mergeMirrorBundleSection,
  bumpMirrorBundleGeneration
} from './mirrorBundle.js';
import { KEY_LANE_MIRROR } from './laneMirrorKey.js';
import { KEY_STAT_CARDS_MIRROR } from './statCardsMirrorKey.js';
import { KEY_TOP_SUPPORTERS_MIRROR } from './storageKeys.js';
import { KEY_NORTH_STAR_MIRROR } from './northStarMirrorKey.js';
import { KEY_COMMENT_TIMELINE_MIRROR } from './commentTimelineMirrorKey.js';
import { KEY_GIFT_HISTORY_MIRROR } from './giftHistoryMirrorKey.js';
import { KEY_ROOM_HEAT_MIRROR } from './roomHeatMirrorKey.js';

const DEFAULT_MIN_GAP_MS = 3000;

/** section → 旧 storage キー(同梱書き込み用)。読み手(②③)を無変更のまま同一 tick 一貫にするため。 */
const SECTION_TO_LEGACY_KEY = /** @type {const} */ ({
  lane: KEY_LANE_MIRROR,
  statCards: KEY_STAT_CARDS_MIRROR,
  topSupporters: KEY_TOP_SUPPORTERS_MIRROR,
  northStar: KEY_NORTH_STAR_MIRROR,
  commentTimeline: KEY_COMMENT_TIMELINE_MIRROR,
  giftHistory: KEY_GIFT_HISTORY_MIRROR,
  roomHeat: KEY_ROOM_HEAT_MIRROR
});

/**
 * 合流バッファから「1 回の chrome.storage.local.set に渡す旧キー同梱ペイロード」を組む純関数。
 *   null セクション(まだ一度も来ていない鏡)は同梱しない=既存の storage 値を消さない。
 *
 * v0.1.1056(パリティ根本修正 Phase1): 各 snapshot に bundle の「封筒」(gen/capturedAt/liveId)を
 *   スタンプする。従来は bundle.gen が読み手(②/status)に一切公開されず、①と②が「同じ瞬間の
 *   データを見ているか」を構造的に検証できなかった(値の食い違いを見るしかなく、世代のズレを
 *   見られなかった)。shallow copy でスタンプするため元の snapshot オブジェクト(バッファ内)は
 *   不変=既存の参照共有ロジックに影響しない。読み手は未知フィールドを無視するので後方互換。
 * @param {import('./mirrorBundle.js').MirrorBundle} bundle
 * @returns {Record<string, unknown>} storage.set にそのまま渡せる {キー: snapshot} マップ
 */
export function buildLegacyMirrorSetPayload(bundle) {
  const sections = bundle && bundle.sections && typeof bundle.sections === 'object' ? bundle.sections : {};
  const gen = Number(bundle?.gen) || 0;
  const capturedAt = Number(bundle?.capturedAt) || 0;
  const liveId = String(bundle?.liveId || '');
  /** @type {Record<string, unknown>} */
  const payload = {};
  for (const section of Object.keys(SECTION_TO_LEGACY_KEY)) {
    const snap = /** @type {Record<string, any>} */ (sections)[section];
    if (snap != null) {
      payload[/** @type {Record<string,string>} */ (SECTION_TO_LEGACY_KEY)[section]] = {
        ...snap,
        bundleGen: gen,
        bundleCapturedAt: capturedAt,
        bundleLiveId: liveId
      };
    }
  }
  return payload;
}

/**
 * flush スケジューラの factory。popup-entry はこれ 1 個を持ち、reflect() で各鏡を合流バッファへ反映し、
 * takeFlushPayload() で「今 flush してよいか＋出すべきペイロード」を得る。タイマーは呼び手が持つ。
 *
 * @param {{ minGapMs?: number }} [opts]
 */
export function createMirrorBundleFlushScheduler(opts = {}) {
  const rawGap = Number(opts?.minGapMs);
  const minGapMs = opts && opts.minGapMs != null && Number.isFinite(rawGap) && rawGap >= 0 ? rawGap : DEFAULT_MIN_GAP_MS;
  let buffer = createEmptyMirrorBundle();
  let dirty = false;
  let lastFlushAt = 0;

  return {
    /**
     * 1 鏡分の snapshot を合流バッファへ反映する(dirty 印を立てる)。storage には書かない。
     * @param {import('./mirrorBundle.js').MirrorBundleSectionKey} sectionKey
     * @param {unknown} snapshot 各鏡 build 関数の戻り(null なら無視=既存を消さない)
     * @param {{ liveId?: unknown, nowMs?: unknown }} [reflectOpts]
     */
    reflect(sectionKey, snapshot, reflectOpts = {}) {
      if (snapshot == null) return;
      buffer = mergeMirrorBundleSection(buffer, sectionKey, snapshot, reflectOpts);
      dirty = true;
    },

    /** dirty か(呼び手が flush タイマーを張るか判断する)。 */
    isDirty() {
      return dirty;
    },

    /**
     * flush してよいなら「gen を進めたバンドル＋旧キー同梱ペイロード」を返す。まだなら null。
     *   dirty でない/ min-gap 未経過なら null(呼び手は書かない・タイマー再張りは呼び手判断)。
     * @param {number} nowMs
     * @returns {{ bundle: import('./mirrorBundle.js').MirrorBundle, legacyPayload: Record<string, unknown> }|null}
     */
    takeFlushPayload(nowMs) {
      const now = Number(nowMs) || 0;
      if (!dirty) return null;
      if (minGapMs > 0 && lastFlushAt > 0 && now - lastFlushAt < minGapMs) return null;
      buffer = bumpMirrorBundleGeneration(buffer, now);
      lastFlushAt = now;
      dirty = false;
      return { bundle: buffer, legacyPayload: buildLegacyMirrorSetPayload(buffer) };
    },

    /** 現在の合流バッファ(観測・テスト用・書き換えない)。 */
    peekBundle() {
      return buffer;
    }
  };
}
