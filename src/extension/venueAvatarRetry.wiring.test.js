import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const venueBarSrc = fs.readFileSync(path.join(here, 'venueBar.js'), 'utf8');

/**
 * venue-avatar-stale-mirror-DESIGN.md 段階1(§C-1b/1c/1d)の venueBar.js 側配線を
 * ソース文字列で断言する。会場サムネ白丸の根治(負キャッシュTTL+バックオフ再プローブ+
 * 鏡世代前進時のtimeoutリセット)が実際に配線されているかを機械的に保証する
 * ([[fastdiag-lite-is-the-printer-subset]]と同型の「計器/機構を足してもwiring忘れで
 * 死んでいる」を防ぐ)。
 */
describe('venue avatar retry wiring (venueBar.js §C-1b/1c/1d)', () => {
  it('venueAvatarLoadGuardはretryPolicyをopt-inで有効化している(popup側は既定nullのまま)', () => {
    const start = venueBarSrc.indexOf('const venueAvatarLoadGuard = createSupportAvatarLoadGuard({');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = venueBarSrc.indexOf('});', start);
    const block = venueBarSrc.slice(start, end);
    expect(block).toContain('retryPolicy:');
  });

  it('diagDueブロックでretrySweepが既存の3秒min-gapに相乗りしている(新規タイマーなし)', () => {
    const diagDueIdx = venueBarSrc.indexOf('const diagDue = nowMs() - _venueSeatsDiagLastWriteAt >= 3000;');
    expect(diagDueIdx).toBeGreaterThanOrEqual(0);
    const ifDiagDueIdx = venueBarSrc.indexOf('if (diagDue) {', diagDueIdx);
    expect(ifDiagDueIdx).toBeGreaterThan(diagDueIdx);
    const after = venueBarSrc.slice(ifDiagDueIdx, ifDiagDueIdx + 400);
    expect(after).toContain('venueAvatarLoadGuard.retrySweep(venueLaneEls.stack, laneWallNow)');
  });

  it('composeVenueBaseRowsが鏡capturedAt前進時にclearTimedOutFailures(timeout種別のみ)を呼ぶ', () => {
    const start = venueBarSrc.indexOf('const composeVenueBaseRows = (candidates, fallbackRows) => {');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = venueBarSrc.indexOf('\n  };', start);
    const block = venueBarSrc.slice(start, end);
    expect(block).toContain('laneMirrorPaintSnap = laneMirrorSnap;');
    expect(block).toContain('venueAvatarLoadGuard.clearTimedOutFailures();');
    // clearFailedUrls(全消し)は使わない(§G-1: succeededKeysも消えて全タイルが一瞬白丸に戻る)。
    expect(block).not.toContain('venueAvatarLoadGuard.clearFailedUrls()');
    // 前進検知はlaneMirrorPaintSnapの確定後(TOCTOU排除の既存契約を壊さない)。
    expect(block.indexOf('laneMirrorPaintSnap = laneMirrorSnap;')).toBeLessThan(
      block.indexOf('venueAvatarLoadGuard.clearTimedOutFailures();')
    );
  });

  it('_lastPaintedMirrorCapturedAtが単調前進判定に使われている(前進のときだけリセット)', () => {
    expect(venueBarSrc).toContain('let _lastPaintedMirrorCapturedAt = 0;');
    expect(venueBarSrc).toContain('cap > _lastPaintedMirrorCapturedAt');
  });
});
