import { describe, expect, it } from 'vitest';
import { buildDiagnosticsTrust, formatDiagnosticsTrustLines } from './diagnosticsTrust.js';
import { buildParityVerdict } from './parityVerdict.js';
import { buildPopupDiagUptimeNote } from './popupDiagUptimeNote.js';

/**
 * ★v0.1.1304: 判定者どうしが矛盾しないことの証明(このタスクの成功判定の核)。
 *
 * ■ なぜこのテストが要るか(2026-08-10・同じ症状に7版を費やした構造)
 *   状態速報の冒頭には【3人の判定者】が並ぶ:
 *     - parityVerdict        (aiShareFullText.js:203)   … 3画面パリティ
 *     - diagnosticsTrust     (aiShareFullText.js:219)   … 信頼性ヘッダ
 *     - popupDiagUptimeNote  (aiShareFullText.js:557)   … popup 診断の齢
 *   この3人が【別々の基準】で判定していたため、同じ速報に
 *   「⏳起動直後です」と「🔴取りこぼし」が同居し、開発者は🔴を信じて3回空振りした。
 *
 * ■ このテストが固定する不変条件
 *   同一のスナップショットに対して、
 *     trust が「まだ書かれていない(pending)」と判断した鏡について
 *     parityVerdict が「取りこぼし(mismatch)」を出す
 *   という組合せが【存在しない】こと。7版事件の機序の直接否定形。
 *
 * ★挙動テスト(実際に関数を呼んで戻り値を断言)なので、
 *   判定を `if(false)` で殺すと必ず赤くなる=恒真にならない。
 */
const NOW = 1_700_000_000_000;

/** popup 診断(起動からの経過 shadeAgeMs を持つ)。 */
function popupDiagWith(shadeAgeMs, lid = 'lv1') {
  return {
    persistedAt: NOW - 1000,
    popup: {
      watchSnapshotMeta: { liveId: lid },
      loadShadeProbe: { shadeAgeMs },
      northStarRenderProbe: { refreshAllStarted: 1, refreshAllCompleted: 1 }
    }
  };
}

/** 実機と同型の「拡張にはあるが鏡は空」の不一致。 */
const CONSISTENCY_MISMATCH = [
  { lane: '北極星 貢献度', extRows: 3, mirrorRows: 0, match: false },
  { lane: '北極星 広告', extRows: 10, mirrorRows: 0, match: false }
];

function judgeBoth({ shadeAgeMs, extrasAgeMs, mirrorPresent }) {
  const blob = mirrorPresent
    ? {
        laneMirror: { capturedAt: NOW - 500, liveId: 'lv1' },
        statCardsMirror: { capturedAt: NOW - 500, liveId: 'lv1' },
        northStarMirror: { capturedAt: NOW - 500, liveId: 'lv1' }
      }
    : {};
  const trust = buildDiagnosticsTrust({
    hasWatchTab: true,
    currentLiveId: 'lv1',
    popupDiag: popupDiagWith(shadeAgeMs),
    jsonBlob: blob,
    publishOutcome: null,
    extrasAgeMs,
    nowMs: NOW
  });
  const parity = buildParityVerdict({
    trust,
    publishSelfDiag: { consistency: CONSISTENCY_MISMATCH, publish: { ready: true } },
    laneRenderDiag: { started: 1 },
    northStarProbe: { refreshAllStarted: 1 },
    previewAck: null,
    currentLiveId: 'lv1',
    nowMs: NOW
  });
  return { trust, parity };
}

