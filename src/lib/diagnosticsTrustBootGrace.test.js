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

/**
 * ★v0.1.1303: v0.1.1302 が実機で効かなかった件の回帰。
 *
 * ■ 実機の値(2026-08-10)
 *     popup 起動から 4.3 秒後の値 / 鏡は 8秒前 の値 / それでも 🔴
 *   時系列に直すと status が鏡を読んだのは popup 起動の【3.7秒前】。
 *   まだ存在しないものを読んだので null なのは当然だが、
 *   v0.1.1302 の猶予は「popup 起動から3秒未満」だけを見ていたので効かなかった。
 *
 * ■ 正しい問い
 *   「popup が若いか」ではなく【読んだ時点で popup は書ける状態だったか】。
 */
describe('読んだ時点で popup が起動していなければ保留(実機タイムライン)', () => {
  const realDevice = (over = {}) => ({
    hasWatchTab: true,
    currentLiveId: 'lv1',
    popupDiag: popupDiag(4297), // popup 起動から4.3秒
    jsonBlob: {},
    publishOutcome: null,
    extrasAgeMs: 8000, // 鏡は8秒前に読まれた値
    nowMs: NOW,
    ...over
  });

  it('★実機と同じ値(起動4.3秒・鏡8秒前)で🔴にしない', () => {
    const t = buildDiagnosticsTrust(realDevice());
    expect(t.mirrors.lane.pending).toBe(true);
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).not.toContain('応援レーン鏡: 🔴 なし');
    expect(text).toContain('popup 起動の3.7秒【前】');
  });

  it('★読んだのが popup 起動より【後】で鏡が無いなら、本物の欠落として🔴', () => {
    // 起動30秒・鏡は1秒前に読んだ = popup には書く時間が十分あった
    const t = buildDiagnosticsTrust(realDevice({ popupDiag: popupDiag(30_000), extrasAgeMs: 1000 }));
    expect(t.mirrors.lane.pending).toBeUndefined();
    expect(formatDiagnosticsTrustLines(t).join('\n')).toContain('応援レーン鏡: 🔴 なし');
  });

  it('★extrasAgeMs が無いときは従来どおり popup 起動基準にフォールバック', () => {
    const young = buildDiagnosticsTrust(realDevice({ popupDiag: popupDiag(1000), extrasAgeMs: null }));
    expect(young.mirrors.lane.pending).toBe(true);
    const old = buildDiagnosticsTrust(realDevice({ popupDiag: popupDiag(30_000), extrasAgeMs: null }));
    expect(old.mirrors.lane.pending).toBeUndefined();
  });

  it('★verdict も「そのまま信頼できる」と言わない', () => {
    const t = buildDiagnosticsTrust(realDevice());
    expect(t.verdict).toBe('popup_just_booted');
    expect(formatDiagnosticsTrustLines(t).join('\n')).not.toContain('そのまま信頼できます');
  });
});

/**
 * ★v0.1.1303: 3画面パリティも「鏡がまだ書かれる前」なら保留にする。
 *
 * ■ 実機(2026-08-10)
 *     🔴不一致: 北極星 貢献度 拡張3≠鏡0
 *   しかし同じ速報の鏡は「popup 起動の3.7秒前」に読まれた値だった。
 *   拡張側は【今】・鏡側は【popup が書く前】= 別の瞬間どうしの比較。
 *   これを🔴で出したため、開発者が鏡 publish を3回追いかけて空振りした。
 */
describe('パリティ: 鏡が未着なら件数突合を保留にする', () => {
  it('★trust の鏡が pending なら mismatch を出さない', async () => {
    const { buildParityVerdict } = await import('./parityVerdict.js');
    const trust = buildDiagnosticsTrust({
      hasWatchTab: true,
      currentLiveId: 'lv1',
      popupDiag: popupDiag(4297),
      jsonBlob: {},
      publishOutcome: null,
      extrasAgeMs: 8000,
      nowMs: NOW
    });
    expect(trust.mirrors.northStar.pending).toBe(true);
    const v = buildParityVerdict({
      trust,
      // 実機と同じ: 拡張3件 vs 鏡0件の不一致が consistency に入っている
      publishSelfDiag: {
        consistency: [{ lane: '北極星 貢献度', extRows: 3, mirrorRows: 0, match: false }],
        publish: { ready: true }
      },
      laneRenderDiag: { started: 1 },
      northStarProbe: { refreshAllStarted: 1 },
      previewAck: null,
      currentLiveId: 'lv1',
      nowMs: NOW
    });
    expect(v.verdict).not.toBe('mismatch');
    expect(v.code).toBe('mirror_not_yet_written');
  });
});
