import { describe, expect, it } from 'vitest';
import { buildDiagnosticsTrust, formatDiagnosticsTrustLines } from './diagnosticsTrust.js';

/**
 * ★v0.1.1302: 起動直後の「鏡なし」を🔴にしない(開発者の誤読を構造で潰す)。
 *
 * ■ 何が起きたか(2026-08-09)
 *   起動 3.3秒 で撮った速報が「応援レーン鏡🔴なし ×3」を出し、開発者はこれを
 *   「publish の取りこぼし」と読んで書き手側を3回追いかけ、全部空振りした。
 *   実際は publish は正常(初回 flush は min-gap を待たず 400ms で載る)で、
 *   🔴 の出どころは読み取り側(補助データは12秒キャッシュ・初期値 null)。
 *
 * ■ さらに悪かった点
 *   同じ速報が「🟢 そのまま信頼できます」と断言していた。
 *   🔴 と 🟢 が同居していたため、読み手は🔴を本物だと信じた。
 */
const NOW = 1_700_000_000_000;

/** popup 診断(起動からの経過を shadeAgeMs で与える)。 */
function popupDiag(shadeAgeMs, lid = 'lv1') {
  return {
    persistedAt: NOW - 1000,
    popup: {
      watchSnapshotMeta: { liveId: lid },
      loadShadeProbe: { shadeAgeMs }
    }
  };
}

const baseArgs = (shadeAgeMs, blob = {}) => ({
  hasWatchTab: true,
  currentLiveId: 'lv1',
  popupDiag: popupDiag(shadeAgeMs),
  jsonBlob: blob,
  publishOutcome: null,
  nowMs: NOW
});

describe('起動直後(3秒未満)は鏡の未着を⏳にする', () => {
  it('★鏡が無くても🔴ではなく判定保留になる', () => {
    const t = buildDiagnosticsTrust(baseArgs(1000));
    expect(t.mirrors.lane.pending).toBe(true);
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).toContain('⏳ 判定保留');
    expect(text).not.toContain('応援レーン鏡: 🔴 なし');
  });

  it('★「そのまま信頼できます」と断言しない(🔴と🟢の同居を防ぐ)', () => {
    const t = buildDiagnosticsTrust(baseArgs(1000));
    expect(t.verdict).toBe('popup_just_booted');
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).not.toContain('そのまま信頼できます');
    expect(text).toContain('開いた直後の値');
  });

  it('★起動から十分たっていれば従来どおり🔴(本物の欠落は隠さない)', () => {
    const t = buildDiagnosticsTrust(baseArgs(30_000));
    expect(t.mirrors.lane.pending).toBeUndefined();
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).toContain('応援レーン鏡: 🔴 なし');
  });

  it('★shadeAgeMs が取れない(null)なら猶予を与えない(0秒と偽らない)', () => {
    /*
     * ★Number(null)===0 なので、null ガードが無いと「取れなかった」を
     *   「起動0秒」と読んで【全部⏳】にしてしまう=本物の欠落を隠す。
     *   popupDiagUptimeNote.js:22 と同じ防御。
     */
    const t = buildDiagnosticsTrust(baseArgs(null));
    expect(t.mirrors.lane.pending).toBeUndefined();
    expect(formatDiagnosticsTrustLines(t).join('\n')).toContain('🔴 なし');
  });

  it('★負値・非数値も猶予を与えない', () => {
    expect(buildDiagnosticsTrust(baseArgs(-1)).mirrors.lane.pending).toBeUndefined();
    expect(buildDiagnosticsTrust(baseArgs('abc')).mirrors.lane.pending).toBeUndefined();
  });

  it('鏡が実在すれば起動直後でも通常表示(⏳で塗り潰さない)', () => {
    const t = buildDiagnosticsTrust(
      baseArgs(1000, { laneMirror: { capturedAt: NOW - 500, liveId: 'lv1' } })
    );
    expect(t.mirrors.lane.present).toBe(true);
    expect(t.mirrors.lane.pending).toBeUndefined();
    expect(formatDiagnosticsTrustLines(t).join('\n')).toContain('応援レーン鏡: ✅あり');
  });
});