describe('判定者間の無矛盾(trust ⇄ parityVerdict)', () => {
  it('★実機2026-08-10の再現(起動4.3秒・鏡8秒前)で両者が矛盾しない', () => {
    const { trust, parity } = judgeBoth({
      shadeAgeMs: 4297,
      extrasAgeMs: 8000,
      mirrorPresent: false
    });
    expect(trust.mirrors.lane.pending).toBe(true);
    // trust が保留と言うなら parity も mismatch を出してはいけない。
    expect(parity.verdict).not.toBe('mismatch');
  });

  it('★全格子: pending の鏡に対し parityVerdict は mismatch を出さない', () => {
    /*
     * (writerBootAgoMs, readAgoMs) を格子状に振り、
     * trust が pending としたすべての点で parity が mismatch でないことを断言する。
     * ★1点でも破れれば「速報の中で判定が矛盾する」=7版事件の再来。
     */
    const bootGrid = [0, 500, 1000, 2000, 2999, 3000, 4297, 6000, 10_000, 15_000];
    const readGrid = [0, 500, 1000, 3000, 8000, 12_000, 20_000];
    /** @type {string[]} */
    const violations = [];
    for (const shadeAgeMs of bootGrid) {
      for (const extrasAgeMs of readGrid) {
        const { trust, parity } = judgeBoth({ shadeAgeMs, extrasAgeMs, mirrorPresent: false });
        const pending =
          trust.mirrors.lane.pending === true ||
          trust.mirrors.stat.pending === true ||
          trust.mirrors.northStar.pending === true;
        if (pending && parity.verdict === 'mismatch') {
          violations.push(`boot=${shadeAgeMs} read=${extrasAgeMs} → ${parity.reason}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('★全格子(値あり): 鏡が存在するときも矛盾しない', () => {
    const bootGrid = [0, 1000, 4297, 30_000];
    const readGrid = [0, 1000, 8000, 20_000];
    /** @type {string[]} */
    const violations = [];
    for (const shadeAgeMs of bootGrid) {
      for (const extrasAgeMs of readGrid) {
        const { trust, parity } = judgeBoth({ shadeAgeMs, extrasAgeMs, mirrorPresent: true });
        const pending =
          trust.mirrors.lane.pending === true ||
          trust.mirrors.stat.pending === true ||
          trust.mirrors.northStar.pending === true;
        // 鏡が存在するなら pending にはならない(存在する値は保留しない)。
        if (pending) violations.push(`boot=${shadeAgeMs} read=${extrasAgeMs} で present なのに pending`);
        // ★鏡が揃っているのだから、保留を理由にしたパリティ保留も出てはいけない
        //   (「鏡がまだ書かれる前」は事実に反する)。
        if (parity.code === 'mirror_not_yet_written') {
          violations.push(`boot=${shadeAgeMs} read=${extrasAgeMs} で鏡ありなのに未書込扱い`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('★保留は🔴を無限には隠さない(書く時間が十分あったのに無ければ mismatch を許す)', () => {
    /*
     * 起動30秒・読んだのは1秒前=書き手には29秒の猶予があった。
     * それでも鏡が無いなら、これは本物の欠落。保留に倒してはいけない。
     */
    const { trust, parity } = judgeBoth({
      shadeAgeMs: 30_000,
      extrasAgeMs: 1000,
      mirrorPresent: false
    });
    expect(trust.mirrors.lane.pending).toBeUndefined();
    // ここで parity が mismatch を出すのは【正しい】(本物の不一致を隠さない)。
    expect(parity.verdict).toBe('mismatch');
  });
});

describe('判定者間の無矛盾(trust ⇄ popupDiagUptimeNote)', () => {
  it('★uptimeNote が「起動直後だから正常」と言う条件で trust は鏡🔴を出さない', () => {
    /*
     * 3人目の判定者。同じ猶予(WRITER_BOOT_GRACE_MS)を見ていることの挙動証明。
     * 以前は uptimeNote だけがリテラル 3000 を持ち、trust は独自定数を持っていた。
     */
    const shadeAgeMs = 1000; // 猶予の内側
    const note = buildPopupDiagUptimeNote(shadeAgeMs);
    expect(note).toContain('起動直後のため');

    const { trust } = judgeBoth({ shadeAgeMs, extrasAgeMs: 0, mirrorPresent: false });
    const text = formatDiagnosticsTrustLines(trust).join('\n');
    expect(text).not.toContain('応援レーン鏡: 🔴 なし');
  });

  it('★uptimeNote が警告しない条件では trust も通常判定(🔴を出しうる)', () => {
    const shadeAgeMs = 30_000; // 猶予の外側
    const note = buildPopupDiagUptimeNote(shadeAgeMs);
    expect(note).not.toContain('起動直後のため');

    const { trust } = judgeBoth({ shadeAgeMs, extrasAgeMs: 1000, mirrorPresent: false });
    const text = formatDiagnosticsTrustLines(trust).join('\n');
    expect(text).toContain('応援レーン鏡: 🔴 なし');
  });
});
