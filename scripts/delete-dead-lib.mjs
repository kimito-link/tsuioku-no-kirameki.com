// scripts/delete-dead-lib.mjs — 死蔵lib実装ファイルとそのテストを削除
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const libDir = path.join(root, 'src/lib');

const dead = [
  'aiShareContentDiagnosticsMerge.js',
  'asyncGuard.js',
  'audienceInterestGeminiPrompt.js',
  'celebrationTailScanSession.js',
  'concurrentCalibrationDashboardHtml.js',
  'contributionRankingListView.js',
  'danmakuLaneScheduler.js',
  'dedupBatch.js',
  'disclosureEvidenceExport.js',
  'disclosureRequestMode.js',
  'extensionHealthV1.js',
  'externalPollCoordinator.js',
  'formatAiShareDiagnosticsMarkdown.js',
  'formatNorthStarVerticalRailHtml.js',
  'formatNorthStarWaitHintsRailHtml.js',
  'giftDiagnosticsForAiShare.js',
  'giftRankStripPopupSync.js',
  'giftRankStripPrep.js',
  'giftRankStripStableKey.js',
  'giftRevenueEstimate.js',
  'giftTimelineHtml.js',
  'interceptBinaryTextExtract.js',
  'interceptViewerJoinSignals.js',
  'interceptVisitorProbeDebug.js',
  'latestSnapshot.js',
  'manualGiftPersistClickTarget.js',
  'mergeStoredCommentsWithIntercept.js',
  'migrateClearStaleSelfPosted.js',
  'ndgrMessageDedupe.js',
  'nicoGiftHudParse.js',
  'nicoliveVisitorSignalProbe.js',
  'niconicoInterceptLearn.js',
  'northStarWaitCharaSrc.js',
  'noWatchRankingHintGate.js',
  'pageMessageDispatch.js',
  'popupAiShareDiagnosticsPayload.js',
  'popupTreatNoActiveWatch.js',
  'popupWatchUrlResolve.js',
  'rankStripSectionLabels.js',
  'reportGiftNdgrSectionHtml.js',
  'requestThrottle.js',
  'safeOptional.js',
  'ttlCache.js',
  'uiUxOpenStrategy.js',
  'wsStatisticsExtract.js',
  'yukkuriGeminiSummary.js',
];

let deletedImpl = 0, deletedTest = 0;

for (const f of dead) {
  const impl = path.join(libDir, f);
  const test = path.join(libDir, f.replace('.js', '.test.js'));
  if (fs.existsSync(impl)) { fs.rmSync(impl); deletedImpl++; console.log('削除:', f); }
  if (fs.existsSync(test)) { fs.rmSync(test); deletedTest++; console.log('削除:', f.replace('.js', '.test.js')); }
}

console.log(`\n完了: 実装 ${deletedImpl}件 + テスト ${deletedTest}件 削除`);
