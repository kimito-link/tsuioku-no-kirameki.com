// statusExtrasBatch.js
// 状態速報「重さ根治 P2」: status-entry.js の extras ブロック(12秒間引き)が単一キー get だけの
//   項目(17個)を【直列に1回ずつ】await していたのを、1回の chrome.storage.local.get([keys...])
//   へ統合するための純粋部品。
//
// 背景: chrome.storage.local は単一 LevelDB で並行 read が競合する(storageOpTimeout.js の
//   背景コメント参照)。extras の各項目は runStorageOpWithTimeout でそれぞれ独立に
//   タイムアウト待ちするため、混雑時は理論最悪 19×タイムアウトまで extras 全体が伸びる。
//   単一キー get しかしない項目は 1 回の get([...])にまとめても意味は同じ(chrome.storage.local.get は
//   配列 keys を渡せば元々「1回で全部読む」設計)なので、直列 await の回数を1回に削るだけで安全に縮められる。
//
// ★統合しないもの(意図的に対象外・status-entry.js 側で従来どおり個別 await):
//   - queryWatchTabMap(chrome.tabs.query。storage.local ではない別 API)
//   - recordAndAnalyzeTrendSafe(read に加えて set も行う=バッチ get に混ぜると意味が変わる)
//   - loadCustomSoundDiagSafe(IndexedDB open+count+fetch(manifest) を伴う。P1(v0.1.1084)で
//     count() 化済みの別種の重さ対策で、単一キー get ではない)
//
// キー定数はすべて既存 lib から re-export ではなく import する(status-entry.js のローカル定数に
//   依存しない=循環 import 回避。status-entry.js 側は従来どおり自分の import 文でキーを持つ)。

import { KEY_VOICE_DIAG } from './voiceDiagKey.js';
import { KEY_VENUE_SEATS_DIAG } from './venueSeatsDiagKey.js';
import { KEY_REPORT_PREVIEW, isReportPreviewFresh } from './reportPreviewKey.js';
import { KEY_LANE_DIAG } from './laneDiagKey.js';
import { KEY_LANE_MIRROR } from './laneMirrorKey.js';
import { KEY_STAT_CARDS_MIRROR } from './statCardsMirrorKey.js';
import { KEY_NORTH_STAR_MIRROR } from './northStarMirrorKey.js';
import { KEY_LIVEVIEW_PUBLISH_OUTCOME } from './liveviewPublishOutcomeKey.js';
import { KEY_COMMENT_TIMELINE_MIRROR } from './commentTimelineMirrorKey.js';
import { KEY_PREVIEW_RENDER_ACK } from './previewRenderAckKey.js';
import { KEY_BACKFILL_LIVE_METRIC } from './storageKeys.js';
import { KEY_GIFT_EFFECT_DIAG } from './giftEffectDiagKey.js';
import { KEY_MILESTONE_EFFECT_DIAG } from './milestoneEffectDiagKey.js';
import { KEY_VOICE_EFFECT_DIAG } from './voiceEffectDiagKey.js';
import { KEY_BGM_PHASE_DIAG } from './bgmPhaseDiagKey.js';
import { KEY_OP_SOUND_EFFECT_DIAG } from './opSoundEffectDiagKey.js';
import { KEY_COMMENT_POST_DIAG } from './commentPostDiagKey.js';
import { KEY_INSTANT_PUSH_DIAG } from './instantPushDiagKey.js';
import { KEY_CHANNEL_SWITCH_DIAG } from './channelSwitchDiagKey.js';

/**
 * 1回の chrome.storage.local.get で統合して読む19キー(いずれも単一キー get のみの項目)。
 *   v0.1.1083 で追加された commentPostDiag(KEY_COMMENT_POST_DIAG)、
 *   v0.1.1092 で追加された instantPushDiag(KEY_INSTANT_PUSH_DIAG)、
 *   2026-07-06 で追加された channelSwitchDiag(KEY_CHANNEL_SWITCH_DIAG)も含む。
 *   status-entry.js 側は runStorageOpWithTimeout(() => safeStorageLocalGet(EXTRAS_BATCH_KEYS), tmo)
 *   のように1回だけ呼ぶ。
 */
