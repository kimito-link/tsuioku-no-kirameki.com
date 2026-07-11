import { describe, expect, it } from 'vitest';
import {
  markWatchPopupLoadPhase,
  snapshotWatchPopupLoadPhase
} from './watchPopupLoadDiagnostics.js';

describe('watchPopupLoadDiagnostics(v0.1.1123: 直近フェーズの常時記録)', () => {
  it('mark は debug フラグ無しでも直近フェーズを保持し snapshot で読める', () => {
    markWatchPopupLoadPhase('shade_clear');
    const s = snapshotWatchPopupLoadPhase();
    expect(s.phase).toBe('shade_clear');
    expect(s.agoMs).toBeGreaterThanOrEqual(0);
  });

  it('未記録(初期)状態でも throw せず phase 空を返す構造(別インスタンスでは検証不能なので形のみ)', () => {
    const s = snapshotWatchPopupLoadPhase(0);
    expect(typeof s.phase).toBe('string');
    expect('agoMs' in s).toBe(true);
  });
});
