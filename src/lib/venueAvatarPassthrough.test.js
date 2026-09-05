/**
 * 会場のアイコン実績が【書き手 → snapshot → 速報の行】まで貫通するかの通し検査(v0.1.1348)。
 *
 * ★なぜ要るか(2026-08-12・私自身が踏んだ穴)
 *   v0.1.1347 で読み手(aiShareFullText)に `venueSeatsDiag.avatarProbe` を読む行を足したが、
 *   書き手(venueBar の seatsDiagObs)にも snapshot の whitelist にも avatarProbe が無く、
 *   **永久に出ない行**を出荷した。通し確認を怠ったのが原因。
 *   ＝[[verify-output-appears-before-shipping]] の再演であり、
 *     [[venue-mirror-is-the-primary-path]]「個別列挙して作り直す関数が値を落とす」の6回目。
 *
 * ★fixture は【書き手の実出力形】から採る([[gate-fixture-must-come-from-the-writer]])。
 *   supportGrowthAvatarLoad.js の getDiagnostics() が返す形に一致させている。
 */
import { describe, expect, it } from 'vitest';
import { buildVenueSeatsDiagSnapshot, makeInitialVenueSeatsDiag } from './venueSeatsDiag.js';
import { formatVenueAvatarLine } from './venueAvatarReport.js';
import { readFileSync } from 'node:fs';

/** getDiagnostics() の実出力形(会場の guard が返すもの)。 */
const WRITER_OUTPUT = {
  usericonSucceeded: 1,
  usericonFailed: 2,
  failedTimeout: 1,
  failedError: 1,
  retriedTotal: 0,
  lastFailAgoMs: 154,
  // ★実際には他のフィールドも含むが、snapshot は通さない設計(未知は写さない)。
  failedUsericonSamples: ['https://example/x.jpg'],
  succeededTotal: 1,
  failedTotal: 2
};

describe('会場アイコン実績の貫通(書き手 → snapshot → 行)', () => {
  it('★書き手(venueBar)が seatsDiagObs のトップレベルに載せている', () => {
    const src = readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');
    // census の extras 経由ではなく、publishVenueSeatsDiag に渡す obs 自体に載っていること。
    expect(src).toContain('avatarProbe: venueAvatarLoadGuard.getDiagnostics()');
    const obsBlock = src.slice(src.lastIndexOf('mirrorIntakeLine: formatVenueMirrorIntakeLine'), src.indexOf('publishVenueSeatsDiag(seatsDiagObs)'));
    expect(obsBlock).toContain('avatarProbe');
  });

  it('★初期状態に avatarProbe がある(載せ忘れると静かに消える)', () => {
    expect(makeInitialVenueSeatsDiag()).toHaveProperty('avatarProbe', null);
  });

  it('★snapshot が avatarProbe を通す(v1347 はここで落ちていた)', () => {
    const snap = buildVenueSeatsDiagSnapshot({ avatarProbe: WRITER_OUTPUT }, 1000);
    expect(snap.avatarProbe).not.toBeNull();
    expect(snap.avatarProbe.usericonSucceeded).toBe(1);
    expect(snap.avatarProbe.usericonFailed).toBe(2);
    expect(snap.avatarProbe.failedTimeout).toBe(1);
    expect(snap.avatarProbe.failedError).toBe(1);
    expect(snap.avatarProbe.retriedTotal).toBe(0);
  });

  it('未知フィールドは通さない(既存方針=巨大オブジェクトを写さない)', () => {
    const snap = buildVenueSeatsDiagSnapshot({ avatarProbe: WRITER_OUTPUT }, 1000);
    expect(snap.avatarProbe).not.toHaveProperty('failedUsericonSamples');
    expect(snap.avatarProbe).not.toHaveProperty('succeededTotal');
  });

  it('avatarProbe が無ければ null(壊れず未計測として扱う)', () => {
    expect(buildVenueSeatsDiagSnapshot({}, 1000).avatarProbe).toBeNull();
    expect(buildVenueSeatsDiagSnapshot({ avatarProbe: 'x' }, 1000).avatarProbe).toBeNull();
  });

  it('★通し: 書き手の実出力から【速報の行が実際に生成される】', () => {
    const snap = buildVenueSeatsDiagSnapshot({ avatarProbe: WRITER_OUTPUT }, 1000);
    const line = formatVenueAvatarLine(snap.avatarProbe);
    expect(line).toContain('会場のアイコン');
    expect(line).toContain('🔴'); // 失敗率67%
    expect(line).toContain('成功1');
    expect(line).toContain('★再取得0回'); // 実測と同じ状況を再現
  });

  it('★通し: 全部成功なら ✅ の行になる', () => {
    const snap = buildVenueSeatsDiagSnapshot(
      { avatarProbe: { usericonSucceeded: 20, usericonFailed: 0, retriedTotal: 0 } },
      1000
    );
    const line = formatVenueAvatarLine(snap.avatarProbe);
    expect(line).toContain('✅');
    expect(line).toContain('成功20');
  });
});