export const EXTRAS_BATCH_KEYS = [
  KEY_VOICE_DIAG,
  KEY_VENUE_SEATS_DIAG,
  KEY_REPORT_PREVIEW,
  KEY_LANE_DIAG,
  KEY_LANE_MIRROR,
  KEY_STAT_CARDS_MIRROR,
  KEY_NORTH_STAR_MIRROR,
  KEY_LIVEVIEW_PUBLISH_OUTCOME,
  KEY_COMMENT_TIMELINE_MIRROR,
  KEY_PREVIEW_RENDER_ACK,
  KEY_BACKFILL_LIVE_METRIC,
  KEY_GIFT_EFFECT_DIAG,
  KEY_MILESTONE_EFFECT_DIAG,
  KEY_VOICE_EFFECT_DIAG,
  KEY_BGM_PHASE_DIAG,
  KEY_OP_SOUND_EFFECT_DIAG,
  KEY_COMMENT_POST_DIAG,
  KEY_INSTANT_PUSH_DIAG,
  KEY_CHANNEL_SWITCH_DIAG
];

/**
 * chrome.storage.local.get(EXTRAS_BATCH_KEYS) で得た bag から、各 extras 値を取り出す純関数。
 *   bag が undefined/null/非オブジェクトでも安全(全項目 null 相当で返す)。
 *   reportPreview だけは既存の鮮度判定(isReportPreviewFresh)を適用し、古い/欠損なら null にする
 *   (loadReportPreviewSafe の挙動と同値)。それ以外は「欠損なら null」(各 loadXxxSafe の
 *   `bag?.[KEY] || null` と同値)。
 * @param {Record<string, unknown>|null|undefined} bag chrome.storage.local.get の戻り
 * @param {number} nowMs Date.now()(reportPreview の鮮度判定に使う。呼び出し側から注入=テスト容易)
 * @returns {{
 *   voiceDiag: any, venueSeatsDiag: any, reportPreview: any, laneDiag: any, laneMirror: any,
 *   statCardsMirror: any, northStarMirror: any, publishOutcomeRec: any, commentTimelineMirror: any,
 *   previewRenderAck: any, backfillLiveMetric: any, giftEffectDiag: any, milestoneEffectDiag: any,
 *   voiceEffectDiag: any, bgmPhaseDiag: any, opSoundEffectDiag: any, commentPostDiag: any,
 *   instantPushDiag: any, channelSwitchDiag: any
 * }}
 */
export function pickExtrasBatchValues(bag, nowMs) {
  const b = bag && typeof bag === 'object' ? bag : {};
  const reportPreviewRec = b[KEY_REPORT_PREVIEW];
  return {
    voiceDiag: b[KEY_VOICE_DIAG] || null,
    venueSeatsDiag: b[KEY_VENUE_SEATS_DIAG] || null,
    reportPreview: isReportPreviewFresh(reportPreviewRec, nowMs) ? reportPreviewRec : null,
    laneDiag: b[KEY_LANE_DIAG] || null,
    laneMirror: b[KEY_LANE_MIRROR] || null,
    statCardsMirror: b[KEY_STAT_CARDS_MIRROR] || null,
    northStarMirror: b[KEY_NORTH_STAR_MIRROR] || null,
    publishOutcomeRec: b[KEY_LIVEVIEW_PUBLISH_OUTCOME] || null,
    commentTimelineMirror: b[KEY_COMMENT_TIMELINE_MIRROR] || null,
    previewRenderAck: b[KEY_PREVIEW_RENDER_ACK] || null,
    backfillLiveMetric: b[KEY_BACKFILL_LIVE_METRIC] || null,
    giftEffectDiag: b[KEY_GIFT_EFFECT_DIAG] || null,
    milestoneEffectDiag: b[KEY_MILESTONE_EFFECT_DIAG] || null,
    voiceEffectDiag: b[KEY_VOICE_EFFECT_DIAG] || null,
    bgmPhaseDiag: b[KEY_BGM_PHASE_DIAG] || null,
    opSoundEffectDiag: b[KEY_OP_SOUND_EFFECT_DIAG] || null,
    commentPostDiag: b[KEY_COMMENT_POST_DIAG] || null,
    instantPushDiag: b[KEY_INSTANT_PUSH_DIAG] || null,
    channelSwitchDiag: b[KEY_CHANNEL_SWITCH_DIAG] || null
  };
}
