/**
 * 鏡バンドル以外の自己書き込みキー3種が登録されているかの機械照合(v0.1.1503)。
 *
 * ★なぜ要るか(2026-08-23・v0.1.1484の内訳計器で確定)
 *   描き直し1,106回のうち storage 更新が97%を占め、最多3つのうち
 *   nls_watch_snapshot_* / ai_share_fast_diag / status_fast_diag_lite の2種(33.3%)は
 *   isHighFrequencyCommentRelatedStorageKey が false で、popupStorageRefreshCoalesce.js の
 *   allHighFreq 判定に混ざると450msスロットルを丸ごと素通りしていた。
 *
 * ★selfWrittenCoversMirrorBundle.test.js は【鏡9種専用】(「鏡は9種ある」を固定済み)なので、
 *   鏡ではないこの3種はそちらを拡張せず別ファイルで守る。
 *
 * ★v0.1.1345の教訓を踏まえ、定数名ではなく【実際に生成されるキー文字列】で照合する。
 */
import { describe, expect, it } from 'vitest';
import { watchSnapshotStorageKey } from './storageKeys.js';
import { KEY_AI_SHARE_FAST_DIAG } from './aiShareFastDiagKey.js';
import { KEY_STATUS_FAST_DIAG_LITE } from './statusFastDiagLite.js';
import { isSelfWrittenRenderArtifactKey } from './selfWrittenStorageKeys.js';

describe('鏡以外の自己書き込みキー3種が登録されている', () => {
  it('★空振り防止: 実キー文字列がどれも空でない', () => {
    const snapKey = watchSnapshotStorageKey('lv351156267');
    expect(snapKey.length).toBeGreaterThan(0);
    expect(KEY_AI_SHARE_FAST_DIAG.length).toBeGreaterThan(0);
    expect(KEY_STATUS_FAST_DIAG_LITE.length).toBeGreaterThan(0);
  });

  it('nls_watch_snapshot_<lv> (popup自身のcached-first write-through) が登録済み', () => {
    expect(isSelfWrittenRenderArtifactKey(watchSnapshotStorageKey('lv351156267'))).toBe(true);
  });

  it('複数の配信IDでも一致する(per-live キーの実測パターン)', () => {
    expect(isSelfWrittenRenderArtifactKey(watchSnapshotStorageKey('lv1'))).toBe(true);
    expect(isSelfWrittenRenderArtifactKey(watchSnapshotStorageKey('lv999999999999999'))).toBe(true);
  });

  it('KEY_AI_SHARE_FAST_DIAG (純粋な診断キー) が登録済み', () => {
    expect(isSelfWrittenRenderArtifactKey(KEY_AI_SHARE_FAST_DIAG)).toBe(true);
  });

  it('KEY_STATUS_FAST_DIAG_LITE (status.html が自前ループで読む軽量ダイジェスト) が登録済み', () => {
    expect(isSelfWrittenRenderArtifactKey(KEY_STATUS_FAST_DIAG_LITE)).toBe(true);
  });

  it('★panel_summary は意図的に含めない(watchUrlFreshnessの生存確認と衝突するため)', () => {
    // ★誤って含めてしまう回帰を防ぐ。含めたい場合は watchUrlFreshness.js の
    //   読み手を先に洗ってから、このアサーションごと見直すこと。
    expect(isSelfWrittenRenderArtifactKey('nls_panel_summary_lv351156267')).toBe(false);
  });
});
